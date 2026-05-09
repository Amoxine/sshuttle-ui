//! Sudo pre-authentication helpers.
//!
//! sshuttle needs root privileges to install firewall rules. From a GUI
//! `.app` there's no controlling terminal, so a bare `sudo sshuttle …` will
//! fail with "a terminal is required to read the password" or
//! "askpass helper" errors, and sshuttle then dies with `fw: fatal: …`.
//!
//! We avoid that by **pre-authenticating** sudo from the UI:
//!
//! 1. Frontend asks the user for their password via a Tauri dialog.
//! 2. We pipe it to `sudo -S -v`, which validates the password and refreshes
//!    sudo's credential cache (default TTL: 5 min).
//! 3. The subsequent `sudo sshuttle …` spawn uses the cached creds and never
//!    needs a tty.
//!
//! Optionally the password is stored in the platform keychain so subsequent
//! sessions skip the dialog.

use std::process::Stdio;
use std::sync::Arc;

use serde::Serialize;
use tauri::State;
use tokio::io::AsyncWriteExt;

use crate::error::{AppError, AppResult};
use crate::sshuttle::extended_path;
use crate::state::AppState;

/// Keychain key used for the optional saved sudo password.
pub const SUDO_PASSWORD_KEY: &str = "sudo-password";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SudoStatus {
    /// True if `sudo -n -v` succeeds (cached creds are valid right now).
    pub cached: bool,
    /// True if there is a password saved in the platform keychain.
    pub has_saved_password: bool,
    /// Platforms where `sudo` isn't applicable (e.g. native Windows host).
    pub supported: bool,
}

/// Quick check: returns the current state of sudo authentication. The
/// frontend uses this to decide whether to open the password dialog.
#[tauri::command]
pub async fn sudo_status(state: State<'_, Arc<AppState>>) -> AppResult<SudoStatus> {
    let supported = sudo_supported();
    let cached = if supported { sudo_cached().await } else { false };
    let has_saved_password = state.secrets.presence(SUDO_PASSWORD_KEY).has_value;
    Ok(SudoStatus {
        cached,
        has_saved_password,
        supported,
    })
}

/// Attempt to pre-authenticate sudo. If `password` is `None`, we try the
/// keychain-saved password first (if any). Returns `true` when sudo's
/// credential cache is now primed.
#[tauri::command]
pub async fn sudo_authenticate(
    password: Option<String>,
    save: bool,
    state: State<'_, Arc<AppState>>,
) -> AppResult<bool> {
    if !sudo_supported() {
        return Err(AppError::Invalid(
            "sudo is not used on this platform".into(),
        ));
    }

    // Already cached → nothing to do.
    if sudo_cached().await {
        return Ok(true);
    }

    // Use the supplied password, otherwise fall back to the keychain.
    let pwd = match password {
        Some(p) if !p.is_empty() => p,
        _ => match state.secrets.get(SUDO_PASSWORD_KEY)? {
            Some(p) => p,
            None => return Ok(false),
        },
    };

    match validate_password(&pwd).await {
        Ok(()) => {
            if save {
                // User opted in to keychain caching.
                state.secrets.set(SUDO_PASSWORD_KEY, &pwd)?;
            }
            Ok(true)
        }
        Err(e) => {
            // If a saved password was tried automatically and it's now wrong,
            // remove it so we don't loop forever.
            let _ = state.secrets.delete(SUDO_PASSWORD_KEY);
            Err(e)
        }
    }
}

/// Forget the saved sudo password and (best-effort) drop the in-kernel
/// credential cache so the next attempt re-prompts.
#[tauri::command]
pub async fn sudo_forget(state: State<'_, Arc<AppState>>) -> AppResult<()> {
    let _ = state.secrets.delete(SUDO_PASSWORD_KEY);
    if sudo_supported() {
        // sudo -k clears the timestamp file → next sudo will re-prompt.
        let _ = tokio::process::Command::new("sudo")
            .arg("-k")
            .env("PATH", extended_path())
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .await;
    }
    Ok(())
}

fn sudo_supported() -> bool {
    cfg!(any(target_os = "macos", target_os = "linux"))
}

/// Run `sudo -n -v`: returns `true` only if cached credentials are valid
/// (no prompt would be required).
async fn sudo_cached() -> bool {
    let status = tokio::process::Command::new("sudo")
        .args(["-n", "-v"])
        .env("PATH", extended_path())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await;
    matches!(status, Ok(s) if s.success())
}

/// Pipe the password to `sudo -S -v`. Success ⇒ creds cached.
async fn validate_password(password: &str) -> AppResult<()> {
    let mut child = tokio::process::Command::new("sudo")
        // -S read from stdin, -v validate-only (don't run a command),
        // -p "" silence sudo's prompt text since we don't need it.
        .args(["-S", "-v", "-p", ""])
        .env("PATH", extended_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Other(format!("failed to spawn sudo: {e}")))?;

    if let Some(mut stdin) = child.stdin.take() {
        let mut buf = String::with_capacity(password.len() + 1);
        buf.push_str(password);
        buf.push('\n');
        let _ = stdin.write_all(buf.as_bytes()).await;
        let _ = stdin.shutdown().await;
        // Explicit drop to close fd → EOF for sudo.
        drop(stdin);
    }

    let output = child
        .wait_with_output()
        .await
        .map_err(AppError::Io)?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let lower = stderr.to_ascii_lowercase();
    let msg = if lower.contains("incorrect password")
        || lower.contains("sorry, try again")
        || lower.contains("authentication failure")
    {
        "Incorrect password.".to_string()
    } else if stderr.trim().is_empty() {
        "sudo authentication failed.".to_string()
    } else {
        // Show only the first line of sudo's stderr so we don't spew
        // multi-paragraph PAM messages.
        stderr.lines().next().unwrap_or("sudo failed").to_string()
    };
    Err(AppError::Invalid(msg))
}
