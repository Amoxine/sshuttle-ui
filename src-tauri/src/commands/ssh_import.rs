//! Create profiles from `~/.ssh/config` host entries.

use std::sync::Arc;

use directories::UserDirs;
use serde::Deserialize;
use tauri::State;

use crate::error::AppResult;
use crate::ssh::{parse_ssh_config, SshHostEntry};
use crate::sshuttle::command::{SshAuth, SshuttleConfig};
use crate::state::AppState;
use crate::storage::profiles::{NewProfile, Profile, ProfileRepo};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSshHostsArgs {
    /// When set, only these `Host` labels are imported. When omitted, every
    /// non-wildcard host block is imported.
    pub host_labels: Option<Vec<String>>,
}

fn config_from_ssh_host(entry: &SshHostEntry) -> SshuttleConfig {
    let (auth, identity_file) = if let Some(ref id) = entry.identity_file {
        (SshAuth::Key, Some(id.clone()))
    } else {
        (SshAuth::Agent, None)
    };
    SshuttleConfig {
        host: entry.host.clone(),
        username: entry.user.clone().unwrap_or_default(),
        port: entry.port,
        auth,
        identity_file,
        jump_hosts: entry
            .proxy_jump
            .as_ref()
            .map(|pj| {
                pj.split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect()
            })
            .unwrap_or_default(),
        ..SshuttleConfig::default()
    }
}

#[tauri::command]
pub fn import_profiles_from_ssh_config(
    args: ImportSshHostsArgs,
    state: State<'_, Arc<AppState>>,
) -> AppResult<Vec<Profile>> {
    let path = UserDirs::new()
        .map(|u| u.home_dir().join(".ssh").join("config"))
        .ok_or_else(|| crate::error::AppError::Invalid("no home directory".into()))?;

    let entries = parse_ssh_config(&path)?;
    let repo = ProfileRepo::new(&state.db);

    let filtered: Vec<_> = match &args.host_labels {
        None => entries.into_iter().collect(),
        Some(labels) => entries
            .into_iter()
            .filter(|e| labels.iter().any(|l| l == &e.host))
            .collect(),
    };

    let mut created = Vec::new();
    for entry in filtered {
        if entry.host.contains('*') {
            continue;
        }
        let cfg = config_from_ssh_host(&entry);
        if let Err(e) = cfg.validate() {
            tracing::warn!("skip host {}: {}", entry.host, e);
            continue;
        }
        let profile = repo.create(NewProfile {
            name: entry.host.clone(),
            tags: vec!["ssh-config".to_string(), "imported".to_string()],
            favorite: false,
            config: cfg,
        })?;
        created.push(profile);
    }

    Ok(created)
}
