#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

pub mod automation;
pub mod bindings_export;
pub mod commands;
pub mod dns;
pub mod error;
pub mod network;
pub mod security;
pub mod ssh;
pub mod sshuttle;
pub mod state;
pub mod storage;
pub mod system;

use tauri::{Manager, RunEvent};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

use crate::commands::{
    backup as backup_cmd, connection as conn_cmd, diagnostics as diag_cmd, dns as dns_cmd,
    logs as log_cmd, network as net_cmd, preflight as pre_cmd, profiles as prof_cmd,
    settings as set_cmd, ssh as ssh_cmd, ssh_import as ssh_imp_cmd, sudo as sudo_cmd,
    support as support_cmd, system as sys_cmd, touch_id_sudo as tid_cmd, update as update_cmd,
    window as win_cmd,
};
use crate::state::AppState;

/// Application entry point invoked from `main.rs`. Kept in `lib.rs` so it
/// can be unit-tested and reused from other binaries / integration tests.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with(fmt::layer().with_target(false))
        .try_init();

    // Regenerate `src/bindings.ts` whenever the dev binary starts. The
    // runtime invoke pipeline below is unchanged — tauri-specta is used
    // only for compile-time type generation during this incremental
    // migration.
    #[cfg(debug_assertions)]
    if let Err(e) = bindings_export::export_bindings() {
        tracing::warn!("bindings export skipped: {e}");
    }

    let app = tauri::Builder::default()
        // `single-instance` MUST be registered before any window is
        // built so a second launch (e.g. via `open sshuttle-ui://…`)
        // forwards its args to the existing app instead of opening
        // a duplicate. The closure runs inside the *running* app.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // The first arg is the binary path; the rest may include
            // a `sshuttle-ui://…` URL on Windows/Linux.
            let urls: Vec<String> = argv
                .into_iter()
                .skip(1)
                .filter(|a| a.starts_with("sshuttle-ui://"))
                .collect();
            if !urls.is_empty() {
                crate::system::deep_link::handle_urls(app, urls);
            } else if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();

            // Wire tauri-specta typed events into this app handle so
            // backend `RuntimeEvent::Foo.emit(&handle)?` calls reach
            // the typed `events.runtimeEvent.listen(...)` on the JS
            // side. Must happen before any `emit()` below.
            bindings_export::mount(&handle);

            // Subscribe to deep-link open requests delivered while the
            // app is running. On macOS the plugin captures the
            // `apple-url-event` Cocoa event; on Linux/Windows
            // single-instance routes argv into this same channel via
            // the `deep-link` feature.
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let h = handle.clone();
                app.deep_link().on_open_url(move |event| {
                    let urls: Vec<String> = event.urls().iter().map(|u| u.to_string()).collect();
                    crate::system::deep_link::handle_urls(&h, urls);
                });

                // Replay any URL the app was launched with (cold start).
                if let Ok(Some(urls)) = app.deep_link().get_current() {
                    let urls: Vec<String> = urls.iter().map(|u| u.to_string()).collect();
                    crate::system::deep_link::handle_urls(&handle, urls);
                }
            }

            let state = AppState::new(&handle).map_err(|e| -> Box<dyn std::error::Error> {
                Box::new(std::io::Error::other(e.to_string()))
            })?;
            app.manage(state);

            if let Err(e) = crate::system::install_tray(&handle) {
                tracing::warn!("failed to install tray: {e}");
            }

            // Intercept the main window's close button so we can offer
            // "minimize to tray" instead of fully closing. Tray "Quit"
            // and Cmd+Q still exit cleanly via RunEvent::ExitRequested.
            crate::system::window_guard::install(&handle, "main");

            // Reconcile any persisted active_session row from a
            // previous run. If the process is gone the row gets closed
            // out as `crashed` so we don't leak open history rows
            // across launches.
            reconcile_active_session(&handle);

            // Look for orphan sshuttle processes from a previous (possibly
            // crashed) session and announce them to the frontend via the
            // global event bus. The frontend renders a banner / dialog.
            spawn_orphan_announcer(handle.clone());

            // Watch for sleep/wake and default-route changes; the frontend
            // supervisor reacts by triggering a reconnect when supervised.
            crate::system::watcher::spawn(handle.clone());

            // Periodic throughput + latency sampler. Idle when the tunnel
            // is not running.
            crate::sshuttle::sampler::spawn(handle.clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // connection
            conn_cmd::connection_state,
            conn_cmd::start_by_profile,
            conn_cmd::start_ad_hoc,
            conn_cmd::stop,
            conn_cmd::restart,
            conn_cmd::preview_command,
            // profiles
            prof_cmd::list_profiles,
            prof_cmd::get_profile,
            prof_cmd::create_profile,
            prof_cmd::update_profile,
            prof_cmd::delete_profile,
            prof_cmd::duplicate_profile,
            prof_cmd::export_profiles,
            prof_cmd::import_profiles,
            prof_cmd::set_profile_password,
            prof_cmd::clear_profile_password,
            prof_cmd::profile_password_status,
            prof_cmd::reorder_profiles,
            // settings
            set_cmd::get_settings,
            set_cmd::save_settings,
            set_cmd::data_dir,
            backup_cmd::export_full_backup,
            backup_cmd::export_full_backup_to_path,
            backup_cmd::import_full_backup,
            backup_cmd::import_full_backup_from_path,
            // logs
            log_cmd::fetch_logs,
            log_cmd::clear_logs,
            log_cmd::export_logs,
            log_cmd::list_history,
            log_cmd::history_daily_totals,
            // preflight + network
            pre_cmd::preflight_profile,
            net_cmd::lookup_public_ip,
            ssh_imp_cmd::import_profiles_from_ssh_config,
            // ssh
            ssh_cmd::list_ssh_keys,
            ssh_cmd::list_ssh_hosts,
            // dns
            dns_cmd::dns_resolve,
            dns_cmd::dns_flush,
            // system
            sys_cmd::environment,
            sys_cmd::list_network_interfaces,
            sys_cmd::current_default_route,
            sys_cmd::secret_set,
            sys_cmd::secret_delete,
            sys_cmd::secret_presence,
            sys_cmd::update_tray,
            // diagnostics
            diag_cmd::run_diagnostics,
            // sudo
            sudo_cmd::sudo_status,
            sudo_cmd::sudo_authenticate,
            sudo_cmd::sudo_forget,
            tid_cmd::touch_id_sudo_status,
            tid_cmd::touch_id_sudo_set_enabled,
            // process scanner / panic button
            sys_cmd::list_orphan_sshuttle_processes,
            sys_cmd::force_kill_all_sshuttle,
            // window / close behaviour
            win_cmd::apply_close_choice,
            win_cmd::hide_main_window,
            win_cmd::show_main_window,
            win_cmd::quit_app,
            // about / updater / support
            update_cmd::app_version_info,
            update_cmd::check_for_update,
            update_cmd::install_update,
            support_cmd::generate_support_bundle,
        ])
        .build(tauri::generate_context!())
        .expect("error while building sshuttle UI");

    app.run(|app_handle, event| {
        if let RunEvent::ExitRequested { .. } = &event {
            // Make sure our managed sshuttle (if any) is reaped before
            // the OS forgets about us. We bound the wait so a stuck
            // child can't keep the dock icon spinning forever.
            let state = app_handle.state::<std::sync::Arc<AppState>>();
            let stop_fut = async move {
                let _ =
                    tokio::time::timeout(std::time::Duration::from_secs(3), state.sshuttle.stop())
                        .await;
            };
            tauri::async_runtime::block_on(stop_fut);
        }
    });
}

