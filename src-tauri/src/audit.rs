use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::security::redact;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(transparent)]
pub struct AuditDetails(pub serde_json::Value);

impl specta::Type for AuditDetails {
    fn inline(
        _type_map: &mut specta::TypeCollection,
        _generics: specta::Generics<'_>,
    ) -> specta::DataType {
        specta::DataType::Any
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AuditEvent {
    pub ts: DateTime<Utc>,
    pub actor: AuditActor,
    pub action: String,
    pub result: AuditResult,
    pub details: AuditDetails,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum AuditActor {
    User,
    DeepLink,
    Tray,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum AuditResult {
    Success,
    Failure,
}

pub struct AuditLog {
    path: PathBuf,
    lock: Mutex<()>,
}

impl AuditLog {
    pub fn open(data_dir: &Path) -> AppResult<Self> {
        std::fs::create_dir_all(data_dir)?;
        Ok(Self {
            path: data_dir.join("audit.log"),
            lock: Mutex::new(()),
        })
    }

    pub fn append(&self, event: &AuditEvent) -> AppResult<()> {
        let mut event = event.clone();
        if let serde_json::Value::String(ref s) = event.details.0 {
            event.details = AuditDetails(serde_json::Value::String(redact::redact_line(s)));
        }
        let line = serde_json::to_string(&event)? + "\n";
        let _guard = self.lock.lock();
        let mut f = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)?;
        f.write_all(line.as_bytes())?;
        Ok(())
    }

    pub fn read_recent(&self, limit: usize) -> AppResult<Vec<AuditEvent>> {
        let _guard = self.lock.lock();
        let mut buf = String::new();
        if self.path.exists() {
            let mut f = File::open(&self.path)?;
            f.read_to_string(&mut buf)?;
        }
        drop(_guard);

        let mut events = Vec::new();
        for line in buf.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            match serde_json::from_str::<AuditEvent>(line) {
                Ok(e) => events.push(e),
                Err(_) => continue,
            }
        }
        let skip = events.len().saturating_sub(limit);
        Ok(events.into_iter().skip(skip).collect())
    }

    pub fn export_text(&self) -> AppResult<String> {
        let _guard = self.lock.lock();
        let mut buf = String::new();
        if self.path.exists() {
            let mut f = File::open(&self.path)?;
            f.read_to_string(&mut buf)?;
        }
        Ok(buf)
    }

    pub fn clear(&self) -> AppResult<()> {
        let _guard = self.lock.lock();
        OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&self.path)?;
        Ok(())
    }
}

pub fn log_audit(
    log: &AuditLog,
    actor: AuditActor,
    action: &str,
    result: AuditResult,
    details: serde_json::Value,
) {
    let event = AuditEvent {
        ts: Utc::now(),
        actor,
        action: action.to_string(),
        result,
        details: AuditDetails(details),
    };
    if let Err(e) = log.append(&event) {
        tracing::warn!("audit append failed: {e}");
    }
}
