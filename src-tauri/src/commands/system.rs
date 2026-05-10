use std::sync::Arc;

use serde::Serialize;
use tauri::State;

use crate::error::AppResult;
use crate::network::{list_interfaces, sample_default_route, NetInterface, RouteSample};
use crate::security::keychain::StoredSecret;
use crate::state::AppState;

#[derive(Debug, Serialize, specta::Type)]
pub struct EnvironmentReport {
    pub sshuttle_path: Option<String>,
    pub sshuttle_version: Option<String>,
    pub os: String,
    pub arch: String,
    pub data_dir: String,
}

#[tauri::command]
#[specta::specta]
pub fn environment(state: State<'_, Arc<AppState>>) -> AppResult<EnvironmentReport> {
    let sshuttle_path = crate::sshuttle::find_sshuttle().map(|p| p.to_string_lossy().to_string());

    let sshuttle_version = sshuttle_path.as_ref().and_then(|p| {
        std::process::Command::new(p)
            .arg("--version")
            .env("PATH", crate::sshuttle::extended_path())
            .output()
            .ok()
            .map(|o| {
                let stdout = String::from_utf8_lossy(&o.stdout);
                let stderr = String::from_utf8_lossy(&o.stderr);
                stdout
                    .lines()
                    .chain(stderr.lines())
                    .next()
                    .unwrap_or("")
                    .to_string()
            })
    });

    Ok(EnvironmentReport {
        sshuttle_path,
        sshuttle_version,
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        data_dir: state.data_dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
#[specta::specta]
pub fn list_network_interfaces() -> AppResult<Vec<NetInterface>> {
    list_interfaces()
}

#[tauri::command]
#[specta::specta]
pub fn current_default_route() -> AppResult<RouteSample> {
    sample_default_route()
}

#[tauri::command]
#[specta::specta]
pub fn secret_set(
    key: String,
    value: String,
    state: State<'_, Arc<AppState>>,
) -> AppResult<StoredSecret> {
    state.secrets.set(&key, &value)?;
    Ok(state.secrets.presence(&key))
}

#[tauri::command]
#[specta::specta]
pub fn secret_delete(key: String, state: State<'_, Arc<AppState>>) -> AppResult<()> {
    state.secrets.delete(&key)
}

#[tauri::command]
#[specta::specta]
pub fn secret_presence(key: String, state: State<'_, Arc<AppState>>) -> StoredSecret {
    state.secrets.presence(&key)
}

#[tauri::command]
#[specta::specta]
pub fn update_tray(app: tauri::AppHandle, state: crate::system::tray::TrayState) -> AppResult<()> {
    crate::system::tray::apply_state(&app, &state)
}

#[tauri::command]
#[specta::specta]
pub fn list_orphan_sshuttle_processes(
) -> AppResult<Vec<crate::sshuttle::process_scanner::SshuttleProcess>> {
    crate::sshuttle::process_scanner::scan_sshuttle_processes()
}

/// Panic button: terminates every running sshuttle on the host (TERM
/// then KILL). When `use_saved_sudo_password` is true and a sudo
/// password is stored in the OS keychain under `SUDO_PASSWORD_KEY`,
/// we use it to elevate the kill on privileged children.
#[derive(Debug, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ForceKillArgs {
    #[serde(default)]
    pub use_saved_sudo_password: bool,
}

#[tauri::command]
#[specta::specta]
pub async fn force_kill_all_sshuttle(
    args: ForceKillArgs,
    state: tauri::State<'_, Arc<AppState>>,
) -> AppResult<usize> {
    // Disarm any auto-reconnect inside our own manager first — we don't
    // want to race a respawn while we're cleaning house.
    let _ = state.sshuttle.stop().await;

    let saved = if args.use_saved_sudo_password {
        state
            .secrets
            .get(crate::commands::sudo::SUDO_PASSWORD_KEY)
            .ok()
            .flatten()
    } else {
        None
    };
    let killed = crate::sshuttle::process_scanner::force_kill_all(saved.as_deref()).await?;

    // Anything we just nuked is by definition no longer "active" —
    // close out any stale active_session row and any open history row
    // so the DB reflects reality.
    let session_repo = crate::storage::active_session::ActiveSessionRepo::new(&state.db);
    if let Ok(Some(active)) = session_repo.load() {
        if let Some(id) = active.history_id {
            let _ = crate::storage::history::HistoryRepo::new(&state.db).record_end(
                id,
                "force_killed",
                0,
                0,
                Some("force_kill_all panic button invoked by user"),
            );
        }
        let _ = session_repo.clear();
    }
    Ok(killed)
}
