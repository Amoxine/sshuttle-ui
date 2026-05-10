//! Tray menu action handlers. These are invoked directly from the
//! tray's `on_menu_event` callback (rather than going through the
//! Tauri event bus) so they always run regardless of whether any
//! frontend listener is registered.

use std::sync::Arc;

use tauri::{AppHandle, Manager};

use crate::error::AppResult;
use crate::state::AppState;

/// Tray "Connect default profile" action. Resolves the user-configured
/// default profile and starts it (or no-ops if none is set).
pub async fn autoconnect_default(app: &AppHandle) -> AppResult<()> {
    let state = app.state::<Arc<AppState>>();
    let settings = crate::storage::settings::SettingsRepo::new(&state.db).load()?;
    let Some(id) = settings.default_profile_id.clone() else {
        tracing::info!("tray: no default profile configured");
        return Ok(());
    };
    connect_specific_profile(app, &id).await
}

/// Tray "Connect to <profile>" action. Looks up the profile and starts
/// the tunnel for it. Refuses to overlap an existing connection.
pub async fn connect_specific_profile(app: &AppHandle, profile_id: &str) -> AppResult<()> {
    let state = app.state::<Arc<AppState>>();
    if state.sshuttle.is_running() {
        return Err(crate::error::AppError::AlreadyRunning);
    }
    let profile = crate::storage::profiles::ProfileRepo::new(&state.db).get(profile_id)?;
    let saved_password = if matches!(profile.config.auth, crate::sshuttle::SshAuth::Password) {
        state
            .secrets
            .get(&crate::security::keychain::profile_password_key(
                &profile.id,
            ))?
    } else {
        None
    };
    let history_id =
        crate::storage::history::HistoryRepo::new(&state.db).record_start(Some(&profile.id))?;
    if let Err(e) = state
        .sshuttle
        .start(
            &profile.config,
            Some(&profile.id),
            Some(&profile.name),
            false,
            saved_password,
            Some(history_id),
        )
        .await
    {
        let _ = crate::storage::history::HistoryRepo::new(&state.db).record_end(
            history_id,
            "failed",
            0,
            0,
            Some(&e.to_string()),
        );
        return Err(e);
    }
    Ok(())
}

/// Tray "Disconnect" action.
pub async fn disconnect_current(app: &AppHandle) -> AppResult<()> {
    let state = app.state::<Arc<AppState>>();
    state.sshuttle.stop().await
}
