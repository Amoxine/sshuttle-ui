use std::collections::VecDeque;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use parking_lot::RwLock;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use crate::error::{AppError, AppResult};

use super::command::{SpawnContext, SshAuth, SshuttleConfig};
use super::event::{ConnectionPhase, LogLevel, RuntimeEvent, RUNTIME_EVENT};

/// Lightweight, async check: are sudo's cached credentials valid right now?
async fn sudo_creds_cached() -> bool {
    let status = tokio::process::Command::new("sudo")
        .args(["-n", "-v"])
        .env("PATH", super::resolver::extended_path())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await;
    matches!(status, Ok(s) if s.success())
}

const MAX_LOG_BUFFER: usize = 5_000;

/// Information about the active connection (or last attempted one).
#[derive(Debug, Clone, Serialize)]
pub struct ConnectionState {
    pub phase: ConnectionPhase,
    pub profile_id: Option<String>,
    pub profile_name: Option<String>,
    pub command_preview: Option<String>,
    pub started_at: Option<chrono::DateTime<Utc>>,
    pub message: Option<String>,
    pub history_id: Option<i64>,
}

impl Default for ConnectionState {
    fn default() -> Self {
        Self {
            phase: ConnectionPhase::Idle,
            profile_id: None,
            profile_name: None,
            command_preview: None,
            started_at: None,
            message: None,
            history_id: None,
        }
    }
}

/// Thread-safe handle controlling a running sshuttle process and ferrying
/// events to the Tauri event bus.
#[derive(Clone)]
pub struct SshuttleManager {
    state: Arc<RwLock<ConnectionState>>,
    inner: Arc<Mutex<Option<RunningProcess>>>,
    log_buffer: Arc<RwLock<VecDeque<LogLine>>>,
    app: AppHandle,
}

struct RunningProcess {
    child: Child,
    cancel: CancellationToken,
    _readers: Vec<JoinHandle<()>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LogLine {
    pub level: LogLevel,
    pub line: String,
    pub timestamp: chrono::DateTime<Utc>,
}

impl SshuttleManager {
    pub fn new(app: AppHandle) -> Self {
        Self {
            state: Arc::new(RwLock::new(ConnectionState::default())),
            inner: Arc::new(Mutex::new(None)),
            log_buffer: Arc::new(RwLock::new(VecDeque::with_capacity(MAX_LOG_BUFFER))),
            app,
        }
    }

    pub fn state(&self) -> ConnectionState {
        self.state.read().clone()
    }

    pub fn logs(&self, limit: usize) -> Vec<LogLine> {
        let buf = self.log_buffer.read();
        let limit = limit.min(buf.len());
        buf.iter().rev().take(limit).rev().cloned().collect()
    }

    pub fn clear_logs(&self) {
        self.log_buffer.write().clear();
    }

    pub fn is_running(&self) -> bool {
        self.state.read().phase.is_active()
    }

