use crate::error::AppResult;
use crate::ssh::{discover_keys, parse_ssh_config, SshHostEntry, SshKeyInfo};

#[tauri::command]
#[specta::specta]
pub fn list_ssh_keys() -> AppResult<Vec<SshKeyInfo>> {
    discover_keys()
}

#[tauri::command]
#[specta::specta]
pub fn list_ssh_hosts() -> AppResult<Vec<SshHostEntry>> {
    let path = directories::UserDirs::new().map(|u| u.home_dir().join(".ssh").join("config"));
    match path {
        Some(p) => parse_ssh_config(p),
        None => Ok(vec![]),
    }
}
