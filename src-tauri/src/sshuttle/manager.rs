use std::collections::VecDeque;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use parking_lot::RwLock;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
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
#[derive(Debug, Clone, Serialize, specta::Type)]
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
    /// Whether this session was launched via `sudo`. Drives whether
    /// `stop()` needs to elevate when killing the privileged child.
    sudo: bool,
    /// PID(s) of the actual sshuttle process(es) we observed in the
    /// host process table shortly after spawn — captured so `stop()`
    /// can target them directly instead of relying on signal
    /// propagation through `sudo`. Empty until the post-spawn scan
    /// completes (~500ms after start).
    tracked_pids: Arc<RwLock<Vec<u32>>>,
    /// `connection_history` row id for the current session, populated
    /// from `start()`. Used to call `record_end` when the session ends.
    history_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
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
    /// `history_id`, when supplied by the caller, is the
    /// `connection_history` row id; the manager uses it to call
    /// `record_end` when the session terminates so the row gets a real
    /// `ended_at` and status instead of being orphaned.
    pub async fn start(
        &self,
        config: &SshuttleConfig,
        profile_id: Option<&str>,
        profile_name: Option<&str>,
        sudo: bool,
        saved_password: Option<String>,
        history_id: Option<i64>,
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
                    "sudo password not cached. Authenticate from the dialog before connecting."
                        .into(),
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

        // Snapshot existing sshuttle PIDs so we can pick out the new
        // ones we just spawned (and target them on stop()).
        #[cfg(unix)]
        let pre_spawn_pids: Vec<u32> = super::process_scanner::scan_sshuttle_processes()
            .unwrap_or_default()
            .into_iter()
            .map(|p| p.pid)
            .collect();
        #[cfg(not(unix))]
        let pre_spawn_pids: Vec<u32> = Vec::new();

        // Mark the new state before spawning so the UI updates immediately.
        let started_at = Utc::now();
        {
            let mut s = self.state.write();
            *s = ConnectionState {
                phase: ConnectionPhase::Starting,
                profile_id: profile_id.map(str::to_string),
                profile_name: profile_name.map(str::to_string),
                command_preview: Some(config.preview_command()),
                started_at: Some(started_at),
                message: None,
                history_id,
            };
        }

        // Persist the active session BEFORE spawning. If we crash
        // between this point and the next start() call, boot recovery
        // can reconcile against the orphan scanner.
        if let Err(e) =
            self.persist_active_session(profile_id, profile_name, started_at, sudo, history_id)
        {
            tracing::warn!("active session persistence failed: {e}");
        }

        self.emit_phase("Starting sshuttle…");

        let mut child = cmd.spawn().map_err(|e| {
            self.set_phase(ConnectionPhase::Failed, Some(format!("spawn failed: {e}")));
            // Roll back the persisted session — we never actually started.
            let _ = self.clear_active_session();
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

        let tracked_pids = Arc::new(RwLock::new(Vec::<u32>::new()));
        {
            let mut guard = self.inner.lock().await;
            *guard = Some(RunningProcess {
                child,
                cancel,
                _readers: vec![h1, h2, h3],
                sudo,
                tracked_pids: tracked_pids.clone(),
                history_id,
            });
        }

        // Post-spawn PID resolution: once the privileged sshuttle child
        // is alive (sudo finishes auth + execs sshuttle), record its
        // PID(s) so `stop()` can target them directly. We poll for up
        // to ~3s, which is generous since spawn is normally <100ms.
        #[cfg(unix)]
        {
            let pids_slot = tracked_pids.clone();
            tokio::spawn(async move {
                for _ in 0..30 {
                    tokio::time::sleep(Duration::from_millis(100)).await;
                    let new = super::process_scanner::newly_spawned_since(&pre_spawn_pids);
                    if !new.is_empty() {
                        let mut slot = pids_slot.write();
                        *slot = new.into_iter().map(|p| p.pid).collect();
                        return;
                    }
                }
                tracing::warn!(
                    "post-spawn pid resolution timed out; stop() will fall back to scan"
                );
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

        // Snapshot what we need BEFORE giving up the mutex. We can't
        // hold it across the kill chain because `wait_for_exit` may
        // need to re-acquire to clean up after the child exits.
        let used_sudo = running.sudo;
        let history_id = running.history_id;
        let tracked_pids: Vec<u32> = running.tracked_pids.read().clone();
        running.cancel.cancel();
        // Send SIGKILL to our direct child. When `sudo` was used this
        // is the sudo wrapper, and SIGKILL won't reach the privileged
        // child — the explicit kill chain below handles that case.
        // When `sudo` wasn't used, this *is* sshuttle and we're done.
        let _ = running.child.start_kill();
        let _ = running.child.wait().await;
        *guard = None;
        drop(guard);

        // Privileged-child cleanup. SIGKILL on the sudo parent doesn't
        // propagate to its privileged child on Unix (sudo can't catch
        // SIGKILL to forward it). When we used sudo we MUST elevate
        // the kill ourselves, with the saved sudo password where
        // available so it works even after the cache TTL expires.
        #[cfg(unix)]
        {
            let saved_sudo_password: Option<String> = if used_sudo {
                self.app
                    .try_state::<std::sync::Arc<crate::state::AppState>>()
                    .and_then(|s| {
                        s.secrets
                            .get(crate::commands::sudo::SUDO_PASSWORD_KEY)
                            .ok()
                            .flatten()
                    })
            } else {
                None
            };

            // Step 1: target the PIDs we observed at spawn time, with
            // SIGTERM first (so sshuttle can run its own cleanup of
            // routes / firewall rules).
            for pid in &tracked_pids {
                super::process_scanner::signal_pid(
                    *pid,
                    "TERM",
                    used_sudo,
                    saved_sudo_password.as_deref(),
                )
                .await;
            }
            // Step 2: bounded wait for those PIDs to actually exit.
            let targets: Vec<super::process_scanner::SshuttleProcess> = tracked_pids
                .iter()
                .map(|pid| super::process_scanner::SshuttleProcess {
                    pid: *pid,
                    command: String::new(),
                    elevated: used_sudo,
                })
                .collect();
            let term_clean =
                super::process_scanner::wait_until_gone(&targets, Duration::from_millis(2_500))
                    .await;

            // Step 3: SIGKILL anyone who survived the polite request.
            if !term_clean {
                for pid in &tracked_pids {
                    super::process_scanner::signal_pid(
                        *pid,
                        "KILL",
                        used_sudo,
                        saved_sudo_password.as_deref(),
                    )
                    .await;
                }
                super::process_scanner::wait_until_gone(&targets, Duration::from_millis(1_500))
                    .await;
            }

            // Step 4: belt-and-braces sweep — if the post-spawn PID
            // resolution missed anything, pick up any other sshuttle
            // process now and reap it the same way.
            let leftovers = super::process_scanner::scan_sshuttle_processes().unwrap_or_default();
            if !leftovers.is_empty() {
                tracing::warn!(
                    "stop(): {} sshuttle child(ren) survived targeted kill, force-killing",
                    leftovers.len()
                );
                let _ =
                    super::process_scanner::force_kill_all(saved_sudo_password.as_deref()).await;
            }
        }

        // Persist session end: close the history row and clear the
        // active_session marker. If anything fails we log but keep
        // going so the UI still flips to Disconnected.
        let stats_snapshot = self.last_stats();
        if let Some(id) = history_id {
            if let Err(e) = self.record_history_end(
                id,
                "disconnected",
                stats_snapshot.0,
                stats_snapshot.1,
                None,
            ) {
                tracing::warn!("history record_end failed: {e}");
            }
        }
        if let Err(e) = self.clear_active_session() {
            tracing::warn!("active session clear failed: {e}");
        }

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
            let Some(running) = guard.as_mut() else {
                return;
            };
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
                    let history_id = running.history_id;
                    *guard = None;
                    drop(guard);

                    // Persist the row close-out for history tracking.
                    let (bytes_in, bytes_out) = self.last_stats();
                    if let Some(id) = history_id {
                        let status_label = if status.success() {
                            "disconnected"
                        } else {
                            "failed"
                        };
                        let error = if status.success() {
                            None
                        } else {
                            Some(msg.as_str())
                        };
                        if let Err(e) =
                            self.record_history_end(id, status_label, bytes_in, bytes_out, error)
                        {
                            tracing::warn!("history record_end (natural exit) failed: {e}");
                        }
                    }
                    if let Err(e) = self.clear_active_session() {
                        tracing::warn!("active session clear (natural exit) failed: {e}");
                    }

                    self.set_phase(next_phase, Some(msg));
                    return;
                }
                Ok(None) => continue,
                Err(e) => {
                    let history_id = running.history_id;
                    *guard = None;
                    drop(guard);
                    let err_msg = format!("failed to wait on child: {e}");
                    if let Some(id) = history_id {
                        let _ = self.record_history_end(id, "failed", 0, 0, Some(&err_msg));
                    }
                    let _ = self.clear_active_session();
                    self.set_phase(ConnectionPhase::Failed, Some(err_msg));
                    return;
                }
            }
        }
    }

    /// Last live stats sample (bytes/sec) — best-effort accumulator
    /// used when closing a history row. Returns 0,0 if the sampler
    /// hasn't published anything for this session yet.
    fn last_stats(&self) -> (i64, i64) {
        // Currently the manager doesn't aggregate cumulative bytes;
        // the sampler emits per-interval rates only. Until we wire a
        // cumulative counter we record 0/0 to indicate "no data" —
        // history.bytes_in/out can be revisited when the sampler is
        // refactored to expose totals.
        (0, 0)
    }

    fn record_history_end(
        &self,
        id: i64,
        status: &str,
        bytes_in: i64,
        bytes_out: i64,
        error: Option<&str>,
    ) -> AppResult<()> {
        let Some(state) = self
            .app
            .try_state::<std::sync::Arc<crate::state::AppState>>()
        else {
            return Ok(());
        };
        crate::storage::history::HistoryRepo::new(&state.db)
            .record_end(id, status, bytes_in, bytes_out, error)
    }

    fn persist_active_session(
        &self,
        profile_id: Option<&str>,
        profile_name: Option<&str>,
        started_at: chrono::DateTime<Utc>,
        sudo: bool,
        history_id: Option<i64>,
    ) -> AppResult<()> {
        let Some(state) = self
            .app
            .try_state::<std::sync::Arc<crate::state::AppState>>()
        else {
            return Ok(());
        };
        let session = crate::storage::active_session::ActiveSession {
            profile_id: profile_id.map(str::to_string),
            profile_name: profile_name.map(str::to_string),
            started_at,
            sudo,
            history_id,
        };
        crate::storage::active_session::ActiveSessionRepo::new(&state.db).save(&session)
    }

    fn clear_active_session(&self) -> AppResult<()> {
        let Some(state) = self
            .app
            .try_state::<std::sync::Arc<crate::state::AppState>>()
        else {
            return Ok(());
        };
        crate::storage::active_session::ActiveSessionRepo::new(&state.db).clear()
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
