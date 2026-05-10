use std::collections::BTreeMap;

use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::error::AppResult;

use super::Database;

/// Application-level settings persisted across launches. Values are stored as
/// JSON in a key/value table so we can evolve the schema freely without
/// migrations.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
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
    /// Cap on reconnect attempts before the supervisor gives up. `0` means
    /// unlimited.
    #[serde(default = "default_max_attempts")]
    pub max_reconnect_attempts: u32,
    /// When true, a sleep/wake or network-change signal triggers an
    /// immediate (out-of-band) reconnect without waiting for sshuttle to
    /// time out on its own.
    #[serde(default = "default_true")]
    pub reconnect_on_network_change: bool,
    #[serde(default)]
    pub kill_switch: bool,
    #[serde(default = "default_true")]
    pub minimize_to_tray: bool,
    /// `false` until the user has explicitly chosen between
    /// "minimize to tray" and "quit" via the close-button dialog.
    /// While `false`, clicking the window's close button shows that
    /// dialog instead of doing anything immediately.
    #[serde(default)]
    pub close_action_chosen: bool,
    #[serde(default = "default_true")]
    pub notifications: bool,
    #[serde(default)]
    pub debug_logging: bool,
    #[serde(default)]
    pub default_profile_id: Option<String>,
    #[serde(default = "default_log_lines")]
    pub log_buffer_lines: usize,
    /// When > 0 and a tunnel is connected, disconnect after this many
    /// minutes without keyboard/mouse/scroll activity (UI thread heuristics).
    #[serde(default)]
    pub idle_disconnect_minutes: u32,
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
fn default_max_attempts() -> u32 {
    10
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
            max_reconnect_attempts: default_max_attempts(),
            reconnect_on_network_change: true,
            kill_switch: false,
            minimize_to_tray: true,
            close_action_chosen: false,
            notifications: true,
            debug_logging: false,
            default_profile_id: None,
            log_buffer_lines: default_log_lines(),
            idle_disconnect_minutes: 0,
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
            for row in
                stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
            {
                let (k, v) = row?;
                out.insert(k, v);
            }
            Ok(out)
        })
    }

    pub fn get_raw(&self, key: &str) -> AppResult<Option<String>> {
        self.db.with_conn(|conn| {
            let v: Option<String> = conn
                .query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| {
                    r.get(0)
                })
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
