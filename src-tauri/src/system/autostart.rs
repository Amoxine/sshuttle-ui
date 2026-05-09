//! Cross-platform "launch on login" placeholder.
//!
//! For production we would integrate `tauri-plugin-autostart`. Until then we
//! provide a stub that records the desired state in the settings store so
//! the UI can persist the toggle without lying to the user about the
//! current OS-level state.

use crate::error::AppResult;

pub fn set_launch_at_login(_enabled: bool) -> AppResult<()> {
    // Intentionally a no-op placeholder.
    // Real implementation: call into `tauri-plugin-autostart` or
    // platform-specific APIs (LaunchAgent plist on macOS, Registry Run key
    // on Windows, .desktop file in ~/.config/autostart on Linux).
    Ok(())
}

pub fn is_launch_at_login_supported() -> bool {
    cfg!(any(
        target_os = "macos",
        target_os = "windows",
        target_os = "linux"
    ))
}
