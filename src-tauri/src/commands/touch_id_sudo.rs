//! macOS: detect / enable / disable Touch ID for `sudo` via `pam_tid.so` in
//! `/etc/pam.d/sudo`. Other platforms return `supported: false`.
//!
//! Editing system PAM files requires administrator privileges. We reuse the
//! same password flow as [`super::sudo`] (typed password or keychain).

use std::process::Stdio;
use std::sync::Arc;

#[cfg(target_os = "macos")]
use regex::Regex;
use serde::Serialize;
use tauri::State;

use crate::commands::sudo::{self, SUDO_PASSWORD_KEY};
use crate::error::{AppError, AppResult};
use crate::sshuttle::extended_path;
use crate::state::AppState;

#[cfg(target_os = "macos")]
const PAM_SUDO_PATH: &str = "/etc/pam.d/sudo";

/// Apple-style line (spacing matches stock macOS examples).
#[cfg(target_os = "macos")]
const PAM_TID_LINE: &str = "auth       sufficient     pam_tid.so";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TouchIdSudoStatus {
    pub supported: bool,
    /// Could not read `/etc/pam.d/sudo` (permissions or missing file).
    pub file_readable: bool,
    /// An uncommented `auth sufficient pam_tid.so` line is present.
    pub enabled: bool,
    pub file_path: String,
}

#[tauri::command]
pub async fn touch_id_sudo_status() -> AppResult<TouchIdSudoStatus> {
    touch_id_sudo_status_inner().await
}

#[cfg(target_os = "macos")]
async fn touch_id_sudo_status_inner() -> AppResult<TouchIdSudoStatus> {
    match tokio::fs::read_to_string(PAM_SUDO_PATH).await {
        Ok(content) => Ok(TouchIdSudoStatus {
            supported: true,
            file_readable: true,
            enabled: pam_tid_line_active(&content),
            file_path: PAM_SUDO_PATH.to_string(),
        }),
        Err(err) => {
            tracing::warn!("read {}: {}", PAM_SUDO_PATH, err.kind());
            Ok(TouchIdSudoStatus {
                supported: true,
                file_readable: false,
                enabled: false,
                file_path: PAM_SUDO_PATH.to_string(),
            })
        }
    }
}