    /// Start sshuttle with the given configuration. Fails if a tunnel is
    /// already running.
    ///
    /// `saved_password` is consumed (and zeroed-out from the caller's reach
    /// once moved into the child env) when `config.auth == Password`.
    pub async fn start(
        &self,
        config: &SshuttleConfig,
        profile_id: Option<&str>,
        profile_name: Option<&str>,
        sudo: bool,
        saved_password: Option<String>,
    ) -> AppResult<ConnectionState> {
        if self.is_running() {
            return Err(AppError::AlreadyRunning);
        }
        config.validate()?;

        let bin = super::resolver::find_sshuttle().ok_or(AppError::SshuttleMissing)?;

        // Resolve sshpass when the profile uses password auth.
        let sshpass_bin = if matches!(config.auth, SshAuth::Password) {
            let p = super::resolver::find_in_known_dirs("sshpass").ok_or_else(|| {
                AppError::Invalid(
                    "sshpass not found. Install it for non-interactive password auth: \
                     `brew install hudochenkov/sshpass/sshpass` (macOS) or \
                     `apt install sshpass` (Debian/Ubuntu). Alternatively, switch the \
                     profile to SSH key or agent auth."
                        .into(),
                )
            })?;
            Some(p)
        } else {
            None
        };

        if matches!(config.auth, SshAuth::Password) && saved_password.is_none() {
            return Err(AppError::Invalid(
                "no saved password for this profile. Save one from the profile editor \
                 (it's stored in the OS keychain) before connecting."
                    .into(),
            ));
        }

        let ctx = SpawnContext {
            sshpass_bin: sshpass_bin.clone(),
        };

        let mut cmd: Command;
        if sudo {
            // Pre-flight: refuse to spawn unless sudo creds are cached.
            // Without this, sudo would prompt on a tty we don't have, and
            // sshuttle would die later with the cryptic
            // "fw: fatal: You must have root privileges" message.
            if !sudo_creds_cached().await {
                return Err(AppError::Invalid(
                    "sudo password not cached. Authenticate from the dialog before connecting.".into(),
                ));
            }

            let sudo_path = super::resolver::find_in_known_dirs("sudo")
                .unwrap_or_else(|| std::path::PathBuf::from("sudo"));
            cmd = Command::new(sudo_path);
            // -E preserves SSHPASS and PATH across the privilege boundary;
            // -n makes sudo bail loudly instead of waiting on a phantom tty
            // if the cache somehow expired between the check above and now.
            cmd.arg("-E").arg("-n").arg(&bin);
        } else {
            cmd = Command::new(&bin);
        }
        cmd.args(config.build_args_with(&ctx))
            // Augment PATH so sshuttle's own child invocations (ssh, python3,
            // sshpass) resolve correctly even when the .app inherits a bare
            // PATH from the macOS Finder / Dock.
            .env("PATH", super::resolver::extended_path())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null())
            .kill_on_drop(true);

        // Pass the password via env so it never appears in argv or in any
        // log line. `sshpass -e` reads exactly this var.
        if let Some(pwd) = saved_password {
            cmd.env("SSHPASS", pwd);
        }

        // Mark the new state before spawning so the UI updates immediately.
        {
            let mut s = self.state.write();
            *s = ConnectionState {
                phase: ConnectionPhase::Starting,
                profile_id: profile_id.map(str::to_string),
                profile_name: profile_name.map(str::to_string),
                command_preview: Some(config.preview_command()),
                started_at: Some(Utc::now()),
                message: None,
                history_id: None,
            };
        }
        self.emit_phase("Starting sshuttle…");

        let mut child = cmd.spawn().map_err(|e| {
            self.set_phase(ConnectionPhase::Failed, Some(format!("spawn failed: {e}")));
            AppError::Io(e)
        })?;

        let stdout = child.stdout.take().expect("piped stdout");
        let stderr = child.stderr.take().expect("piped stderr");
        let cancel = CancellationToken::new();