/// Reconcile the persisted `active_session` row at startup.
///
/// Three possible states:
///   1. No active_session row → nothing to do.
///   2. Active session row + a live sshuttle process exists → leave
///      the row alone; the orphan banner / "adopt this process" flow
///      will let the user decide.
///   3. Active session row + no live process → the previous run died
///      mid-session. Close the matching history row as `crashed` and
///      drop the active_session marker so it doesn't reappear.
fn reconcile_active_session(handle: &tauri::AppHandle) {
    use std::sync::Arc;
    let state = handle.state::<Arc<state::AppState>>();
    let repo = crate::storage::active_session::ActiveSessionRepo::new(&state.db);
    let session = match repo.load() {
        Ok(Some(s)) => s,
        Ok(None) => return,
        Err(e) => {
            tracing::warn!("active session load failed: {e}");
            return;
        }
    };

    let live = crate::sshuttle::process_scanner::scan_sshuttle_processes()
        .map(|v| !v.is_empty())
        .unwrap_or(false);

    if live {
        tracing::info!(
            "active session for profile {:?} survives in process table; \
             leaving for orphan-recovery flow",
            session.profile_name
        );
        return;
    }

    tracing::info!(
        "active session for profile {:?} has no live process; marking history as crashed",
        session.profile_name
    );
    if let Some(id) = session.history_id {
        let _ = crate::storage::history::HistoryRepo::new(&state.db).record_end(
            id,
            "crashed",
            0,
            0,
            Some("app exited before tunnel was disconnected"),
        );
    }
    let _ = repo.clear();
}

/// Background task: waits a short moment so the frontend has a chance
/// to subscribe to runtime events, then scans for orphan sshuttle
/// processes and emits a `RuntimeEvent::OrphansDetected` if any were
/// found. The frontend listens for this and renders an actionable
/// banner.
fn spawn_orphan_announcer(handle: tauri::AppHandle) {
    use crate::sshuttle::event::RuntimeEvent;
    use tauri_specta::Event as _;

    tauri::async_runtime::spawn(async move {
        // Wait long enough for `useBoot` to attach its listener.
        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;

        let processes = match crate::sshuttle::process_scanner::scan_sshuttle_processes() {
            Ok(v) => v,
            Err(e) => {
                tracing::warn!("orphan scan failed: {e}");
                return;
            }
        };
        if processes.is_empty() {
            return;
        }
        tracing::info!(
            "found {} orphan sshuttle process(es) at startup",
            processes.len()
        );
        let event = RuntimeEvent::OrphansDetected {
            processes,
            timestamp: chrono::Utc::now(),
        };
        if let Err(e) = event.emit(&handle) {
            tracing::warn!("orphan announcement emit failed: {e}");
        }
    });
}
