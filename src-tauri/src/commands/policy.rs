use std::sync::Arc;

use tauri::State;

use crate::error::AppResult;
use crate::policy::PolicyOverrides;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub fn get_policy(state: State<'_, Arc<AppState>>) -> AppResult<PolicyOverrides> {
    Ok((*state.policy).clone())
}
