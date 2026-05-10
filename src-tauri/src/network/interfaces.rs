use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetInterface {
    pub name: String,
    pub addresses: Vec<String>,
    pub status: Option<String>,
}

/// Cross-platform best-effort listing of network interfaces. We shell out to
/// the platform-native tool because it's far simpler than handling raw
/// netlink/`getifaddrs` on every OS.
pub fn list_interfaces() -> AppResult<Vec<NetInterface>> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        let output = Command::new("ifconfig").output();
        if let Ok(out) = output {
            let text = String::from_utf8_lossy(&out.stdout);
            return Ok(parse_ifconfig(&text));
        }
        // Linux modern alternative
        let output = Command::new("ip").args(["-o", "addr"]).output()?;
        let text = String::from_utf8_lossy(&output.stdout);
        return Ok(parse_ip_addr(&text));
    }

    #[cfg(target_os = "windows")]
    {
        let output = Command::new("ipconfig").output()?;
        let text = String::from_utf8_lossy(&output.stdout);
        return Ok(parse_ipconfig(&text));
    }

    #[allow(unreachable_code)]
    Ok(vec![])
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn parse_ifconfig(text: &str) -> Vec<NetInterface> {
    let mut out: Vec<NetInterface> = Vec::new();
    let mut current: Option<NetInterface> = None;
    for line in text.lines() {
        if !line.starts_with(char::is_whitespace) && line.contains(':') {
            if let Some(c) = current.take() {
                out.push(c);
            }
            let name = line.split(':').next().unwrap_or("").trim().to_string();
            let status = if line.contains("UP") {
                Some("up".into())
            } else {
                Some("down".into())
            };
            current = Some(NetInterface {
                name,
                addresses: vec![],
                status,
            });
        } else if let Some(cur) = current.as_mut() {
            let trimmed = line.trim();
            if let Some(rest) = trimmed.strip_prefix("inet ") {
                if let Some(addr) = rest.split_whitespace().next() {
                    cur.addresses.push(addr.to_string());
                }
            } else if let Some(rest) = trimmed.strip_prefix("inet6 ") {
                if let Some(addr) = rest.split_whitespace().next() {
                    cur.addresses
                        .push(addr.split('%').next().unwrap_or(addr).to_string());
                }
            }
        }
    }
    if let Some(c) = current.take() {
        out.push(c);
    }
    out
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn parse_ip_addr(text: &str) -> Vec<NetInterface> {
    let mut map: std::collections::BTreeMap<String, NetInterface> =
        std::collections::BTreeMap::new();
    for line in text.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 4 {
            continue;
        }
        let name = parts[1].to_string();
        let addr = parts[3].split('/').next().unwrap_or(parts[3]).to_string();
        map.entry(name.clone())
            .or_insert(NetInterface {
                name: name.clone(),
                addresses: vec![],
                status: Some("up".into()),
            })
            .addresses
            .push(addr);
    }
    map.into_values().collect()
}

#[cfg(target_os = "windows")]
fn parse_ipconfig(text: &str) -> Vec<NetInterface> {
    let mut out: Vec<NetInterface> = Vec::new();
    let mut current: Option<NetInterface> = None;
    for line in text.lines() {
        if line.ends_with(':') && !line.starts_with(' ') {
            if let Some(c) = current.take() {
                out.push(c);
            }
            current = Some(NetInterface {
                name: line.trim_end_matches(':').to_string(),
                addresses: vec![],
                status: None,
            });
        } else if let Some(cur) = current.as_mut() {
            if let Some(idx) = line.find(':') {
                let key = line[..idx].trim();
                let value = line[idx + 1..].trim();
                if key.contains("IPv4 Address") || key.contains("IPv6 Address") {
                    cur.addresses.push(value.to_string());
                } else if key.contains("Media State") {
                    cur.status = Some(value.to_string());
                }
            }
        }
    }
    if let Some(c) = current.take() {
        out.push(c);
    }
    out
}
