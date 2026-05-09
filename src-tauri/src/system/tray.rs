use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

pub const TRAY_ID: &str = "main";
pub const TRAY_PROFILE_PREFIX: &str = "tray://connect_profile:";

/// Build the system tray with the static commands. The favorite-profile
/// section is added later via [`rebuild_menu`].
pub fn install_tray(app: &AppHandle) -> AppResult<()> {
    let menu = build_menu(app, &[])?;

    let _tray = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if let Some(profile_id) = id.strip_prefix(TRAY_PROFILE_PREFIX) {
                emit_with_payload(app, "tray:connect_profile", profile_id);
                return;
            }
            match id {
                "tray://connect" => emit(app, "tray:connect"),
                "tray://disconnect" => emit(app, "tray:disconnect"),
                "tray://show" => show_main_window(app),
                "tray://settings" => emit(app, "tray:settings"),
                "tray://quit" => app.exit(0),
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

#[derive(Debug, Clone)]
pub struct TrayProfile {
    pub id: String,
    pub name: String,
    pub favorite: bool,
}

/// Replace the tray menu with one that includes a "Favorites" group of
/// quick-connect entries. Call this whenever profiles or favorite flags
/// change.
pub fn rebuild_menu(app: &AppHandle, profiles: &[TrayProfile]) -> AppResult<()> {
    let menu = build_menu(app, profiles)?;
    let tray = app
        .tray_by_id(TRAY_ID)
        .ok_or_else(|| AppError::Other("tray not installed".into()))?;
    tray.set_menu(Some(menu))?;
    Ok(())
}

/// Update the tooltip / title of the tray icon to reflect a status string.
pub fn set_status(app: &AppHandle, text: &str) -> AppResult<()> {
    let tray = app
        .tray_by_id(TRAY_ID)
        .ok_or_else(|| AppError::Other("tray not installed".into()))?;
    tray.set_tooltip(Some(text))?;
    Ok(())
}

fn build_menu(app: &AppHandle, profiles: &[TrayProfile]) -> AppResult<Menu<tauri::Wry>> {
    let connect = MenuItem::with_id(app, "tray://connect", "Connect", true, None::<&str>)?;
    let disconnect =
        MenuItem::with_id(app, "tray://disconnect", "Disconnect", true, None::<&str>)?;
    let dashboard =
        MenuItem::with_id(app, "tray://show", "Open dashboard", true, None::<&str>)?;
    let settings =
        MenuItem::with_id(app, "tray://settings", "Open settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "tray://quit", "Quit sshuttle UI", true, None::<&str>)?;

    let separator_a = PredefinedMenuItem::separator(app)?;
    let separator_b = PredefinedMenuItem::separator(app)?;
    let separator_c = PredefinedMenuItem::separator(app)?;

    let menu = Menu::new(app)?;
    menu.append(&connect)?;
    menu.append(&disconnect)?;

    let favorites: Vec<&TrayProfile> = profiles.iter().filter(|p| p.favorite).take(8).collect();
    if !favorites.is_empty() {
        menu.append(&separator_a)?;
        // Disabled label as a "Favorites" header.
        let header = MenuItem::with_id(app, "tray://favorites_header", "Favorites", false, None::<&str>)?;
        menu.append(&header)?;
        for fav in favorites {
            let id = format!("{TRAY_PROFILE_PREFIX}{}", fav.id);
            let label = format!("★ {}", fav.name);
            let item = MenuItem::with_id(app, &id, &label, true, None::<&str>)?;
            menu.append(&item)?;
        }
    }

    menu.append(&separator_b)?;
    menu.append(&dashboard)?;
    menu.append(&settings)?;
    menu.append(&separator_c)?;
    menu.append(&quit)?;

    Ok(menu)
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

fn emit_with_payload<T: serde::Serialize + Clone>(app: &AppHandle, name: &str, payload: T) {
    use tauri::Emitter;
    let _ = app.emit(name, payload);
}
