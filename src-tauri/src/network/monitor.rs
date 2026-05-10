use std::process::Command;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteSample {
    pub default_gateway: Option<String>,
    pub default_interface: Option<String>,
    pub captured_at: chrono::DateTime<chrono::Utc>,
}

/// A best-effort snapshot of the system's default route. Useful for the
/// "tunnel diagnostics" view to confirm whether sshuttle has changed the
/// system routing.
pub fn sample_default_route() -> AppResult<RouteSample> {
    let captured_at = chrono::Utc::now();

    #[cfg(target_os = "macos")]
    {
        let output = Command::new("route")
            .args(["-n", "get", "default"])
            .output()?;
        let text = String::from_utf8_lossy(&output.stdout);
        let mut gw = None;
        let mut iface = None;
        for line in text.lines() {
            let line = line.trim();
            if let Some(v) = line.strip_prefix("gateway:") {
                gw = Some(v.trim().to_string());
            } else if let Some(v) = line.strip_prefix("interface:") {
                iface = Some(v.trim().to_string());
            }
        }
        return Ok(RouteSample {
            default_gateway: gw,
            default_interface: iface,
            captured_at,
        });
    }

    #[cfg(target_os = "linux")]
    {
        let output = Command::new("ip")
            .args(["route", "show", "default"])
            .output()?;
        let text = String::from_utf8_lossy(&output.stdout);
        let mut gw = None;
        let mut iface = None;
        if let Some(line) = text.lines().next() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if let Some(idx) = parts.iter().position(|t| *t == "via") {
                gw = parts.get(idx + 1).map(|s| s.to_string());
            }
            if let Some(idx) = parts.iter().position(|t| *t == "dev") {
                iface = parts.get(idx + 1).map(|s| s.to_string());
            }
        }
        return Ok(RouteSample {
            default_gateway: gw,
            default_interface: iface,
            captured_at,
        });
    }

    #[cfg(target_os = "windows")]
    {
        let output = Command::new("route").args(["print", "0.0.0.0"]).output()?;
        let text = String::from_utf8_lossy(&output.stdout);
        let mut gw = None;
        for line in text.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 4 && parts[0] == "0.0.0.0" && parts[1] == "0.0.0.0" {
                gw = Some(parts[2].to_string());
                break;
            }
        }
        return Ok(RouteSample {
            default_gateway: gw,
            default_interface: None,
            captured_at,
        });
    }

    #[allow(unreachable_code)]
    Ok(RouteSample {
        default_gateway: None,
        default_interface: None,
        captured_at,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PingResult {
    pub host: String,
    pub success: bool,
    pub elapsed_ms: u128,
    pub output: String,
}

/// Run a single ping (one packet, short timeout). The `ping` binary is
/// available on every supported platform.
pub fn ping_host(host: &str) -> AppResult<PingResult> {
    let started = Instant::now();
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    let mut cmd = {
        let mut c = Command::new("ping");
        c.args(["-c", "1", "-W", "2", host]);
        c
    };
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("ping");
        c.args(["-n", "1", "-w", "2000", host]);
        c
    };

    let _ = std::time::Duration::from_millis(0); // silence unused import on windows
    let _ = Duration::from_millis(0);
    let output = cmd.output()?;
    Ok(PingResult {
        host: host.to_string(),
        success: output.status.success(),
        elapsed_ms: started.elapsed().as_millis(),
        output: String::from_utf8_lossy(&output.stdout).to_string(),
    })
}
