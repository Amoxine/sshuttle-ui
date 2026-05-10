use std::sync::Arc;

use tauri::AppHandle;

use crate::error::AppResult;
use crate::security::SecretStore;
use crate::sshuttle::SshuttleManager;
use crate::storage::Database;

/// Aggregated application state injected as a Tauri managed state. All
/// commands receive a `tauri::State<'_, AppState>`.
#[derive(Clone)]
pub struct AppState {
    pub db: Database,
    pub sshuttle: SshuttleManager,
    pub secrets: SecretStore,
    pub data_dir: std::path::PathBuf,
    pub audit: Arc<crate::audit::AuditLog>,
    pub policy: Arc<crate::policy::PolicyOverrides>,
}

impl AppState {
    pub fn new(app: &AppHandle) -> AppResult<Arc<Self>> {
        let dirs =
            directories::ProjectDirs::from("io", "sshuttle", "sshuttle-ui").ok_or_else(|| {
                crate::error::AppError::Other("could not resolve project dirs".into())
            })?;
        let data_dir = dirs.data_dir().to_path_buf();
        std::fs::create_dir_all(&data_dir)?;
        let db_path = data_dir.join("sshuttle-ui.sqlite");
        let db = Database::open(&db_path)?;
        let sshuttle = SshuttleManager::new(app.clone());
        let secrets = SecretStore::new();
        let audit = Arc::new(crate::audit::AuditLog::open(&data_dir)?);
        let policy = Arc::new(crate::policy::load());
        Ok(Arc::new(Self {
            db,
            sshuttle,
            secrets,
            data_dir,
            audit,
            policy,
        }))
    }
}
