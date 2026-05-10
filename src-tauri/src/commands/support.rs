use std::sync::Arc;

use chrono::Utc;
use serde::Serialize;
use tauri::{AppHandle, State};

use crate::commands::diagnostics::DiagnosticsBundle;
use crate::commands::system::EnvironmentReport;
use crate::commands::update::{self, AppVersionInfo};
use crate::error::AppResult;
use crate::network::{ping_host, sample_default_route};
use crate::sshuttle::manager::LogLine;
use crate::state::AppState;
use crate::storage::history::HistoryRepo;
use crate::storage::profiles::ProfileRepo;

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SupportBundle {
    pub generated_at: chrono::DateTime<Utc>,
    pub version: AppVersionInfo,
    pub environment: EnvironmentReport,
    pub recent_log_lines: Vec<LogLine>,
    pub redacted_profile_names: Vec<String>,
    pub diagnostics: Option<DiagnosticsBundle>,
}

fn build_environment_report(state: &AppState) -> EnvironmentReport {
    let sshuttle_path = crate::sshuttle::find_sshuttle().map(|p| p.to_string_lossy().to_string());

    let sshuttle_version = sshuttle_path.as_ref().and_then(|p| {
        std::process::Command::new(p)
            .arg("--version")
            .env("PATH", crate::sshuttle::extended_path())
            .output()
            .ok()
            .map(|o| {
                let stdout = String::from_utf8_lossy(&o.stdout);
                let stderr = String::from_utf8_lossy(&o.stderr);
                stdout
                    .lines()
                    .chain(stderr.lines())
                    .next()
                    .unwrap_or("")
                    .to_string()
            })
    });

    EnvironmentReport {
        sshuttle_path,
        sshuttle_version,
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        data_dir: state.data_dir.to_string_lossy().to_string(),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn generate_support_bundle(
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
) -> AppResult<SupportBundle> {
    let version = update::build_app_version_info(&app)?;
    let environment = build_environment_report(state.inner());
    let recent_log_lines = state.sshuttle.logs(500);

    let profiles = ProfileRepo::new(&state.db).list().unwrap_or_default();
    let redacted_profile_names = profiles.into_iter().map(|p| p.name).collect();

    let diagnostics = {
        let default_route = sample_default_route().ok();
        let ping_8888 = ping_host("8.8.8.8").ok();
        let ping_cloudflare = ping_host("1.1.1.1").ok();
        match HistoryRepo::new(&state.db).list(50) {
            Ok(entries) => Some(DiagnosticsBundle {
                default_route,
                ping_8888,
                ping_cloudflare,
                recent_history_count: entries.len(),
            }),
            Err(_) => None,
        }
    };

    Ok(SupportBundle {
        generated_at: Utc::now(),
        version,
        environment,
        recent_log_lines,
        redacted_profile_names,
        diagnostics,
    })
}
