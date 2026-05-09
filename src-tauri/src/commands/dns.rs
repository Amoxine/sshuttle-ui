use crate::dns::{flush_dns_cache, resolve_host, DnsDiagnostics};
use crate::error::AppResult;

#[tauri::command]
pub fn dns_resolve(host: String) -> DnsDiagnostics {
    resolve_host(&host)
}

#[tauri::command]
pub fn dns_flush() -> AppResult<String> {
    flush_dns_cache()
}
