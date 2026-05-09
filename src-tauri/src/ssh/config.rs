use std::collections::HashMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::AppResult;

/// Logical view of a `Host` block from `~/.ssh/config`. We support the most
/// common keywords used to drive a tunnel — anything else is preserved in
/// `extra` so it can be displayed verbatim.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SshHostEntry {
    pub host: String,
    pub hostname: Option<String>,
    pub user: Option<String>,
    pub port: Option<u16>,
    pub identity_file: Option<String>,
    pub proxy_jump: Option<String>,
    pub proxy_command: Option<String>,
    pub extra: HashMap<String, String>,
}

pub fn parse_ssh_config(path: impl AsRef<Path>) -> AppResult<Vec<SshHostEntry>> {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(e.into()),
    };
    Ok(parse_ssh_config_text(&content))
}

pub fn parse_ssh_config_text(text: &str) -> Vec<SshHostEntry> {
    let mut hosts: Vec<SshHostEntry> = Vec::new();
    let mut current: Option<SshHostEntry> = None;

    for raw_line in text.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        // ssh_config tokens are space, tab, or '=' separated.
        let mut parts = line.splitn(2, |c: char| c.is_whitespace() || c == '=');
        let key = parts.next().unwrap_or("").trim().to_ascii_lowercase();
        let value = parts.next().unwrap_or("").trim().trim_matches('"').to_string();

        match key.as_str() {
            "host" => {
                if let Some(h) = current.take() {
                    hosts.push(h);
                }
                current = Some(SshHostEntry {
                    host: value,
                    ..Default::default()
                });
            }
            other => {
                let Some(entry) = current.as_mut() else { continue };
                match other {
                    "hostname" => entry.hostname = Some(value),
                    "user" => entry.user = Some(value),
                    "port" => entry.port = value.parse().ok(),
                    "identityfile" => entry.identity_file = Some(value),
                    "proxyjump" => entry.proxy_jump = Some(value),
                    "proxycommand" => entry.proxy_command = Some(value),
                    _ => {
                        entry.extra.insert(other.to_string(), value);
                    }
                }
            }
        }
    }
    if let Some(h) = current.take() {
        hosts.push(h);
    }
    // Drop the catch-all "*" entries — they're not actionable in the picker.
    hosts.into_iter().filter(|e| !e.host.contains('*')).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_basic_config() {
        let text = r#"
            # Personal box
            Host home
                HostName 1.2.3.4
                User famo
                Port 2222
                IdentityFile ~/.ssh/id_ed25519

            Host bastion
                HostName bastion.corp
                User ops

            Host corp-*
                ProxyJump bastion

            Host *
                ServerAliveInterval 30
        "#;
        let hosts = parse_ssh_config_text(text);
        assert_eq!(hosts.len(), 2);
        assert_eq!(hosts[0].host, "home");
        assert_eq!(hosts[0].port, Some(2222));
        assert_eq!(hosts[0].user.as_deref(), Some("famo"));
        assert_eq!(hosts[1].host, "bastion");
    }
}
