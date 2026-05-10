use std::sync::Arc;

use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;
use crate::storage::settings::{AppSettings, SettingsRepo};

#[tauri::command]
#[specta::specta]
pub fn get_settings(state: State<'_, Arc<AppState>>) -> AppResult<AppSettings> {
    let mut s = SettingsRepo::new(&state.db).load()?;
    let p = &*state.policy;
    if let Some(v) = p.force_kill_switch {
        s.kill_switch = v;
    }
    if let Some(ref t) = p.lock_theme {
        s.theme = t.clone();
    }
    if let Some(ref id) = p.force_default_profile_id {
        s.default_profile_id = Some(id.clone());
    }
    Ok(s)
}

#[tauri::command]
#[specta::specta]
pub fn save_settings(
    mut settings: AppSettings,
    state: State<'_, Arc<AppState>>,
) -> AppResult<AppSettings> {
    let p = &*state.policy;
    if let Some(v) = p.force_kill_switch {
        settings.kill_switch = v;
    }
    if let Some(ref t) = p.lock_theme {
        settings.theme = t.clone();
    }
    if let Some(ref id) = p.force_default_profile_id {
        settings.default_profile_id = Some(id.clone());
    }
    let repo = SettingsRepo::new(&state.db);
    repo.save(&settings)?;
    crate::system::autostart::set_launch_at_login(settings.launch_at_login)?;
    Ok(settings)
}

#[tauri::command]
#[specta::specta]
pub fn data_dir(state: State<'_, Arc<AppState>>) -> String {
    state.data_dir.to_string_lossy().to_string()
}
