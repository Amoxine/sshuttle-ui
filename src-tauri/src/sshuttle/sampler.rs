//! Periodic stats sampler. Reads OS-level interface byte counters,
//! converts them to per-second throughput, and pings a probe host for a
//! latency hint while the tunnel is running. Results are emitted on the
//! global runtime event bus as `RuntimeEvent::Stats`.

use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};
use tauri_specta::Event as _;

use crate::network::ping_host;
use crate::sshuttle::event::RuntimeEvent;
use crate::state::AppState;

/// How often we sample net counters.
const TICK: Duration = Duration::from_secs(2);
/// How often we run the latency probe (multiple of TICK).
const PROBE_EVERY_N: u32 = 15; // ~30s at TICK=2s
/// Public host used as a latency probe. Both Cloudflare's anycast and
/// Google DNS are universally reachable.
const PROBE_HOST: &str = "1.1.1.1";

pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        run(app).await;
    });
}

async fn run(app: AppHandle) {
    let mut last_total: Option<(u64, u64, Instant)> = None;
    let mut tick_counter: u32 = 0;
    let mut last_latency_ms: Option<u32> = None;

    loop {
        tokio::time::sleep(TICK).await;

        let state = match app.try_state::<Arc<AppState>>() {
            Some(s) => s,
            None => continue,
        };

        if !state.sshuttle.is_running() {
            // Reset so we don't bridge a "before/after disconnect" delta.
            last_total = None;
            last_latency_ms = None;
            continue;
        }

        let Some((tot_in, tot_out)) = read_total_bytes() else {
            continue;
        };
        let now = Instant::now();

        let (rate_in, rate_out) = match last_total {
            Some((prev_in, prev_out, prev_t)) => {
                let dt = now.duration_since(prev_t).as_secs_f64().max(0.001);
                let din = tot_in.saturating_sub(prev_in);
                let dout = tot_out.saturating_sub(prev_out);
                (((din as f64) / dt) as u64, ((dout as f64) / dt) as u64)
            }
            None => (0, 0),
        };
        last_total = Some((tot_in, tot_out, now));

        // Run a latency probe periodically rather than every tick — pings
        // are cheap but not free, and we don't want to flood when the
        // tunnel is busy.
        tick_counter = tick_counter.wrapping_add(1);
        if tick_counter % PROBE_EVERY_N == 0 || last_latency_ms.is_none() {
            // Run on a blocking task because ping_host shells out.
            let probe = tokio::task::spawn_blocking(|| ping_host(PROBE_HOST)).await;
            if let Ok(Ok(p)) = probe {
                if p.success {
                    last_latency_ms = Some(p.elapsed_ms.min(u32::MAX as u128) as u32);
                }
            }
        }

        let event = RuntimeEvent::Stats {
            bytes_in: rate_in,
            bytes_out: rate_out,
            latency_ms: last_latency_ms,
            timestamp: chrono::Utc::now(),
        };
        if let Err(e) = event.emit(&app) {
            tracing::debug!("stats emit failed: {e}");
        }
    }
}

/// Sum the cumulative byte counters across all "real" interfaces. We
/// ignore loopback and treat the rest as the tunnel's own activity is
/// best approximated by total host network throughput while sshuttle
/// is running.
fn read_total_bytes() -> Option<(u64, u64)> {
    #[cfg(target_os = "linux")]
    {
        return read_linux();
    }
    #[cfg(target_os = "macos")]
    {
        return read_macos();
    }
    #[cfg(target_os = "windows")]
    {
        return read_windows();
    }
    #[allow(unreachable_code)]
    None
}

#[cfg(target_os = "linux")]
fn read_linux() -> Option<(u64, u64)> {
    use std::fs;
    let text = fs::read_to_string("/proc/net/dev").ok()?;
    let mut tot_in: u64 = 0;
    let mut tot_out: u64 = 0;
    // Skip the two-line header.
    for line in text.lines().skip(2) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 17 {
            continue;
        }
        let name = parts[0].trim_end_matches(':');
        if name == "lo" {
            continue;
        }
        let rx: u64 = parts[1].parse().unwrap_or(0);
        let tx: u64 = parts[9].parse().unwrap_or(0);
        tot_in = tot_in.saturating_add(rx);
        tot_out = tot_out.saturating_add(tx);
    }
    Some((tot_in, tot_out))
}

#[cfg(target_os = "macos")]
fn read_macos() -> Option<(u64, u64)> {
    use std::collections::HashSet;
    use std::process::Command;

    // `netstat -ibn` prints one row per interface with cumulative byte
    // counts in the Ibytes (#7) and Obytes (#10) columns.
    let out = Command::new("netstat").args(["-ibn"]).output().ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let mut tot_in: u64 = 0;
    let mut tot_out: u64 = 0;
    let mut seen: HashSet<String> = HashSet::new();

    for line in text.lines().skip(1) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 11 {
            continue;
        }
        let name = parts[0];
        if name.starts_with("lo") {
            continue;
        }
        // `netstat -ibn` repeats interfaces for each address family;
        // dedupe by name so we don't double-count the same counters.
        if !seen.insert(name.to_string()) {
            continue;
        }
        let rx: u64 = parts[6].parse().unwrap_or(0);
        let tx: u64 = parts[9].parse().unwrap_or(0);
        tot_in = tot_in.saturating_add(rx);
        tot_out = tot_out.saturating_add(tx);
    }
    Some((tot_in, tot_out))
}

#[cfg(target_os = "windows")]
fn read_windows() -> Option<(u64, u64)> {
    // Windows is best served by IP Helper APIs; for v1 we report
    // unknown so the UI shows "—".
    None
}
