use std::sync::Arc;

use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;
use crate::storage::settings::{AppSettings, SettingsRepo};

#[tauri::command]
pub fn get_settings(state: State<'_, Arc<AppState>>) -> AppResult<AppSettings> {
    SettingsRepo::new(&state.db).load()
}

#[tauri::command]
pub fn save_settings(
    settings: AppSettings,
    state: State<'_, Arc<AppState>>,
) -> AppResult<AppSettings> {
    let repo = SettingsRepo::new(&state.db);
    repo.save(&settings)?;
    crate::system::autostart::set_launch_at_login(settings.launch_at_login)?;
    Ok(settings)
}

#[tauri::command]
pub fn data_dir(state: State<'_, Arc<AppState>>) -> String {
    state.data_dir.to_string_lossy().to_string()
}
