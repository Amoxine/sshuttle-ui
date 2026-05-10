//! Pre-connect checks: sshuttle binary, DNS, optional non-interactive SSH probe.

use std::process::Stdio;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::dns::resolve_host;
use crate::error::AppResult;
use crate::security::keychain::profile_password_key;
use crate::sshuttle::resolver::{extended_path, find_in_known_dirs, find_sshuttle};
use crate::sshuttle::SshAuth;
use crate::state::AppState;
use crate::storage::profiles::ProfileRepo;

#[derive(Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PreflightArgs {
    pub profile_id: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PreflightReport {
    pub profile_id: String,
    pub sshuttle_path: Option<String>,
    pub ssh_path: Option<String>,
    pub host_resolved: bool,
    pub resolved_addresses: Vec<String>,
    pub dns_elapsed_ms: u64,
    pub ssh_batch_probe_ok: bool,
    pub ssh_batch_probe_detail: Option<String>,
    pub skipped_ssh_probe: bool,
    pub skipped_reason: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub async fn preflight_profile(
    args: PreflightArgs,
    state: State<'_, Arc<AppState>>,
) -> AppResult<PreflightReport> {
    let profile = ProfileRepo::new(&state.db).get(&args.profile_id)?;
    let sshuttle_path = find_sshuttle().map(|p| p.to_string_lossy().into_owned());
    let ssh_path = find_in_known_dirs("ssh").map(|p| p.to_string_lossy().into_owned());

    let dns = resolve_host(&profile.config.host);
    let host_resolved = dns.error.is_none() && !dns.addresses.is_empty();

    let mut skipped_ssh_probe = false;
    let mut skipped_reason: Option<String> = None;

    if matches!(profile.config.auth, SshAuth::Password) {
        let pwd = state.secrets.get(&profile_password_key(&profile.id))?;
        if pwd.is_none() {
            skipped_ssh_probe = true;
            skipped_reason =
                Some("Password auth without a saved keychain password — SSH probe skipped.".into());
        }
    }

    let mut ssh_batch_probe_ok = false;
    let mut ssh_batch_probe_detail: Option<String> = None;

    if !skipped_ssh_probe {
        let target = build_ssh_target(&profile.config);
        let ssh_bin = find_in_known_dirs("ssh").unwrap_or_else(|| "ssh".into());
        let output = tokio::process::Command::new(&ssh_bin)
            .args([
                "-o",
                "BatchMode=yes",
                "-o",
                "StrictHostKeyChecking=accept-new",
                "-o",
                "ConnectTimeout=8",
                "-T",
                &target,
                "true",
            ])
            .env("PATH", extended_path())
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await;

        match output {
            Ok(o) => {
                ssh_batch_probe_ok = o.status.success();
                if !ssh_batch_probe_ok {
                    let err = String::from_utf8_lossy(&o.stderr).trim().to_string();
                    let out = String::from_utf8_lossy(&o.stdout).trim().to_string();
                    let detail = if err.is_empty() { out } else { err };
                    ssh_batch_probe_detail = Some(if detail.is_empty() {
                        format!("exit {}", o.status)
                    } else {
                        detail.chars().take(400).collect()
                    });
                }
            }
            Err(e) => {
                ssh_batch_probe_detail = Some(format!("failed to spawn ssh: {e}"));
            }
        }
    }

    Ok(PreflightReport {
        profile_id: args.profile_id.clone(),
        sshuttle_path,
        ssh_path,
        host_resolved,
        resolved_addresses: dns.addresses,
        dns_elapsed_ms: dns.elapsed_ms.min(u128::from(u64::MAX)) as u64,
        ssh_batch_probe_ok,
        ssh_batch_probe_detail,
        skipped_ssh_probe,
        skipped_reason,
    })
}

fn build_ssh_target(cfg: &crate::sshuttle::command::SshuttleConfig) -> String {
    let host = cfg.host.trim();
    if cfg.username.trim().is_empty() {
        host.to_string()
    } else {
        format!("{}@{}", cfg.username.trim(), host)
    }
}
