use std::path::{Path, PathBuf};

/// Common locations where `sshuttle` may live on macOS / Linux when the
/// process `PATH` is sanitized (e.g. when the `.app` is launched from
/// Finder/Dock and inherits only `/usr/bin:/bin:/usr/sbin:/sbin`).
const FALLBACK_DIRS: &[&str] = &[
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
    "/usr/bin",
    "/usr/sbin",
    "/bin",
    "/sbin",
    "/opt/local/bin",
    "/snap/bin",
];

/// Find the `sshuttle` binary, falling back to a list of common install
/// directories when the inherited `PATH` is too sparse to find it.
pub fn find_sshuttle() -> Option<PathBuf> {
    if let Ok(p) = which::which("sshuttle") {
        return Some(p);
    }
    find_in_known_dirs("sshuttle")
}

/// Same idea but for any binary name (used when spawning sshuttle so its
/// child processes — ssh, python — also resolve reliably).
pub fn find_in_known_dirs(name: &str) -> Option<PathBuf> {
    if let Ok(p) = which::which(name) {
        return Some(p);
    }
    for d in FALLBACK_DIRS {
        let candidate = Path::new(d).join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    if let Some(home) = directories::UserDirs::new() {
        for sub in [".local/bin", "bin"] {
            let candidate = home.home_dir().join(sub).join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// Build an extended `PATH` value that always includes the well-known
/// install directories, regardless of how the GUI was launched.
/// Returns `current PATH:fallbacks…` with the current PATH first so the
/// user's shell setup wins.
pub fn extended_path() -> String {
    let mut parts: Vec<String> = std::env::var("PATH")
        .ok()
        .map(|s| s.split(':').map(str::to_string).collect())
        .unwrap_or_default();
    for d in FALLBACK_DIRS {
        if !parts.iter().any(|p| p == d) {
            parts.push((*d).to_string());
        }
    }
    if let Some(home) = directories::UserDirs::new() {
        for sub in [".local/bin", "bin"] {
            let dir = home.home_dir().join(sub);
            let s = dir.to_string_lossy().to_string();
            if !parts.iter().any(|p| p == &s) {
                parts.push(s);
            }
        }
    }
    parts.join(":")
}
