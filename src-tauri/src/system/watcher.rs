//! Lightweight background task that watches for system events the
//! reconnect supervisor cares about: sleep/wake transitions and default
//! route changes. Each interesting transition is published as
//! `RuntimeEvent::NetworkChanged` on the global event bus.

use std::time::{Duration, Instant, SystemTime};

use tauri::{AppHandle, Emitter};

use crate::network::sample_default_route;
use crate::sshuttle::event::{NetworkChangeReason, RuntimeEvent, RUNTIME_EVENT};

const TICK: Duration = Duration::from_secs(5);
/// If wall-clock advances by more than `tick + WAKE_THRESHOLD`, treat the
/// gap as a sleep/resume cycle.
const WAKE_THRESHOLD: Duration = Duration::from_secs(20);

pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        run(app).await;
    });
}

async fn run(app: AppHandle) {
    let mut last_wall = SystemTime::now();
    let mut last_steady = Instant::now();
    let mut last_route = sample_default_route().ok();

    loop {
        tokio::time::sleep(TICK).await;

        let now_wall = SystemTime::now();
        let now_steady = Instant::now();

        // Detect a sleep skip: wall clock drifted further than the steady
        // clock by more than WAKE_THRESHOLD. (Both should advance ~equally
        // when the machine is awake; on sleep the steady clock pauses.)
        let wall_delta = now_wall
            .duration_since(last_wall)
            .unwrap_or_else(|_| Duration::ZERO);
        let steady_delta = now_steady.duration_since(last_steady);
        if wall_delta > steady_delta + WAKE_THRESHOLD {
            emit(&app, NetworkChangeReason::Wake);
            // Give the OS a moment to bring interfaces back up before we
            // read routes.
            tokio::time::sleep(Duration::from_secs(2)).await;
            last_route = sample_default_route().ok();
            last_wall = SystemTime::now();
            last_steady = Instant::now();
            continue;
        }

        // Default-route change.
        let now_route = sample_default_route().ok();
        if let (Some(prev), Some(curr)) = (&last_route, &now_route) {
            let changed = prev.default_gateway != curr.default_gateway
                || prev.default_interface != curr.default_interface;
            if changed {
                emit(&app, NetworkChangeReason::DefaultRoute);
            }
        }
        last_route = now_route;
        last_wall = now_wall;
        last_steady = now_steady;
    }
}

fn emit(app: &AppHandle, reason: NetworkChangeReason) {
    let event = RuntimeEvent::NetworkChanged {
        reason,
        timestamp: chrono::Utc::now(),
    };
    if let Err(e) = app.emit(RUNTIME_EVENT, &event) {
        tracing::warn!("failed to emit network-change event: {e}");
    } else {
        tracing::info!("network change detected: {:?}", reason);
    }
}
