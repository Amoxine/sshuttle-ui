//! Find and reap stray `sshuttle` processes.
//!
//! There are two common paths into "an `sshuttle` is running but our
//! manager doesn't know about it":
//!
//! 1. Our app crashed / was killed without unwinding `RunningProcess`.
//! 2. The user started `sshuttle` from a terminal before launching us.
//!
//! Both end with one or more orphan processes the user can't easily
//! find or stop. This module scans for them and offers a panic-button
//! "kill them all" path.

use std::process::Stdio;

use serde::{Deserialize, Serialize};
use tokio::process::Command as TokioCommand;

use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshuttleProcess {
    pub pid: u32,
    pub command: String,
    /// True when the command line was invoked through `sudo` — these
    /// require an elevated `kill` to terminate.
    pub elevated: bool,
}

/// Identify the names that count as "an sshuttle process" in the ps
/// output. We accept the canonical `sshuttle` python wrapper plus the
/// `python … sshuttle …` form that some installs use.
fn looks_like_sshuttle(cmd: &str) -> bool {
    if !cmd.contains("sshuttle") {
        return false;
    }
    // Exclude our own GUI binary — its argv may contain "sshuttle"
    // because of the product name.
    if cmd.contains("sshuttle-ui") || cmd.contains("sshuttle UI") {
        return false;
    }
    // Exclude the scanner shell-out itself if it ever loops back on us
    // (defensive — the awkward output line that contains the very `ps`
    // we just ran doesn't normally show, but be safe).
    if cmd.starts_with("ps ") || cmd.starts_with("grep ") {
        return false;
    }
    true
}

/// Scan the host's process table for any running `sshuttle`.
pub fn scan_sshuttle_processes() -> AppResult<Vec<SshuttleProcess>> {
    let self_pid = std::process::id();

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        let output = std::process::Command::new("ps")
            .args(["-axo", "pid=,command="])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output()?;
        let text = String::from_utf8_lossy(&output.stdout);
        let mut found = Vec::new();
        for line in text.lines() {
            let line = line.trim_start();
            // Split into "<pid> <command>".
            let split_at = match line.find(char::is_whitespace) {
                Some(i) => i,
                None => continue,
            };
            let (pid_s, cmd_s) = line.split_at(split_at);
            let cmd = cmd_s.trim().to_string();
            let Ok(pid) = pid_s.parse::<u32>() else {
                continue;
            };
            if pid == self_pid {
                continue;
            }
            if !looks_like_sshuttle(&cmd) {
                continue;
            }
            // The user's own login shell may show as `sudo sshuttle …`;
            // that's the parent we want to surface so killing it cleans
            // up the privileged child too.
            let elevated = cmd.starts_with("sudo ") || cmd.contains(" sudo ");
            found.push(SshuttleProcess {
                pid,
                command: cmd,
                elevated,
            });
        }
        return Ok(found);
    }

    #[cfg(target_os = "windows")]
    {
        // sshuttle on Windows is rare (typically WSL). Best effort.
        let output = std::process::Command::new("tasklist")
            .args(["/FO", "CSV", "/NH", "/V"])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output()?;
        let text = String::from_utf8_lossy(&output.stdout);
        let mut found = Vec::new();
        for line in text.lines() {
            if !line.to_lowercase().contains("sshuttle") {
                continue;
            }
            let cols: Vec<&str> = line.split(',').map(|s| s.trim_matches('"')).collect();
            if cols.len() < 2 {
                continue;
            }
            let Ok(pid) = cols[1].parse::<u32>() else {
                continue;
            };
            if pid == self_pid {
                continue;
            }
            found.push(SshuttleProcess {
                pid,
                command: cols[0].to_string(),
                elevated: false,
            });
        }
        return Ok(found);
    }

    #[allow(unreachable_code)]
    Ok(Vec::new())
}

/// Send a kill signal (TERM, then KILL after a short grace period) to
/// every running sshuttle. Returns the count we attempted (NOT the
/// count we successfully reaped, because that's tricky to verify on
/// some platforms — re-scan after to confirm).
///
/// `sudo_password` is forwarded via stdin to elevate the kill on
/// privileged children when the user has a saved password.
pub async fn force_kill_all(sudo_password: Option<&str>) -> AppResult<usize> {
    let procs = scan_sshuttle_processes()?;
    let count = procs.len();
    if count == 0 {
        return Ok(0);
    }

    for p in &procs {
        send_signal(p, "TERM", sudo_password).await;
    }

    // Grace period — sshuttle's own SIGTERM handler does cleanup work
    // (restoring routes / firewall rules) which we want to give a
    // chance to finish before we KILL.
    tokio::time::sleep(std::time::Duration::from_millis(800)).await;

    // Whoever's left gets SIGKILL.
    let still_alive = scan_sshuttle_processes().unwrap_or_default();
    for p in &still_alive {
        send_signal(p, "KILL", sudo_password).await;
    }

    Ok(count)
}

#[cfg(unix)]
async fn send_signal(p: &SshuttleProcess, sig: &str, sudo_password: Option<&str>) {
    let pid_s = p.pid.to_string();
    if p.elevated {
        // Try non-interactive sudo first. If we have a password and
        // the cache is cold, pipe it via -S.
        let mut cmd = TokioCommand::new("sudo");
        if let Some(pwd) = sudo_password {
            cmd.args(["-S", "kill", &format!("-{sig}"), &pid_s])
                .stdin(Stdio::piped())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            if let Ok(mut child) = cmd.spawn() {
                if let Some(stdin) = child.stdin.as_mut() {
                    use tokio::io::AsyncWriteExt;
                    let _ = stdin.write_all(pwd.as_bytes()).await;
                    let _ = stdin.write_all(b"\n").await;
                }
                let _ = child.wait().await;
                return;
            }
        }
        cmd.args(["-n", "kill", &format!("-{sig}"), &pid_s])
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        let _ = cmd.status().await;
    } else {
        let _ = TokioCommand::new("kill")
            .args([&format!("-{sig}"), &pid_s])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .await;
    }
}

#[cfg(windows)]
async fn send_signal(p: &SshuttleProcess, _sig: &str, _sudo_password: Option<&str>) {
    let pid_s = p.pid.to_string();
    let _ = TokioCommand::new("taskkill")
        .args(["/PID", &pid_s, "/F"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn looks_like_sshuttle_filters_self() {
        assert!(!looks_like_sshuttle("/Applications/sshuttle UI.app/Contents/MacOS/sshuttle-ui"));
        assert!(!looks_like_sshuttle("sshuttle-ui --foo"));
        assert!(looks_like_sshuttle(
            "sudo sshuttle -r user@host 0/0 --dns"
        ));
        assert!(looks_like_sshuttle(
            "/opt/homebrew/bin/python3.12 /opt/homebrew/bin/sshuttle -r me@h 0/0"
        ));
    }

    #[test]
    fn looks_like_sshuttle_rejects_unrelated() {
        assert!(!looks_like_sshuttle("zsh"));
        assert!(!looks_like_sshuttle("ssh user@host"));
    }

    #[test]
    fn scan_returns_a_vec() {
        // Smoke test — must not panic regardless of whether sshuttle
        // is installed/running on the test host.
        let _ = scan_sshuttle_processes();
    }
}
