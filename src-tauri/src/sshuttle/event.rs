use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionPhase {
    Idle,
    Starting,
    Connecting,
    Connected,
    Reconnecting,
    Stopping,
    Failed,
    Disconnected,
}

impl ConnectionPhase {
    pub fn is_active(self) -> bool {
        matches!(
            self,
            Self::Starting | Self::Connecting | Self::Connected | Self::Reconnecting
        )
    }
}

/// Type of message emitted to the frontend on the global runtime event bus.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RuntimeEvent {
    /// New connection lifecycle state
    Phase {
        phase: ConnectionPhase,
        profile_id: Option<String>,
        profile_name: Option<String>,
        message: Option<String>,
        timestamp: DateTime<Utc>,
    },
    /// One stdout/stderr line from sshuttle
    Log {
        level: LogLevel,
        line: String,
        timestamp: DateTime<Utc>,
    },
    /// Periodic stats sample
    Stats {
        bytes_in: u64,
        bytes_out: u64,
        latency_ms: Option<u32>,
        timestamp: DateTime<Utc>,
    },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

pub const RUNTIME_EVENT: &str = "sshuttle:event";
