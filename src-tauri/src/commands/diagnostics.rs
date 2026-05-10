use std::sync::Arc;

use serde::Serialize;
use tauri::State;

use crate::error::AppResult;
use crate::network::monitor::PingResult;
use crate::network::{ping_host, sample_default_route, RouteSample};
use crate::state::AppState;
use crate::storage::history::HistoryRepo;

#[derive(Debug, Serialize)]
pub struct DiagnosticsBundle {
    pub default_route: Option<RouteSample>,
    pub ping_8888: Option<PingResult>,
    pub ping_cloudflare: Option<PingResult>,
    pub recent_history_count: usize,
}

#[tauri::command]
pub fn run_diagnostics(state: State<'_, Arc<AppState>>) -> AppResult<DiagnosticsBundle> {
    let default_route = sample_default_route().ok();
    let ping_8888 = ping_host("8.8.8.8").ok();
    let ping_cloudflare = ping_host("1.1.1.1").ok();
    let recent_history_count = HistoryRepo::new(&state.db)
        .list(50)
        .map(|v| v.len())
        .unwrap_or(0);

    Ok(DiagnosticsBundle {
        default_route,
        ping_8888,
        ping_cloudflare,
        recent_history_count,
    })
}
