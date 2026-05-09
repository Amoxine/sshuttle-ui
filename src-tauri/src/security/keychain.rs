use keyring::Entry;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

const SERVICE: &str = "io.sshuttle.ui";

/// Stable keychain key for a given profile's saved SSH password. Centralizing
/// this prevents drift between the manager that reads it and the commands
/// that write/clear it.
pub fn profile_password_key(profile_id: &str) -> String {
    format!("profile-pwd-{profile_id}")
}

/// Secret storage abstraction backed by the platform's native credential
/// manager (Keychain on macOS, Credential Manager on Windows, Secret Service
/// on Linux). The `keyring` crate handles the platform differences.
#[derive(Clone, Debug)]
pub struct SecretStore;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredSecret {
    pub key: String,
    pub has_value: bool,
}

impl SecretStore {
    pub fn new() -> Self {
        Self
    }

    pub fn set(&self, key: &str, value: &str) -> AppResult<()> {
        let entry = Entry::new(SERVICE, key)?;
        entry.set_password(value)?;
        Ok(())
    }

    pub fn get(&self, key: &str) -> AppResult<Option<String>> {
        let entry = Entry::new(SERVICE, key)?;
        match entry.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AppError::Keyring(e)),
        }
    }

    pub fn delete(&self, key: &str) -> AppResult<()> {
        let entry = Entry::new(SERVICE, key)?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(AppError::Keyring(e)),
        }
    }

    pub fn presence(&self, key: &str) -> StoredSecret {
        StoredSecret {
            key: key.to_string(),
            has_value: matches!(self.get(key), Ok(Some(_))),
        }
    }
}

impl Default for SecretStore {
    fn default() -> Self {
        Self::new()
    }
}
