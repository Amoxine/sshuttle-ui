use serde::{Serialize, Serializer};
use thiserror::Error;

/// Top-level application error type. Implements `Serialize` so commands can
/// return it directly to the frontend with a useful message.
#[derive(Debug, Error)]
pub enum AppError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("keyring error: {0}")]
    Keyring(#[from] keyring::Error),

    #[error("regex error: {0}")]
    Regex(#[from] regex::Error),

    #[error("tauri error: {0}")]
    Tauri(#[from] tauri::Error),

    #[error(
        "sshuttle binary not found. Searched PATH and common locations \
         (/opt/homebrew/bin, /usr/local/bin, ~/.local/bin). \
         Install via `brew install sshuttle` (macOS) or `apt install sshuttle` (Debian/Ubuntu)."
    )]
    SshuttleMissing,

    #[error("sshuttle is already running")]
    AlreadyRunning,

    #[error("sshuttle is not running")]
    NotRunning,

    #[error("profile not found: {0}")]
    ProfileNotFound(String),

    #[error("invalid input: {0}")]
    Invalid(String),

    #[error("operation failed: {0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        AppError::Other(err.to_string())
    }
}

impl From<&str> for AppError {
    fn from(value: &str) -> Self {
        AppError::Other(value.to_string())
    }
}

impl From<String> for AppError {
    fn from(value: String) -> Self {
        AppError::Other(value)
    }
}

pub type AppResult<T> = std::result::Result<T, AppError>;