#[cfg(not(target_os = "macos"))]
async fn touch_id_sudo_status_inner() -> AppResult<TouchIdSudoStatus> {
    Ok(TouchIdSudoStatus {
        supported: false,
        file_readable: false,
        enabled: false,
        file_path: String::new(),
    })
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TouchIdSudoSetEnabledArgs {
    pub enabled: bool,
    pub password: Option<String>,
}

#[tauri::command]
pub async fn touch_id_sudo_set_enabled(
    args: TouchIdSudoSetEnabledArgs,
    state: State<'_, Arc<AppState>>,
) -> AppResult<()> {
    touch_id_sudo_set_enabled_inner(args, &state).await
}

#[cfg(target_os = "macos")]
async fn touch_id_sudo_set_enabled_inner(
    args: TouchIdSudoSetEnabledArgs,
    state: &AppState,
) -> AppResult<()> {
    let content = tokio::fs::read_to_string(PAM_SUDO_PATH)
        .await
        .map_err(|e| AppError::Other(format!("cannot read {}: {e}", PAM_SUDO_PATH)))?;

    let new_content = if args.enabled {
        insert_pam_tid_line(&content)
    } else {
        remove_pam_tid_lines(&content)
    };

    if new_content == content {
        return Ok(());
    }

    ensure_sudo_for_system_edit(args.password.as_deref(), state).await?;
    write_pam_sudo_atomic(&new_content).await?;
    Ok(())
}

#[cfg(not(target_os = "macos"))]
async fn touch_id_sudo_set_enabled_inner(
    _args: TouchIdSudoSetEnabledArgs,
    _state: &AppState,
) -> AppResult<()> {
    Err(AppError::Invalid(
        "Touch ID for sudo is only available on macOS.".into(),
    ))
}

/// Ensure sudo can run non-interactive `cp` immediately after this returns.
#[cfg(target_os = "macos")]
async fn ensure_sudo_for_system_edit(
    password_override: Option<&str>,
    state: &AppState,
) -> AppResult<()> {
    if sudo::sudo_cached().await {
        return Ok(());
    }

    let pwd = password_override
        .map(str::to_string)
        .filter(|s| !s.is_empty())
        .or_else(|| state.secrets.get(SUDO_PASSWORD_KEY).ok().flatten())
        .ok_or_else(|| {
            AppError::Invalid(
                "Administrator password required — sudo is not cached and no saved password was found."
                    .into(),
            )
        })?;

    sudo::validate_password(&pwd).await
}

#[cfg(target_os = "macos")]
async fn write_pam_sudo_atomic(content: &str) -> AppResult<()> {
    let tmp = std::env::temp_dir().join(format!(
        "sshuttle-ui-pam-sudo-{}.tmp",
        uuid::Uuid::new_v4()
    ));
    tokio::fs::write(&tmp, content)
        .await
        .map_err(|e| AppError::Other(format!("temp write failed: {e}")))?;

    let status = tokio::process::Command::new("sudo")
        .args(["-n", "cp"])
        .arg(&tmp)
        .arg(PAM_SUDO_PATH)
        .env("PATH", extended_path())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .status()
        .await
        .map_err(AppError::Io)?;

    let _ = tokio::fs::remove_file(&tmp).await;

    if status.success() {
        return Ok(());
    }

    Err(AppError::Other(
        "sudo could not update /etc/pam.d/sudo (try again after authenticating sudo from the connect flow)."
            .into(),
    ))
}

#[cfg(target_os = "macos")]
fn pam_tid_line_active(content: &str) -> bool {
    let re = Regex::new(r"(?m)^\s*auth\s+sufficient\s+pam_tid\.so\s*$").expect("regex");
    re.is_match(content)
}

#[cfg(target_os = "macos")]
fn insert_pam_tid_line(content: &str) -> String {
    if pam_tid_line_active(content) {
        return content.to_string();
    }
    let re = Regex::new(r"(?m)^(\s*)auth\s+").expect("regex");
    if let Some(m) = re.find(content) {
        let idx = m.start();
        let mut out = String::with_capacity(content.len() + 64);
        out.push_str(&content[..idx]);
        out.push_str(PAM_TID_LINE);
        out.push('\n');
        out.push_str(&content[idx..]);
        return out;
    }
    if content.trim().is_empty() {
        return format!("{}\n", PAM_TID_LINE);
    }
    format!("{}\n{}", PAM_TID_LINE, content)
}

#[cfg(target_os = "macos")]
fn remove_pam_tid_lines(content: &str) -> String {
    let re =
        Regex::new(r"(?m)^\s*auth\s+sufficient\s+pam_tid\.so\s*\r?\n?").expect("regex");
    re.replace_all(content, "").to_string()
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    #[test]
    fn detects_active_tid() {
        let s = "# x\nauth       sufficient     pam_tid.so\nauth required x\n";
        assert!(pam_tid_line_active(s));
    }

    #[test]
    fn ignores_commented_tid() {
        let s = "# auth sufficient pam_tid.so\nauth required x\n";
        assert!(!pam_tid_line_active(s));
    }

    #[test]
    fn insert_before_first_auth() {
        let s = "# sudo: auth account\nauth       required       pam_x.so\n";
        let out = insert_pam_tid_line(s);
        assert!(out.contains("pam_tid.so"));
        assert!(out.find("pam_tid.so").unwrap() < out.find("pam_x.so").unwrap());
    }

    #[test]
    fn remove_tid() {
        let s = "auth       sufficient     pam_tid.so\nauth required pam_x.so\n";
        let out = remove_pam_tid_lines(s);
        assert!(!out.contains("pam_tid"));
        assert!(out.contains("pam_x"));
    }
}
