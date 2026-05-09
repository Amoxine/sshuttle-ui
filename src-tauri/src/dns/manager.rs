use std::net::ToSocketAddrs;
use std::time::Instant;

use serde::{Deserialize, Serialize};

use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DnsDiagnostics {
    pub host: String,
    pub addresses: Vec<String>,
    pub elapsed_ms: u128,
    pub error: Option<String>,
}

/// Resolve a host using the OS resolver. Useful for the "DNS leak test" in
/// the diagnostics view.
pub fn resolve_host(host: &str) -> DnsDiagnostics {
    let target = if host.contains(':') {
        host.to_string()
    } else {
        format!("{host}:443")
    };
    let started = Instant::now();
    match (target.as_str()).to_socket_addrs() {
        Ok(iter) => DnsDiagnostics {
            host: host.to_string(),
            addresses: iter.map(|s| s.ip().to_string()).collect(),
            elapsed_ms: started.elapsed().as_millis(),
            error: None,
        },
        Err(e) => DnsDiagnostics {
            host: host.to_string(),
            addresses: vec![],
            elapsed_ms: started.elapsed().as_millis(),
            error: Some(e.to_string()),
        },
    }
}

/// Best-effort cross-platform DNS cache flush. Returns the human readable
/// description of the action performed so the UI can show it.
pub fn flush_dns_cache() -> AppResult<String> {
    use std::process::Command;

    #[cfg(target_os = "macos")]
    {
        Command::new("dscacheutil").arg("-flushcache").status()?;
        let _ = Command::new("killall")
            .args(["-HUP", "mDNSResponder"])
            .status();
        return Ok("Flushed dscacheutil and reloaded mDNSResponder".into());
    }

    #[cfg(target_os = "linux")]
    {
        // Try common services, ignoring non-existent ones.
        let candidates: &[&[&str]] = &[
            &["systemd-resolve", "--flush-caches"],
            &["resolvectl", "flush-caches"],
            &["nscd", "-i", "hosts"],
        ];
        for c in candidates {
            if Command::new(c[0]).args(&c[1..]).status().is_ok() {
                return Ok(format!("Ran `{}`", c.join(" ")));
            }
        }
        return Ok("No supported DNS cache flush command found".into());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("ipconfig").arg("/flushdns").status()?;
        return Ok("Ran `ipconfig /flushdns`".into());
    }

    #[allow(unreachable_code)]
    Ok("Unsupported platform".into())
}
