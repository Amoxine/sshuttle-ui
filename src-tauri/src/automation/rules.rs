use serde::{Deserialize, Serialize};

/// Declarative automation rule. Designed to be persisted in the settings
/// store and evaluated by a future scheduler. The schema is forward
/// compatible — unknown fields are preserved by serde when round-tripped.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationRule {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub profile_id: String,
    pub trigger: RuleTrigger,
    #[serde(default)]
    pub actions: Vec<RuleAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RuleTrigger {
    /// Connect when joining a Wi-Fi network whose SSID matches.
    OnNetwork { ssid: String },
    /// Cron-like schedule: free-form for now, evaluated by the scheduler.
    Schedule { cron: String },
    /// Connect on app launch.
    OnLaunch,
    /// Manual trigger only (used for "named shortcuts" surfaced in tray).
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RuleAction {
    Connect,
    Disconnect,
    RunScript { path: String },
}
