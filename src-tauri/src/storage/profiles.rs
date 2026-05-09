use chrono::{DateTime, Utc};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::sshuttle::command::SshuttleConfig;

use super::Database;

/// A persisted user-facing profile that bundles SSH connection details and
/// sshuttle routing options into a single named entity.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub favorite: bool,
    pub config: SshuttleConfig,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewProfile {
    pub name: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub favorite: bool,
    pub config: SshuttleConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileUpdate {
    pub name: Option<String>,
    pub tags: Option<Vec<String>>,
    pub favorite: Option<bool>,
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
                "SELECT id, name, tags, favorite, config_json, created_at, updated_at \
                 FROM profiles ORDER BY favorite DESC, name COLLATE NOCASE ASC",
            )?;
            let rows = stmt
                .query_map([], row_to_profile)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn get(&self, id: &str) -> AppResult<Profile> {
        self.find(id)?.ok_or_else(|| AppError::ProfileNotFound(id.to_string()))
    }

    pub fn find(&self, id: &str) -> AppResult<Option<Profile>> {
        self.db.with_conn(|conn| {
            let row = conn
                .query_row(
                    "SELECT id, name, tags, favorite, config_json, created_at, updated_at \
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
        let profile = Profile {
            id: Uuid::new_v4().to_string(),
            name: new.name,
            tags: new.tags,
            favorite: new.favorite,
            config: new.config,
            created_at: now,
            updated_at: now,
        };
        self.db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO profiles(id, name, tags, favorite, config_json, created_at, updated_at) \
                 VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    profile.id,
                    profile.name,
                    serde_json::to_string(&profile.tags)?,
                    profile.favorite as i32,
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
        if let Some(cfg) = patch.config {
            cfg.validate()?;
            profile.config = cfg;
        }
        profile.updated_at = Utc::now();

        self.db.with_conn(|conn| {
            conn.execute(
                "UPDATE profiles SET name = ?2, tags = ?3, favorite = ?4, config_json = ?5, \
                                     updated_at = ?6 WHERE id = ?1",
                params![
                    profile.id,
                    profile.name,
                    serde_json::to_string(&profile.tags)?,
                    profile.favorite as i32,
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

    pub fn duplicate(&self, id: &str) -> AppResult<Profile> {
        let src = self.get(id)?;
        self.create(NewProfile {
            name: format!("{} (copy)", src.name),
            tags: src.tags,
            favorite: false,
            config: src.config,
        })
    }
}

fn row_to_profile(row: &rusqlite::Row<'_>) -> rusqlite::Result<Profile> {
    let id: String = row.get(0)?;
    let name: String = row.get(1)?;
    let tags_raw: String = row.get(2)?;
    let favorite: i64 = row.get(3)?;
    let cfg_raw: String = row.get(4)?;
    let created_at: String = row.get(5)?;
    let updated_at: String = row.get(6)?;

    let tags: Vec<String> = serde_json::from_str(&tags_raw).unwrap_or_default();
    let config: SshuttleConfig = serde_json::from_str(&cfg_raw).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(4, rusqlite::types::Type::Text, Box::new(e))
    })?;

    Ok(Profile {
        id,
        name,
        tags,
        favorite: favorite != 0,
        config,
        created_at: DateTime::parse_from_rfc3339(&created_at)
            .map(|d| d.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now()),
        updated_at: DateTime::parse_from_rfc3339(&updated_at)
            .map(|d| d.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now()),
    })
}
