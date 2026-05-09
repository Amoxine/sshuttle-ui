//! Persistent record of the currently-running tunnel.
//!
//! We store one JSON blob in the existing `settings` key/value table
//! under the well-known key `active_session`. The row is written at
//! `manager.start()` and cleared at `manager.stop()` (or when the child
//! exits). On boot we read it; if it's still there but no live sshuttle
//! exists, we know the previous run crashed mid-session and we close
//! the matching history entry as `crashed`.
//!
//! Keeping this in `settings` avoids a brand-new table just to hold a
//! single ephemeral row.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::AppResult;

use super::settings::SettingsRepo;
use super::Database;

pub const ACTIVE_SESSION_KEY: &str = "active_session";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveSession {
    pub profile_id: Option<String>,
    pub profile_name: Option<String>,
    pub started_at: DateTime<Utc>,
    pub sudo: bool,
    pub history_id: Option<i64>,
}

pub struct ActiveSessionRepo<'a> {
    db: &'a Database,
}

impl<'a> ActiveSessionRepo<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn save(&self, session: &ActiveSession) -> AppResult<()> {
        let json = serde_json::to_string(session)?;
        SettingsRepo::new(self.db).set_raw(ACTIVE_SESSION_KEY, &json)
    }

    pub fn load(&self) -> AppResult<Option<ActiveSession>> {
        let raw = SettingsRepo::new(self.db).get_raw(ACTIVE_SESSION_KEY)?;
        match raw {
            Some(s) => Ok(serde_json::from_str(&s).ok()),
            None => Ok(None),
        }
    }

    pub fn clear(&self) -> AppResult<()> {
        self.db.with_conn(|conn| {
            conn.execute(
                "DELETE FROM settings WHERE key = ?1",
                rusqlite::params![ACTIVE_SESSION_KEY],
            )?;
            Ok(())
        })
    }
}