        let mgr_out = self.clone();
        let cancel_out = cancel.clone();
        let h1 = tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            mgr_out.read_lines(reader, false, cancel_out).await;
        });

        let mgr_err = self.clone();
        let cancel_err = cancel.clone();
        let h2 = tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            mgr_err.read_lines(reader, true, cancel_err).await;
        });

        // Watcher: when child exits, update state.
        let mgr_watch = self.clone();
        let cancel_watch = cancel.clone();
        let h3 = tokio::spawn(async move {
            mgr_watch.wait_for_exit(cancel_watch).await;
        });

        {
            let mut guard = self.inner.lock().await;
            *guard = Some(RunningProcess {
                child,
                cancel,
                _readers: vec![h1, h2, h3],
            });
        }

        self.set_phase(ConnectionPhase::Connecting, None);

        Ok(self.state())
    }

    pub async fn stop(&self) -> AppResult<()> {
        let mut guard = self.inner.lock().await;
        let Some(running) = guard.as_mut() else {
            return Err(AppError::NotRunning);
        };
        self.set_phase(ConnectionPhase::Stopping, Some("Disconnecting…".into()));
        running.cancel.cancel();
        // Try a graceful kill first; tokio's `kill` uses SIGKILL on Unix
        // already so no SIGTERM needed for sshuttle.
        let _ = running.child.start_kill();
        let _ = running.child.wait().await;
        *guard = None;
        self.set_phase(ConnectionPhase::Disconnected, None);
        Ok(())
    }

    /// Drain the in-memory log ring buffer.
    pub async fn fetch_logs(&self, limit: usize) -> Vec<LogLine> {
        self.logs(limit)
    }

    async fn read_lines<R>(&self, reader: BufReader<R>, is_stderr: bool, cancel: CancellationToken)
    where
        R: tokio::io::AsyncRead + Unpin,
    {
        let mut lines = reader.lines();
        loop {
            tokio::select! {
                _ = cancel.cancelled() => break,
                line = lines.next_line() => {
                    match line {
                        Ok(Some(text)) => {
                            let level = classify(&text, is_stderr);
                            let log = LogLine {
                                level,
                                line: text.clone(),
                                timestamp: Utc::now(),
                            };
                            self.push_log(log.clone());
                            self.emit_event(RuntimeEvent::Log {
                                level: log.level,
                                line: log.line,
                                timestamp: log.timestamp,
                            });
                            // Heuristic: sshuttle prints "client: Connected." when
                            // the tunnel is fully up.
                            if text.contains("Connected") || text.contains("connected") {
                                let cur = self.state.read().phase;
                                if matches!(
                                    cur,
                                    ConnectionPhase::Starting
                                    | ConnectionPhase::Connecting
                                    | ConnectionPhase::Reconnecting
                                ) {
                                    self.set_phase(ConnectionPhase::Connected, None);
                                }
                            }
                        }
                        _ => break,
                    }
                }
            }
        }
    }

    async fn wait_for_exit(&self, cancel: CancellationToken) {
        let mut interval = tokio::time::interval(Duration::from_millis(250));
        loop {
            tokio::select! {
                _ = cancel.cancelled() => return,
                _ = interval.tick() => {}
            }
            let mut guard = self.inner.lock().await;
            let Some(running) = guard.as_mut() else { return };
            match running.child.try_wait() {
                Ok(Some(status)) => {
                    let msg = if status.success() {
                        "sshuttle exited cleanly".to_string()
                    } else {
                        format!("sshuttle exited with status {status}")
                    };
                    let next_phase = if status.success() {
                        ConnectionPhase::Disconnected
                    } else {
                        ConnectionPhase::Failed
                    };
                    *guard = None;
                    drop(guard);
                    self.set_phase(next_phase, Some(msg));
                    return;
                }
                Ok(None) => continue,
                Err(e) => {
                    *guard = None;
                    drop(guard);
                    self.set_phase(
                        ConnectionPhase::Failed,
                        Some(format!("failed to wait on child: {e}")),
                    );
                    return;
                }
            }
        }
    }

    fn push_log(&self, log: LogLine) {
        let mut buf = self.log_buffer.write();
        if buf.len() >= MAX_LOG_BUFFER {
            buf.pop_front();
        }
        buf.push_back(log);
    }

    fn set_phase(&self, phase: ConnectionPhase, message: Option<String>) {
        let snapshot = {
            let mut s = self.state.write();
            s.phase = phase;
            if let Some(m) = message.clone() {
                s.message = Some(m);
            }
            s.clone()
        };
        self.emit_event(RuntimeEvent::Phase {
            phase,
            profile_id: snapshot.profile_id.clone(),
            profile_name: snapshot.profile_name.clone(),
            message,
            timestamp: Utc::now(),
        });
    }

    fn emit_phase(&self, message: &str) {
        let snapshot = self.state.read().clone();
        self.emit_event(RuntimeEvent::Phase {
            phase: snapshot.phase,
            profile_id: snapshot.profile_id.clone(),
            profile_name: snapshot.profile_name.clone(),
            message: Some(message.to_string()),
            timestamp: Utc::now(),
        });
    }

    fn emit_event(&self, event: RuntimeEvent) {
        if let Err(e) = self.app.emit(RUNTIME_EVENT, &event) {
            log::warn!("failed to emit runtime event: {e}");
        }
    }
}

fn classify(line: &str, is_stderr: bool) -> LogLevel {
    let lower = line.to_ascii_lowercase();
    if lower.contains("error") || lower.contains("fatal") {
        LogLevel::Error
    } else if lower.contains("warn") {
        LogLevel::Warn
    } else if is_stderr {
        // sshuttle writes most operational messages to stderr; treat them as info.
        LogLevel::Info
    } else {
        LogLevel::Info
    }
}
