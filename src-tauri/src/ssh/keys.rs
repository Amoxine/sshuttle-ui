use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshKeyInfo {
    pub path: PathBuf,
    pub kind: Option<String>,
    pub comment: Option<String>,
    pub permissions_ok: bool,
    pub has_passphrase: Option<bool>,
}

/// Walk `~/.ssh` and return likely-private-key files (no `.pub` suffix and
/// readable). We don't try to load them or talk to ssh-agent — just surface
/// candidates the user might want to attach to a profile.
pub fn discover_keys() -> AppResult<Vec<SshKeyInfo>> {
    let Some(home) = directories::UserDirs::new().and_then(|u| u.home_dir().to_path_buf().into())
    else {
        return Ok(vec![]);
    };
    let dir = home.join(".ssh");
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut results = Vec::new();
    for entry in std::fs::read_dir(&dir)? {
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else { continue };
        if name.ends_with(".pub") || name.starts_with("known_hosts") || name == "config" || name == "authorized_keys" {
            continue;
        }
        // Heuristic: SSH private keys begin with "-----BEGIN".
        let head = match read_first_bytes(&path, 64) {
            Ok(b) => b,
            Err(_) => continue,
        };
        if !head.starts_with(b"-----BEGIN") {
            continue;
        }
        let kind = detect_key_kind(&head);
        let permissions_ok = check_permissions(&path).unwrap_or(true);
        let comment = std::fs::read_to_string(path.with_extension("pub"))
            .ok()
            .and_then(|s| s.split_whitespace().nth(2).map(str::to_string));

        results.push(SshKeyInfo {
            path,
            kind,
            comment,
            permissions_ok,
            // We don't decrypt the key, so we can't say for sure.
            has_passphrase: None,
        });
    }
    results.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(results)
}

fn read_first_bytes(path: &std::path::Path, n: usize) -> std::io::Result<Vec<u8>> {
    use std::io::Read;
    let mut f = std::fs::File::open(path)?;
    let mut buf = vec![0u8; n];
    let read = f.read(&mut buf)?;
    buf.truncate(read);
    Ok(buf)
}

fn detect_key_kind(head: &[u8]) -> Option<String> {
    let s = std::str::from_utf8(head).ok()?;
    if s.contains("OPENSSH PRIVATE KEY") {
        Some("openssh".into())
    } else if s.contains("RSA PRIVATE KEY") {
        Some("rsa".into())
    } else if s.contains("DSA PRIVATE KEY") {
        Some("dsa".into())
    } else if s.contains("EC PRIVATE KEY") {
        Some("ecdsa".into())
    } else if s.contains("PRIVATE KEY") {
        Some("pkcs8".into())
    } else {
        None
    }
}

#[cfg(unix)]
fn check_permissions(path: &std::path::Path) -> std::io::Result<bool> {
    use std::os::unix::fs::PermissionsExt;
    let mode = std::fs::metadata(path)?.permissions().mode();
    // Group/other should not have read access.
    Ok(mode & 0o077 == 0)
}

#[cfg(not(unix))]
fn check_permissions(_path: &std::path::Path) -> std::io::Result<bool> {
    Ok(true)
}
