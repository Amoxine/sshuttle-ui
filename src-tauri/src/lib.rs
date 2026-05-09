#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

pub mod automation;
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

use tauri::{Listener, Manager, RunEvent};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

use crate::commands::{
    connection as conn_cmd, diagnostics as diag_cmd, dns as dns_cmd, logs as log_cmd,
    profiles as prof_cmd, settings as set_cmd, ssh as ssh_cmd, sudo as sudo_cmd,
    system as sys_cmd,
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

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let state = AppState::new(&handle).map_err(|e| -> Box<dyn std::error::Error> {
                Box::new(std::io::Error::other(e.to_string()))
            })?;
            app.manage(state);

            if let Err(e) = crate::system::install_tray(&handle) {
                tracing::warn!("failed to install tray: {e}");
            }

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

            // Wire tray events: connect/disconnect to the default profile if set.
            let handle_for_tray = handle.clone();
            handle.listen("tray:connect", move |_event| {
                let h = handle_for_tray.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = autoconnect_default(&h).await {
                        tracing::warn!("tray connect failed: {e}");
                    }
                });
            });

            let handle_for_disconnect = handle.clone();
            handle.listen("tray:disconnect", move |_event| {
                let h = handle_for_disconnect.clone();
                tauri::async_runtime::spawn(async move {
                    let state = h.state::<std::sync::Arc<AppState>>();
                    let _ = state.sshuttle.stop().await;
                });
            });

            // Tray favorites quick-connect: payload is the profile id.
            let handle_for_favs = handle.clone();
            handle.listen("tray:connect_profile", move |event| {
                let h = handle_for_favs.clone();
                // Tauri 2 wraps payload as a JSON-encoded string.
                let payload = event.payload().trim_matches('"').to_string();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = connect_specific_profile(&h, &payload).await {
                        tracing::warn!("tray favorite connect failed ({payload}): {e}");
                    }
                });
            });

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
            // settings
            set_cmd::get_settings,
            set_cmd::save_settings,
            set_cmd::data_dir,
            // logs
            log_cmd::fetch_logs,
            log_cmd::clear_logs,
            log_cmd::export_logs,
            log_cmd::list_history,
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
            // process scanner / panic button
            sys_cmd::list_orphan_sshuttle_processes,
            sys_cmd::force_kill_all_sshuttle,
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
                let _ = tokio::time::timeout(
                    std::time::Duration::from_secs(3),
                    state.sshuttle.stop(),
                )
                .await;
            };
            tauri::async_runtime::block_on(stop_fut);
        }
    });
}

/// Background task: waits a short moment so the frontend has a chance
/// to subscribe to runtime events, then scans for orphan sshuttle
/// processes and emits a `RuntimeEvent::OrphansDetected` if any were
/// found. The frontend listens for this and renders an actionable
/// banner.
fn spawn_orphan_announcer(handle: tauri::AppHandle) {
    use crate::sshuttle::event::{RuntimeEvent, RUNTIME_EVENT};
    use tauri::Emitter;

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
        if let Err(e) = handle.emit(RUNTIME_EVENT, &event) {
            tracing::warn!("orphan announcement emit failed: {e}");
        }
    });
}

async fn autoconnect_default(app: &tauri::AppHandle) -> error::AppResult<()> {
    let state = app.state::<std::sync::Arc<AppState>>();
    let settings = crate::storage::settings::SettingsRepo::new(&state.db).load()?;
    let Some(id) = settings.default_profile_id.clone() else {
        return Ok(());
    };
    connect_specific_profile(app, &id).await
}

async fn connect_specific_profile(
    app: &tauri::AppHandle,
    profile_id: &str,
) -> error::AppResult<()> {
    let state = app.state::<std::sync::Arc<AppState>>();
    let profile = crate::storage::profiles::ProfileRepo::new(&state.db).get(profile_id)?;
    let saved_password = if matches!(profile.config.auth, crate::sshuttle::SshAuth::Password) {
        state
            .secrets
            .get(&crate::security::keychain::profile_password_key(&profile.id))?
    } else {
        None
    };
    state
        .sshuttle
        .start(
            &profile.config,
            Some(&profile.id),
            Some(&profile.name),
            false,
            saved_password,
        )
        .await?;
    Ok(())
}
