use serde::Serialize;
use tauri_plugin_updater::UpdaterExt;

use crate::error::{AppError, AppResult};

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AppVersionInfo {
    pub version: String,
    pub tauri_version: String,
    pub build_profile: &'static str,
    pub commit_hash: Option<String>,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub available: bool,
    pub current_version: String,
    pub new_version: Option<String>,
    pub notes: Option<String>,
    pub disabled_reason: Option<String>,
}

pub(crate) fn build_app_version_info(app: &tauri::AppHandle) -> AppResult<AppVersionInfo> {
    Ok(AppVersionInfo {
        version: app.package_info().version.to_string(),
        tauri_version: "2.1".to_string(),
        build_profile: if cfg!(debug_assertions) {
            "debug"
        } else {
            "release"
        },
        commit_hash: option_env!("GIT_COMMIT_HASH").map(str::to_string),
    })
}

#[tauri::command]
#[specta::specta]
pub fn app_version_info(app: tauri::AppHandle) -> AppResult<AppVersionInfo> {
    build_app_version_info(&app)
}

#[tauri::command]
#[specta::specta]
pub async fn check_for_update(app: tauri::AppHandle) -> AppResult<UpdateCheckResult> {
    let current_version = app.package_info().version.to_string();

    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            return Ok(UpdateCheckResult {
                available: false,
                current_version,
                new_version: None,
                notes: None,
                disabled_reason: Some(e.to_string()),
            });
        }
    };

    match updater.check().await {
        Ok(Some(update)) => Ok(UpdateCheckResult {
            available: true,
            current_version,
            new_version: Some(update.version.clone()),
            notes: update.body.clone(),
            disabled_reason: None,
        }),
        Ok(None) => Ok(UpdateCheckResult {
            available: false,
            current_version,
            new_version: None,
            notes: None,
            disabled_reason: None,
        }),
        Err(e) => Ok(UpdateCheckResult {
            available: false,
            current_version,
            new_version: None,
            notes: None,
            disabled_reason: Some(e.to_string()),
        }),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn install_update(app: tauri::AppHandle) -> AppResult<()> {
    let updater = app
        .updater()
        .map_err(|e| AppError::Io(std::io::Error::other(e.to_string())))?;
    let Some(update) = updater
        .check()
        .await
        .map_err(|e| AppError::Io(std::io::Error::other(e.to_string())))?
    else {
        return Err(AppError::Other("no update available".into()));
    };
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| AppError::Io(std::io::Error::other(e.to_string())))?;
    Ok(())
}
