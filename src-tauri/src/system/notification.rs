use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

use crate::error::AppResult;

pub fn notify(app: &AppHandle, title: &str, body: &str) -> AppResult<()> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| crate::error::AppError::Other(e.to_string()))?;
    Ok(())
}
