use std::sync::Arc;

use serde::Deserialize;
use tauri::State;

use crate::error::AppResult;
use crate::security::keychain::{profile_password_key, StoredSecret};
use crate::state::AppState;
use crate::storage::profiles::{NewProfile, Profile, ProfileRepo, ProfileUpdate};

#[derive(Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ReorderProfilesArgs {
    pub ordered_ids: Vec<String>,
}

#[tauri::command]
#[specta::specta]
pub fn list_profiles(state: State<'_, Arc<AppState>>) -> AppResult<Vec<Profile>> {
    ProfileRepo::new(&state.db).list()
}

#[tauri::command]
#[specta::specta]
pub fn get_profile(id: String, state: State<'_, Arc<AppState>>) -> AppResult<Profile> {
    ProfileRepo::new(&state.db).get(&id)
}

#[tauri::command]
#[specta::specta]
pub fn create_profile(profile: NewProfile, state: State<'_, Arc<AppState>>) -> AppResult<Profile> {
    ProfileRepo::new(&state.db).create(profile)
}

#[tauri::command]
#[specta::specta]
pub fn update_profile(
    id: String,
    patch: ProfileUpdate,
    state: State<'_, Arc<AppState>>,
) -> AppResult<Profile> {
    ProfileRepo::new(&state.db).update(&id, patch)
}

#[tauri::command]
#[specta::specta]
pub fn delete_profile(id: String, state: State<'_, Arc<AppState>>) -> AppResult<()> {
    ProfileRepo::new(&state.db).delete(&id)
}

#[tauri::command]
#[specta::specta]
pub fn reorder_profiles(
    args: ReorderProfilesArgs,
    state: State<'_, Arc<AppState>>,
) -> AppResult<()> {
    ProfileRepo::new(&state.db).reorder(&args.ordered_ids)
}

#[tauri::command]
#[specta::specta]
pub fn duplicate_profile(id: String, state: State<'_, Arc<AppState>>) -> AppResult<Profile> {
    ProfileRepo::new(&state.db).duplicate(&id)
}

#[tauri::command]
#[specta::specta]
pub fn export_profiles(state: State<'_, Arc<AppState>>) -> AppResult<String> {
    let profiles = ProfileRepo::new(&state.db).list()?;
    Ok(serde_json::to_string_pretty(&profiles)?)
}

#[tauri::command]
#[specta::specta]
pub fn import_profiles(json: String, state: State<'_, Arc<AppState>>) -> AppResult<Vec<Profile>> {
    let incoming: Vec<NewProfile> = serde_json::from_str(&json)?;
    let repo = ProfileRepo::new(&state.db);
    let mut imported = Vec::new();
    for p in incoming {
        imported.push(repo.create(p)?);
    }
    Ok(imported)
}

/// Save the SSH password for a profile in the platform keychain. The
/// password value is never persisted in the SQLite store.
#[tauri::command]
#[specta::specta]
pub fn set_profile_password(
    profile_id: String,
    password: String,
    state: State<'_, Arc<AppState>>,
) -> AppResult<StoredSecret> {
    // Sanity-check the profile exists so we don't orphan a keychain entry.
    let _ = ProfileRepo::new(&state.db).get(&profile_id)?;
    let key = profile_password_key(&profile_id);
    state.secrets.set(&key, &password)?;
    Ok(state.secrets.presence(&key))
}

#[tauri::command]
#[specta::specta]
pub fn clear_profile_password(
    profile_id: String,
    state: State<'_, Arc<AppState>>,
) -> AppResult<()> {
    state.secrets.delete(&profile_password_key(&profile_id))
}

#[tauri::command]
#[specta::specta]
pub fn profile_password_status(
    profile_id: String,
    state: State<'_, Arc<AppState>>,
) -> StoredSecret {
    state.secrets.presence(&profile_password_key(&profile_id))
}
