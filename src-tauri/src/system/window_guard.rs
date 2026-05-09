//! Intercepts the main window's close button so we can offer the user
//! a "minimize to tray" alternative. The first time the user clicks the
//! close button we bounce a `tray:close-request` event up to the
//! frontend, which renders a confirmation dialog. Once the user has
//! made a choice (saved as `close_action_chosen` + `minimize_to_tray`)
//! we apply it automatically without prompting again.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, WindowEvent};

use crate::state::AppState;

/// Flipped to `true` by the tray "Quit" item or by the frontend when
/// the user has explicitly asked to exit. While `true`, the close
/// guard short-circuits so the OS exit flow runs unimpeded.
static QUIT_REQUESTED: AtomicBool = AtomicBool::new(false);

pub fn mark_quit_requested() {
    QUIT_REQUESTED.store(true, Ordering::SeqCst);
}

pub fn quit_requested() -> bool {
    QUIT_REQUESTED.load(Ordering::SeqCst)
}

pub fn clear_quit_requested() {
    QUIT_REQUESTED.store(false, Ordering::SeqCst);
}

/// Install the close-button interceptor on the named window. Safe to
/// call once during `setup`.
pub fn install(app: &AppHandle, window_label: &str) {
    let Some(window) = app.get_webview_window(window_label) else {
        tracing::warn!("window_guard: window '{window_label}' not found");
        return;
    };
    let handle = app.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            if quit_requested() {
                // Tray "Quit" or explicit user request — let it close.
                return;
            }

            let settings = settings_snapshot(&handle);

            if !settings.close_action_chosen {
                // First time: prevent the close, ping the frontend to
                // show its confirmation dialog. The frontend then calls
                // `apply_close_choice` which records the decision and
                // either hides the window or quits.
                api.prevent_close();
                if let Some(w) = handle.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
                let _ = handle.emit("tray:close-request", ());
                return;
            }

            if settings.minimize_to_tray {
                api.prevent_close();
                if let Some(w) = handle.get_webview_window("main") {
                    let _ = w.hide();
                }
                // One-line breadcrumb so users wonder less where the app went.
                let _ = handle.emit("tray:hidden", ());
            }
            // Otherwise: fall through to the OS exit, which fires
            // RunEvent::ExitRequested → graceful sshuttle teardown.
        }
    });
}

/// Lightweight snapshot of the bits of settings the close guard cares
/// about. We don't want to lock for long while the user is hammering
/// the close button.
struct GuardSettings {
    close_action_chosen: bool,
    minimize_to_tray: bool,
}

fn settings_snapshot(handle: &AppHandle) -> GuardSettings {
    let state = handle.state::<Arc<AppState>>();
    let settings = crate::storage::settings::SettingsRepo::new(&state.db)
        .load()
        .unwrap_or_default();
    GuardSettings {
        close_action_chosen: settings.close_action_chosen,
        minimize_to_tray: settings.minimize_to_tray,
    }
}
