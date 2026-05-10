use std::sync::Arc;

use tauri::State;

use crate::audit::AuditEvent;
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub fn list_audit_events(
    limit: usize,
    state: State<'_, Arc<AppState>>,
) -> AppResult<Vec<AuditEvent>> {
    state.audit.read_recent(limit)
}

#[tauri::command]
#[specta::specta]
pub fn export_audit_log(state: State<'_, Arc<AppState>>) -> AppResult<String> {
    state.audit.export_text()
}

#[tauri::command]
#[specta::specta]
pub fn clear_audit_log(state: State<'_, Arc<AppState>>) -> AppResult<()> {
    state.audit.clear()
}
