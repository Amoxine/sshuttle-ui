use chrono::{DateTime, Utc};
use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::error::AppResult;

use super::Database;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct HistoryEntry {
    pub id: i64,
    pub profile_id: Option<String>,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub status: String,
    pub bytes_in: i64,
    pub bytes_out: i64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DailyTotal {
    pub day: String,
    pub seconds: i64,
}

pub struct HistoryRepo<'a> {
    db: &'a Database,
}

impl<'a> HistoryRepo<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn record_start(&self, profile_id: Option<&str>) -> AppResult<i64> {
        self.db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO connection_history(profile_id, started_at, status) \
                 VALUES(?1, ?2, 'started')",
                params![profile_id, Utc::now().to_rfc3339()],
            )?;
            Ok(conn.last_insert_rowid())
        })
    }

    pub fn record_end(
        &self,
        id: i64,
        status: &str,
        bytes_in: i64,
        bytes_out: i64,
        error: Option<&str>,
    ) -> AppResult<()> {
        self.db.with_conn(|conn| {
            conn.execute(
                "UPDATE connection_history \
                 SET ended_at = ?2, status = ?3, bytes_in = ?4, bytes_out = ?5, error = ?6 \
                 WHERE id = ?1",
                params![
                    id,
                    Utc::now().to_rfc3339(),
                    status,
                    bytes_in,
                    bytes_out,
                    error
                ],
            )?;
            Ok(())
        })
    }

    pub fn list(&self, limit: usize) -> AppResult<Vec<HistoryEntry>> {
        let limit = limit.clamp(1, 1000) as i64;
        self.db.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, profile_id, started_at, ended_at, status, bytes_in, bytes_out, error \
                 FROM connection_history ORDER BY started_at DESC LIMIT ?1",
            )?;
            let rows = stmt
                .query_map([limit], |row| {
                    let started_at: String = row.get(2)?;
                    let ended_at: Option<String> = row.get(3)?;
                    Ok(HistoryEntry {
                        id: row.get(0)?,
                        profile_id: row.get(1)?,
                        started_at: DateTime::parse_from_rfc3339(&started_at)
                            .map(|d| d.with_timezone(&Utc))
                            .unwrap_or_else(|_| Utc::now()),
                        ended_at: ended_at.and_then(|s| {
                            DateTime::parse_from_rfc3339(&s)
                                .ok()
                                .map(|d| d.with_timezone(&Utc))
                        }),
                        status: row.get(4)?,
                        bytes_in: row.get(5)?,
                        bytes_out: row.get(6)?,
                        error: row.get(7)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    /// Aggregated connected seconds per calendar day (UTC) for the heatmap.
    pub fn daily_totals(&self, days: u32) -> AppResult<Vec<DailyTotal>> {
        let days = days.clamp(1, 366);
        let cutoff = format!("-{} days", days);
        self.db.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT date(started_at) AS d, \
                        SUM(CAST((julianday(ended_at) - julianday(started_at)) * 86400 AS INTEGER)) AS secs \
                 FROM connection_history \
                 WHERE ended_at IS NOT NULL \
                   AND date(started_at) >= date('now', ?1) \
                 GROUP BY date(started_at) \
                 ORDER BY d ASC",
            )?;
            let rows = stmt
                .query_map([&cutoff], |row| {
                    Ok(DailyTotal {
                        day: row.get(0)?,
                        seconds: row.get::<_, i64>(1)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }
}
