use std::collections::BTreeMap;

use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::error::AppResult;

use super::Database;

/// Application-level settings persisted across launches. Values are stored as
/// JSON in a key/value table so we can evolve the schema freely without
/// migrations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default)]
    pub start_minimized: bool,
    #[serde(default)]
    pub launch_at_login: bool,
    #[serde(default = "default_true")]
    pub auto_reconnect: bool,
    #[serde(default = "default_reconnect_delay")]
    pub reconnect_delay_seconds: u32,
    #[serde(default)]
    pub kill_switch: bool,
    #[serde(default = "default_true")]
    pub minimize_to_tray: bool,
    #[serde(default = "default_true")]
    pub notifications: bool,
    #[serde(default)]
    pub debug_logging: bool,
    #[serde(default)]
    pub default_profile_id: Option<String>,
    #[serde(default = "default_log_lines")]
    pub log_buffer_lines: usize,
}

fn default_theme() -> String {
    "system".to_string()
}
fn default_true() -> bool {
    true
}
fn default_reconnect_delay() -> u32 {
    5
}
fn default_log_lines() -> usize {
    5_000
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            start_minimized: false,
            launch_at_login: false,
            auto_reconnect: true,
            reconnect_delay_seconds: default_reconnect_delay(),
            kill_switch: false,
            minimize_to_tray: true,
            notifications: true,
            debug_logging: false,
            default_profile_id: None,
            log_buffer_lines: default_log_lines(),
        }
    }
}

const SETTINGS_KEY: &str = "app_settings";

pub struct SettingsRepo<'a> {
    db: &'a Database,
}

impl<'a> SettingsRepo<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn load(&self) -> AppResult<AppSettings> {
        let raw = self.get_raw(SETTINGS_KEY)?;
        match raw {
            Some(s) => Ok(serde_json::from_str(&s).unwrap_or_default()),
            None => Ok(AppSettings::default()),
        }
    }

    pub fn save(&self, settings: &AppSettings) -> AppResult<()> {
        let raw = serde_json::to_string(settings)?;
        self.set_raw(SETTINGS_KEY, &raw)
    }

    pub fn all_kv(&self) -> AppResult<BTreeMap<String, String>> {
        self.db.with_conn(|conn| {
            let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
            let mut out = BTreeMap::new();
            for row in stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))? {
                let (k, v) = row?;
                out.insert(k, v);
            }
            Ok(out)
        })
    }

    pub fn get_raw(&self, key: &str) -> AppResult<Option<String>> {
        self.db.with_conn(|conn| {
            let v: Option<String> = conn
                .query_row(
                    "SELECT value FROM settings WHERE key = ?1",
                    [key],
                    |r| r.get(0),
                )
                .ok();
            Ok(v)
        })
    }

    pub fn set_raw(&self, key: &str, value: &str) -> AppResult<()> {
        self.db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO settings(key, value) VALUES(?1, ?2) \
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![key, value],
            )?;
            Ok(())
        })
    }
}
