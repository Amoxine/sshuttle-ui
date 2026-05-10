use chrono::{DateTime, Utc};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::sshuttle::command::SshuttleConfig;

use super::Database;

/// A persisted user-facing profile that bundles SSH connection details and
/// sshuttle routing options into a single named entity.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct Profile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub favorite: bool,
    /// Lower sorts first in the profile list UI.
    #[serde(default)]
    pub sort_order: i32,
    pub config: SshuttleConfig,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct NewProfile {
    pub name: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub favorite: bool,
    pub config: SshuttleConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ProfileUpdate {
    pub name: Option<String>,
    pub tags: Option<Vec<String>>,
    pub favorite: Option<bool>,
    pub sort_order: Option<i32>,
    pub config: Option<SshuttleConfig>,
}

pub struct ProfileRepo<'a> {
    db: &'a Database,
}

impl<'a> ProfileRepo<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn list(&self) -> AppResult<Vec<Profile>> {
        self.db.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, name, tags, favorite, sort_order, config_json, created_at, updated_at \
                 FROM profiles ORDER BY sort_order ASC, favorite DESC, name COLLATE NOCASE ASC",
            )?;
            let rows = stmt
                .query_map([], row_to_profile)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn get(&self, id: &str) -> AppResult<Profile> {
        self.find(id)?
            .ok_or_else(|| AppError::ProfileNotFound(id.to_string()))
    }

    pub fn find(&self, id: &str) -> AppResult<Option<Profile>> {
        self.db.with_conn(|conn| {
            let row = conn
                .query_row(
                "SELECT id, name, tags, favorite, sort_order, config_json, created_at, updated_at \
                 FROM profiles WHERE id = ?1",
                    [id],
                    row_to_profile,
                )
                .optional()?;
            Ok(row)
        })
    }

    pub fn create(&self, new: NewProfile) -> AppResult<Profile> {
        if new.name.trim().is_empty() {
            return Err(AppError::Invalid("name is required".into()));
        }
        new.config.validate()?;

        let now = Utc::now();
        let next_order: i32 = self.db.with_conn(|conn| -> crate::error::AppResult<i32> {
            let order: i64 = conn.query_row(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM profiles",
                [],
                |row| row.get(0),
            )?;
            Ok(order as i32)
        })?;

        let profile = Profile {
            id: Uuid::new_v4().to_string(),
            name: new.name,
            tags: new.tags,
            favorite: new.favorite,
            sort_order: next_order,
            config: new.config,
            created_at: now,
            updated_at: now,
        };
        self.db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO profiles(id, name, tags, favorite, sort_order, config_json, created_at, updated_at) \
                 VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    profile.id,
                    profile.name,
                    serde_json::to_string(&profile.tags)?,
                    profile.favorite as i32,
                    profile.sort_order,
                    serde_json::to_string(&profile.config)?,
                    profile.created_at.to_rfc3339(),
                    profile.updated_at.to_rfc3339(),
                ],
            )?;
            Ok(())
        })?;
        Ok(profile)
    }

    pub fn update(&self, id: &str, patch: ProfileUpdate) -> AppResult<Profile> {
        let mut profile = self.get(id)?;
        if let Some(name) = patch.name {
            if name.trim().is_empty() {
                return Err(AppError::Invalid("name is required".into()));
            }
            profile.name = name;
        }
        if let Some(tags) = patch.tags {
            profile.tags = tags;
        }
        if let Some(fav) = patch.favorite {
            profile.favorite = fav;
        }
        if let Some(ord) = patch.sort_order {
            profile.sort_order = ord;
        }
        if let Some(cfg) = patch.config {
            cfg.validate()?;
            profile.config = cfg;
        }
        profile.updated_at = Utc::now();

        self.db.with_conn(|conn| {
            conn.execute(
                "UPDATE profiles SET name = ?2, tags = ?3, favorite = ?4, sort_order = ?5, config_json = ?6, \
                                     updated_at = ?7 WHERE id = ?1",
                params![
                    profile.id,
                    profile.name,
                    serde_json::to_string(&profile.tags)?,
                    profile.favorite as i32,
                    profile.sort_order,
                    serde_json::to_string(&profile.config)?,
                    profile.updated_at.to_rfc3339(),
                ],
            )?;
            Ok(())
        })?;
        Ok(profile)
    }

    pub fn delete(&self, id: &str) -> AppResult<()> {
        let removed = self
            .db
            .with_conn(|conn| Ok(conn.execute("DELETE FROM profiles WHERE id = ?1", [id])?))?;
        if removed == 0 {
            return Err(AppError::ProfileNotFound(id.to_string()));
        }
        Ok(())
    }

    /// Remove every profile row (used by full restore). Does not touch keychain secrets.
    pub fn delete_all(&self) -> AppResult<()> {
        self.db
            .with_conn(|conn| Ok(conn.execute("DELETE FROM profiles", [])?))?;
        Ok(())
    }

    /// Insert or replace a profile row exactly (backup restore).
    pub fn put_profile(&self, p: &Profile) -> AppResult<()> {
        p.config.validate()?;
        self.db.with_conn(|conn| {
            conn.execute(
                "INSERT OR REPLACE INTO profiles(id, name, tags, favorite, sort_order, config_json, created_at, updated_at) \
                 VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    p.id,
                    p.name,
                    serde_json::to_string(&p.tags)?,
                    p.favorite as i32,
                    p.sort_order,
                    serde_json::to_string(&p.config)?,
                    p.created_at.to_rfc3339(),
                    p.updated_at.to_rfc3339(),
                ],
            )?;
            Ok(())
        })
    }

    pub(crate) fn delete_all_tx(tx: &rusqlite::Transaction<'_>) -> AppResult<()> {
        tx.execute("DELETE FROM profiles", [])?;
        Ok(())
    }

    pub(crate) fn upsert_profile_tx(tx: &rusqlite::Transaction<'_>, p: &Profile) -> AppResult<()> {
        p.config.validate()?;
        tx.execute(
            "INSERT OR REPLACE INTO profiles(id, name, tags, favorite, sort_order, config_json, created_at, updated_at) \
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                p.id,
                p.name,
                serde_json::to_string(&p.tags)?,
                p.favorite as i32,
                p.sort_order,
                serde_json::to_string(&p.config)?,
                p.created_at.to_rfc3339(),
                p.updated_at.to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    pub fn duplicate(&self, id: &str) -> AppResult<Profile> {
        let src = self.get(id)?;
        self.create(NewProfile {
            name: format!("{} (copy)", src.name),
            tags: src.tags,
            favorite: false,
            config: src.config,
        })
    }

    /// Assign contiguous `sort_order` values following the given id order.
    pub fn reorder(&self, ordered_ids: &[String]) -> AppResult<()> {
        self.db.with_conn(|conn| {
            let tx = conn.transaction()?;
            for (i, id) in ordered_ids.iter().enumerate() {
                let n = tx.execute(
                    "UPDATE profiles SET sort_order = ?2, updated_at = ?3 WHERE id = ?1",
                    params![id, i as i32, Utc::now().to_rfc3339()],
                )?;
                if n == 0 {
                    return Err(AppError::ProfileNotFound(id.clone()));
                }
            }
            tx.commit()?;
            Ok(())
        })?;
        Ok(())
    }
}

fn row_to_profile(row: &rusqlite::Row<'_>) -> rusqlite::Result<Profile> {
    let id: String = row.get(0)?;
    let name: String = row.get(1)?;
    let tags_raw: String = row.get(2)?;
    let favorite: i64 = row.get(3)?;
    let sort_order: i64 = row.get(4)?;
    let cfg_raw: String = row.get(5)?;
    let created_at: String = row.get(6)?;
    let updated_at: String = row.get(7)?;

    let tags: Vec<String> = serde_json::from_str(&tags_raw).unwrap_or_default();
    let config: SshuttleConfig = serde_json::from_str(&cfg_raw).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(5, rusqlite::types::Type::Text, Box::new(e))
    })?;

    Ok(Profile {
        id,
        name,
        tags,
        favorite: favorite != 0,
        sort_order: sort_order as i32,
        config,
        created_at: DateTime::parse_from_rfc3339(&created_at)
            .map(|d| d.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now()),
        updated_at: DateTime::parse_from_rfc3339(&updated_at)
            .map(|d| d.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now()),
    })
}
