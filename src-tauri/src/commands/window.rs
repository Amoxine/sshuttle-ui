//! Window-lifecycle commands invoked by the close-confirmation dialog.

use std::sync::Arc;

use serde::Deserialize;
use tauri::{AppHandle, Manager};

use crate::error::AppResult;
use crate::state::AppState;

#[derive(Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CloseChoiceArgs {
    /// `"minimize"` → hide window, keep tunnel running.
    /// `"quit"` → graceful exit (and tunnel teardown).
    pub action: String,
    /// When true, persist the choice to settings so the dialog isn't
    /// shown again on subsequent close-button presses.
    #[serde(default)]
    pub remember: bool,
}

#[tauri::command]
#[specta::specta]
pub async fn apply_close_choice(
    args: CloseChoiceArgs,
    app: AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
) -> AppResult<()> {
    let repo = crate::storage::settings::SettingsRepo::new(&state.db);
    let mut settings = repo.load().unwrap_or_default();

    match args.action.as_str() {
        "minimize" => {
            if args.remember {
                settings.minimize_to_tray = true;
                settings.close_action_chosen = true;
                let _ = repo.save(&settings);
            }
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.hide();
            }
            Ok(())
        }
        "quit" => {
            if args.remember {
                settings.minimize_to_tray = false;
                settings.close_action_chosen = true;
                let _ = repo.save(&settings);
            }
            crate::system::window_guard::mark_quit_requested();
            // Schedule the exit on the next tick so the IPC reply
            // makes it back to the frontend before we tear down.
            let h = app.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                h.exit(0);
            });
            Ok(())
        }
        other => Err(crate::error::AppError::Invalid(format!(
            "unknown close action: {other}"
        ))),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn hide_main_window(app: AppHandle) -> AppResult<()> {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn show_main_window(app: AppHandle) -> AppResult<()> {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
    crate::system::window_guard::clear_quit_requested();
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn quit_app(app: AppHandle) -> AppResult<()> {
    crate::system::window_guard::mark_quit_requested();
    let h = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        h.exit(0);
    });
    Ok(())
}
