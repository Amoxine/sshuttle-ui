use std::sync::Arc;

use tauri::State;

use crate::error::AppResult;
use crate::sshuttle::manager::LogLine;
use crate::state::AppState;
use crate::storage::history::{DailyTotal, HistoryEntry, HistoryRepo};

#[tauri::command]
#[specta::specta]
pub fn fetch_logs(limit: Option<usize>, state: State<'_, Arc<AppState>>) -> Vec<LogLine> {
    let limit = limit.unwrap_or(1_000).min(5_000);
    state.sshuttle.logs(limit)
}

#[tauri::command]
#[specta::specta]
pub fn clear_logs(state: State<'_, Arc<AppState>>) -> AppResult<()> {
    state.sshuttle.clear_logs();
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn export_logs(state: State<'_, Arc<AppState>>) -> AppResult<String> {
    let logs = state.sshuttle.logs(5_000);
    let mut out = String::new();
    for line in logs {
        out.push_str(&format!(
            "[{}] {:?} {}\n",
            line.timestamp.to_rfc3339(),
            line.level,
            line.line
        ));
    }
    Ok(out)
}

#[tauri::command]
#[specta::specta]
pub fn list_history(
    limit: Option<usize>,
    state: State<'_, Arc<AppState>>,
) -> AppResult<Vec<HistoryEntry>> {
    HistoryRepo::new(&state.db).list(limit.unwrap_or(100))
}

#[tauri::command]
#[specta::specta]
pub fn history_daily_totals(
    days: Option<u32>,
    state: State<'_, Arc<AppState>>,
) -> AppResult<Vec<DailyTotal>> {
    HistoryRepo::new(&state.db).daily_totals(days.unwrap_or(30))
}
