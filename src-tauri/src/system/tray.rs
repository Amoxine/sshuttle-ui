use serde::{Deserialize, Serialize};
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

use super::icon_overlay;

pub const TRAY_ID: &str = "main";
pub const TRAY_PROFILE_PREFIX: &str = "tray://connect_profile:";

/// Minimal "what does the menu need to know" struct.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TrayState {
    /// Connection phase string (matches `ConnectionPhase` snake_case).
    #[serde(default)]
    pub phase: String,
    /// Currently active profile id, if any.
    #[serde(default)]
    pub active_profile_id: Option<String>,
    /// Display name of the active profile (saves us a DB lookup in Rust).
    #[serde(default)]
    pub active_profile_name: Option<String>,
    /// Live throughput (B/s) — only shown while connected.
    #[serde(default)]
    pub bytes_in: Option<u64>,
    #[serde(default)]
    pub bytes_out: Option<u64>,
    /// Probe latency in milliseconds.
    #[serde(default)]
    pub latency_ms: Option<u32>,
    /// Profile list to render. Frontend filters favorites if it wants;
    /// we cap the count below.
    #[serde(default)]
    pub profiles: Vec<TrayProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayProfile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub favorite: bool,
}

/// Install the tray with an empty state. Frontend pushes a real one as
/// soon as it boots via `update_tray`.
pub fn install_tray(app: &AppHandle) -> AppResult<()> {
    let menu = build_menu(app, &TrayState::default())?;

    let _tray = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if let Some(profile_id) = id.strip_prefix(TRAY_PROFILE_PREFIX) {
                let h = app.clone();
                let pid = profile_id.to_string();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = super::tray_actions::connect_specific_profile(&h, &pid).await {
                        tracing::warn!("tray quick-connect failed ({pid}): {e}");
                        notify_error(&h, "Connect failed", &e.to_string());
                    }
                });
                return;
            }
            match id {
                "tray://connect" => {
                    let h = app.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = super::tray_actions::autoconnect_default(&h).await {
                            tracing::warn!("tray connect failed: {e}");
                            notify_error(&h, "Connect failed", &e.to_string());
                        }
                    });
                }
                "tray://disconnect" => {
                    let h = app.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = super::tray_actions::disconnect_current(&h).await {
                            tracing::warn!("tray disconnect failed: {e}");
                            notify_error(&h, "Disconnect failed", &e.to_string());
                        }
                    });
                }
                "tray://show" => show_main_window(app),
                "tray://settings" => {
                    show_main_window(app);
                    emit(app, "tray:settings");
                }
                "tray://quit" => {
                    // Mark intent so the close-request guard short-circuits
                    // and lets the app exit cleanly.
                    crate::system::window_guard::mark_quit_requested();
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

/// Atomically replace the tray menu, tooltip, and icon variant based on
/// the supplied state. Cheap enough to call on every stats event.
pub fn apply_state(app: &AppHandle, state: &TrayState) -> AppResult<()> {
    let menu = build_menu(app, state)?;
    let tray = app
        .tray_by_id(TRAY_ID)
        .ok_or_else(|| AppError::Other("tray not installed".into()))?;
    tray.set_menu(Some(menu))?;

    // Tooltip on hover summarises the live status (cheap, always-visible).
    tray.set_tooltip(Some(&format_tooltip(state)))?;

    // Swap icon variant: green-checked when connected, default otherwise.
    let bytes = if state.phase == "connected" {
        icon_overlay::connected_icon_png()
    } else {
        icon_overlay::default_icon_png()
    };
    let img = Image::from_bytes(bytes)?;
    tray.set_icon(Some(img))?;
    // The connected variant carries colour we don't want macOS to tint
    // away; the default variant is monochrome and benefits from
    // template-mode auto-tinting.
    #[cfg(target_os = "macos")]
    tray.set_icon_as_template(state.phase != "connected")?;

    Ok(())
}

fn build_menu(app: &AppHandle, state: &TrayState) -> AppResult<Menu<tauri::Wry>> {
    let menu = Menu::new(app)?;

    let header_label = format_header(state);
    let header = MenuItem::with_id(app, "tray://header", &header_label, false, None::<&str>)?;
    menu.append(&header)?;

    if state.phase == "connected" {
        let stats_line = format_stats(state);
        let stats_item = MenuItem::with_id(app, "tray://stats", &stats_line, false, None::<&str>)?;
        menu.append(&stats_item)?;
    }

    menu.append(&PredefinedMenuItem::separator(app)?)?;

    let any_active = state.active_profile_id.is_some();

    // Connect / Disconnect actions reflect current state. We keep
    // "Connect" disabled when we're already connected to nudge the user
    // to either Disconnect or pick a different profile from below.
    let connect = MenuItem::with_id(
        app,
        "tray://connect",
        "Connect default profile",
        !any_active,
        None::<&str>,
    )?;
    menu.append(&connect)?;
    if any_active {
        let disconnect =
            MenuItem::with_id(app, "tray://disconnect", "Disconnect", true, None::<&str>)?;
        menu.append(&disconnect)?;
    }

    // Profiles — show favorites first, then the rest, capped to 10.
    let mut profiles: Vec<&TrayProfile> = state.profiles.iter().collect();
    profiles.sort_by_key(|p| !p.favorite);
    if !profiles.is_empty() {
        menu.append(&PredefinedMenuItem::separator(app)?)?;
        let label = MenuItem::with_id(
            app,
            "tray://profiles_header",
            "Profiles",
            false,
            None::<&str>,
        )?;
        menu.append(&label)?;

        for p in profiles.into_iter().take(10) {
            let is_active = state
                .active_profile_id
                .as_deref()
                .map(|id| id == p.id)
                .unwrap_or(false);
            let mut entry = String::new();
            entry.push_str(if is_active {
                "● "
            } else if p.favorite {
                "★ "
            } else {
                "  "
            });
            entry.push_str(&p.name);
            if is_active {
                entry.push_str("  (connected)");
            }
            let id = format!("{TRAY_PROFILE_PREFIX}{}", p.id);
            // Disable the active entry — connecting to it again would
            // bounce on AlreadyRunning anyway.
            let item = MenuItem::with_id(app, &id, &entry, !is_active, None::<&str>)?;
            menu.append(&item)?;
        }
    }

    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(
        app,
        "tray://show",
        "Open dashboard",
        true,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(
        app,
        "tray://settings",
        "Open settings",
        true,
        None::<&str>,
    )?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(
        app,
        "tray://quit",
        "Quit sshuttle UI",
        true,
        None::<&str>,
    )?)?;

    Ok(menu)
}

fn format_header(state: &TrayState) -> String {
    let phase = if state.phase.is_empty() {
        "idle"
    } else {
        state.phase.as_str()
    };
    let name = state.active_profile_name.as_deref().unwrap_or("");
    let dot = match phase {
        "connected" => "✓",
        "connecting" | "starting" | "reconnecting" => "…",
        "failed" => "✕",
        _ => "○",
    };
    if name.is_empty() {
        format!("{dot}  sshuttle UI · {phase}")
    } else {
        format!("{dot}  {name} · {phase}")
    }
}

fn format_stats(state: &TrayState) -> String {
    let down = state
        .bytes_in
        .map(format_rate)
        .unwrap_or_else(|| "—".into());
    let up = state
        .bytes_out
        .map(format_rate)
        .unwrap_or_else(|| "—".into());
    let lat = state
        .latency_ms
        .map(|ms| format!("{ms} ms"))
        .unwrap_or_else(|| "—".into());
    format!("   ↓ {down}    ↑ {up}    {lat}")
}

fn format_tooltip(state: &TrayState) -> String {
    if state.phase == "connected" {
        format!(
            "sshuttle UI · {}\n↓ {}  ↑ {}  {}",
            state.active_profile_name.as_deref().unwrap_or("connected"),
            state
                .bytes_in
                .map(format_rate)
                .unwrap_or_else(|| "—".into()),
            state
                .bytes_out
                .map(format_rate)
                .unwrap_or_else(|| "—".into()),
            state
                .latency_ms
                .map(|ms| format!("{ms} ms"))
                .unwrap_or_else(|| "—".into()),
        )
    } else {
        format!(
            "sshuttle UI · {}",
            if state.phase.is_empty() {
                "idle"
            } else {
                state.phase.as_str()
            }
        )
    }
}

fn format_rate(bps: u64) -> String {
    let bps = bps as f64;
    let units = ["B/s", "KB/s", "MB/s", "GB/s"];
    let mut value = bps;
    let mut idx = 0;
    while value >= 1024.0 && idx < units.len() - 1 {
        value /= 1024.0;
        idx += 1;
    }
    let digits = if value < 10.0 {
        2
    } else if value < 100.0 {
        1
    } else {
        0
    };
    format!("{:.*} {}", digits, value, units[idx])
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn emit(app: &AppHandle, name: &str) {
    use tauri::Emitter;
    let _ = app.emit(name, ());
}

fn notify_error(app: &AppHandle, title: &str, message: &str) {
    use tauri::Emitter;
    // Best-effort: surface in the app via a runtime event the frontend
    // already listens to via the toaster system. Falls back silently if
    // the webview isn't open.
    #[derive(serde::Serialize, Clone)]
    struct TrayError {
        title: String,
        message: String,
    }
    let _ = app.emit(
        "tray:error",
        TrayError {
            title: title.to_string(),
            message: message.to_string(),
        },
    );
    // Also log so users running with --verbose see the detail.
    tracing::warn!("tray error: {title}: {message}");
}
