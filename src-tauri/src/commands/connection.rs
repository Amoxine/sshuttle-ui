use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::security::keychain::profile_password_key;
use crate::sshuttle::manager::ConnectionState;
use crate::sshuttle::{SshAuth, SshuttleConfig};
use crate::state::AppState;
use crate::storage::history::HistoryRepo;
use crate::storage::profiles::ProfileRepo;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartByProfileArgs {
    #[serde(alias = "profileId")]
    pub profile_id: String,
    #[serde(default)]
    pub sudo: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartAdHocArgs {
    pub config: SshuttleConfig,
    #[serde(default)]
    pub sudo: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewArgsOut {
    pub command: String,
    pub args: Vec<String>,
}

#[tauri::command]
pub fn connection_state(state: State<'_, Arc<AppState>>) -> ConnectionState {
    state.sshuttle.state()
}

#[tauri::command]
pub async fn start_by_profile(
    args: StartByProfileArgs,
    state: State<'_, Arc<AppState>>,
) -> AppResult<ConnectionState> {
    let profile = ProfileRepo::new(&state.db).get(&args.profile_id)?;
    let saved_password = if matches!(profile.config.auth, SshAuth::Password) {
        state.secrets.get(&profile_password_key(&profile.id))?
    } else {
        None
    };
    let history_id = HistoryRepo::new(&state.db).record_start(Some(&profile.id))?;
    match state
        .sshuttle
        .start(
            &profile.config,
            Some(&profile.id),
            Some(&profile.name),
            args.sudo,
            saved_password,
            Some(history_id),
        )
        .await
    {
        Ok(snapshot) => Ok(snapshot),
        Err(e) => {
            // Spawn failed before manager.start() got far enough to own
            // the row — close it out so the DB doesn't accumulate
            // never-ended sessions.
            let _ = HistoryRepo::new(&state.db).record_end(
                history_id,
                "failed",
                0,
                0,
                Some(&e.to_string()),
            );
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn start_ad_hoc(
    args: StartAdHocArgs,
    state: State<'_, Arc<AppState>>,
) -> AppResult<ConnectionState> {
    // Ad-hoc connections don't have a profile id, so they cannot use the
    // keychain. Password auth requires a saved profile credential.
    let history_id = HistoryRepo::new(&state.db).record_start(None)?;
    match state
        .sshuttle
        .start(&args.config, None, None, args.sudo, None, Some(history_id))
        .await
    {
        Ok(snapshot) => Ok(snapshot),
        Err(e) => {
            let _ = HistoryRepo::new(&state.db).record_end(
                history_id,
                "failed",
                0,
                0,
                Some(&e.to_string()),
            );
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn stop(state: State<'_, Arc<AppState>>) -> AppResult<()> {
    state.sshuttle.stop().await
}

#[tauri::command]
pub async fn restart(state: State<'_, Arc<AppState>>) -> AppResult<ConnectionState> {
    let current = state.sshuttle.state();
    let Some(profile_id) = current.profile_id.clone() else {
        return Err(AppError::Invalid(
            "cannot restart an ad-hoc connection — start it again from the dashboard".into(),
        ));
    };
    let _ = state.sshuttle.stop().await; // ignore "not running" errors
    start_by_profile(
        StartByProfileArgs {
            profile_id,
            sudo: false,
        },
        state,
    )
    .await
}

#[tauri::command]
pub fn preview_command(config: SshuttleConfig) -> AppResult<PreviewArgsOut> {
    config.validate()?;
    Ok(PreviewArgsOut {
        command: config.preview_command(),
        args: config.build_args(),
    })
}
