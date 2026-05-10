use std::path::{Path, PathBuf};
use std::sync::Arc;

use parking_lot::Mutex;
use rusqlite::Connection;

use crate::error::AppResult;

/// Thin wrapper around a single SQLite connection guarded by a mutex.
///
/// SQLite supports concurrent reads but only one writer at a time. For a
/// desktop app this is the simplest correct model and avoids the overhead of
/// a real connection pool.
#[derive(Clone)]
pub struct Database {
    inner: Arc<Mutex<Connection>>,
    path: PathBuf,
}

impl Database {
    pub fn open(path: impl AsRef<Path>) -> AppResult<Self> {
        let path = path.as_ref().to_path_buf();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(&path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;

        let db = Self {
            inner: Arc::new(Mutex::new(conn)),
            path,
        };
        db.migrate()?;
        Ok(db)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Run all pending schema migrations. New migrations should be appended
    /// at the end of the array; existing entries must NEVER be edited.
    fn migrate(&self) -> AppResult<()> {
        const MIGRATIONS: &[&str] = &[
            // 0001 — base schema
            r#"
            CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY
            );

            CREATE TABLE IF NOT EXISTS profiles (
                id           TEXT PRIMARY KEY,
                name         TEXT NOT NULL,
                tags         TEXT NOT NULL DEFAULT '[]',
                favorite     INTEGER NOT NULL DEFAULT 0,
                config_json  TEXT NOT NULL,
                created_at   TEXT NOT NULL,
                updated_at   TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_profiles_name ON profiles(name);
            CREATE INDEX IF NOT EXISTS idx_profiles_favorite ON profiles(favorite);

            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS connection_history (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id  TEXT,
                started_at  TEXT NOT NULL,
                ended_at    TEXT,
                status      TEXT NOT NULL,
                bytes_in    INTEGER NOT NULL DEFAULT 0,
                bytes_out   INTEGER NOT NULL DEFAULT 0,
                error       TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_history_started ON connection_history(started_at);
            "#,
            // 0002 — profile ordering for drag / manual reorder in the UI
            r#"
            ALTER TABLE profiles ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
            CREATE INDEX IF NOT EXISTS idx_profiles_sort ON profiles(sort_order);
            "#,
        ];

        let mut conn = self.inner.lock();
        let tx = conn.transaction()?;

        let current: i64 = tx
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_version",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        for (i, sql) in MIGRATIONS.iter().enumerate() {
            let v = (i + 1) as i64;
            if v <= current {
                continue;
            }
            tx.execute_batch(sql)?;
            tx.execute("INSERT INTO schema_version(version) VALUES (?1)", [v])?;
        }
        tx.commit()?;
        Ok(())
    }

    /// Run a closure with exclusive access to the underlying connection.
    pub fn with_conn<F, T>(&self, f: F) -> AppResult<T>
    where
        F: FnOnce(&mut Connection) -> AppResult<T>,
    {
        let mut guard = self.inner.lock();
        f(&mut guard)
    }
}
