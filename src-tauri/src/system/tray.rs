use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

use crate::error::AppResult;

/// Build the system tray with a minimal Tailscale-style menu. Click events
/// are forwarded to the frontend via the `tray://*` event names.
pub fn install_tray(app: &AppHandle) -> AppResult<()> {
    let connect = MenuItem::with_id(app, "tray://connect", "Connect", true, None::<&str>)?;
    let disconnect =
        MenuItem::with_id(app, "tray://disconnect", "Disconnect", true, None::<&str>)?;
    let dashboard =
        MenuItem::with_id(app, "tray://show", "Open dashboard", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "tray://quit", "Quit sshuttle UI", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[&connect, &disconnect, &separator, &dashboard, &separator, &quit],
    )?;

    let _tray = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray://connect" => emit(app, "tray:connect"),
            "tray://disconnect" => emit(app, "tray:disconnect"),
            "tray://show" => show_main_window(app),
            "tray://quit" => app.exit(0),
            _ => {}
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
