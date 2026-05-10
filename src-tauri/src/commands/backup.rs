//! Full-database backup export/import (profiles + app settings JSON).
//! Keychain secrets (SSH/sudo passwords) are **not** included — document that in the UI.

use std::path::Path;
use std::sync::Arc;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::storage::profiles::Profile;
use crate::storage::settings::AppSettings;

pub const BACKUP_FORMAT_VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize)]
pub struct FullBackup {
    pub format_version: u32,
    pub exported_at: String,
    pub app: AppSettings,
    pub profiles: Vec<Profile>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportBackupFromPathArgs {
    pub path: String,
    pub merge_profiles: bool,
    pub apply_settings: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportBackupArgs {
    pub json: String,
    /// When false, all existing profiles are deleted before importing.
    pub merge_profiles: bool,
    /// When true, replace app settings with those from the backup.
    pub apply_settings: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportBackupResult {
    pub profiles_written: usize,
    pub settings_applied: bool,
}

#[tauri::command]
pub fn export_full_backup(state: State<'_, Arc<AppState>>) -> AppResult<String> {
    build_backup_json(&state)
}

/// Writes the same payload as [`export_full_backup`] after the user picks a path in the UI.
#[tauri::command]
pub fn export_full_backup_to_path(
    path: String,
    state: State<'_, Arc<AppState>>,
) -> AppResult<()> {
    let s = build_backup_json(&state)?;
    if let Some(parent) = Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(crate::error::AppError::Io)?;
    }
    std::fs::write(path, s).map_err(crate::error::AppError::Io)?;
    Ok(())
}

fn build_backup_json(state: &Arc<AppState>) -> AppResult<String> {
    let settings = crate::storage::settings::SettingsRepo::new(&state.db).load()?;
    let profiles = crate::storage::profiles::ProfileRepo::new(&state.db).list()?;
    let backup = FullBackup {
        format_version: BACKUP_FORMAT_VERSION,
        exported_at: Utc::now().to_rfc3339(),
        app: settings,
        profiles,
    };
    serde_json::to_string_pretty(&backup).map_err(Into::into)
}

#[tauri::command]
pub fn import_full_backup_from_path(
    args: ImportBackupFromPathArgs,
    state: State<'_, Arc<AppState>>,
) -> AppResult<ImportBackupResult> {
    let json = std::fs::read_to_string(&args.path).map_err(crate::error::AppError::Io)?;
    import_full_backup_impl(
        ImportBackupArgs {
            json,
            merge_profiles: args.merge_profiles,
            apply_settings: args.apply_settings,
        },
        &state,
    )
}

#[tauri::command]
pub fn import_full_backup(
    args: ImportBackupArgs,
    state: State<'_, Arc<AppState>>,
) -> AppResult<ImportBackupResult> {
    import_full_backup_impl(args, &state)
}

fn import_full_backup_impl(
    args: ImportBackupArgs,
    state: &Arc<AppState>,
) -> AppResult<ImportBackupResult> {
    let incoming: FullBackup = serde_json::from_str(&args.json).map_err(|e| {
        AppError::Invalid(format!("invalid backup JSON: {e}"))
    })?;
    if incoming.format_version != BACKUP_FORMAT_VERSION {
        return Err(AppError::Invalid(format!(
            "unsupported backup format_version {} (expected {})",
            incoming.format_version, BACKUP_FORMAT_VERSION
        )));
    }

    let repo = crate::storage::profiles::ProfileRepo::new(&state.db);
    let mut count = 0usize;

    if args.merge_profiles {
        for p in &incoming.profiles {
            repo.put_profile(p)?;
            count += 1;
        }
    } else {
        repo.delete_all()?;
        for p in &incoming.profiles {
            repo.put_profile(p)?;
            count += 1;
        }
    }

    let settings_applied = args.apply_settings;
    if settings_applied {
        crate::storage::settings::SettingsRepo::new(&state.db).save(&incoming.app)?;
    }

    Ok(ImportBackupResult {
        profiles_written: count,
        settings_applied,
    })
}
