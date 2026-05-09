use std::sync::Arc;

use serde::Serialize;
use tauri::State;

use crate::error::AppResult;
use crate::network::{list_interfaces, sample_default_route, NetInterface, RouteSample};
use crate::security::keychain::StoredSecret;
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct EnvironmentReport {
    pub sshuttle_path: Option<String>,
    pub sshuttle_version: Option<String>,
    pub os: String,
    pub arch: String,
    pub data_dir: String,
}

#[tauri::command]
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
pub fn list_network_interfaces() -> AppResult<Vec<NetInterface>> {
    list_interfaces()
}

#[tauri::command]
pub fn current_default_route() -> AppResult<RouteSample> {
    sample_default_route()
}

#[tauri::command]
pub fn secret_set(
    key: String,
    value: String,
    state: State<'_, Arc<AppState>>,
) -> AppResult<StoredSecret> {
    state.secrets.set(&key, &value)?;
    Ok(state.secrets.presence(&key))
}

#[tauri::command]
pub fn secret_delete(key: String, state: State<'_, Arc<AppState>>) -> AppResult<()> {
    state.secrets.delete(&key)
}

#[tauri::command]
pub fn secret_presence(key: String, state: State<'_, Arc<AppState>>) -> StoredSecret {
    state.secrets.presence(&key)
}

#[tauri::command]
pub fn refresh_tray_menu(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> AppResult<()> {
    let profiles = crate::storage::profiles::ProfileRepo::new(&state.db).list()?;
    let tray_profiles: Vec<crate::system::tray::TrayProfile> = profiles
        .into_iter()
        .map(|p| crate::system::tray::TrayProfile {
            id: p.id,
            name: p.name,
            favorite: p.favorite,
        })
        .collect();
    crate::system::tray::rebuild_menu(&app, &tray_profiles)
}

#[tauri::command]
pub fn set_tray_status(app: tauri::AppHandle, text: String) -> AppResult<()> {
    crate::system::tray::set_status(&app, &text)
}
