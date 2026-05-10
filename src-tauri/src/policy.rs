use directories::UserDirs;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", default)]
pub struct PolicyOverrides {
    pub force_kill_switch: Option<bool>,
    pub force_default_profile_id: Option<String>,
    pub lock_theme: Option<String>,
    pub disable_profile_editing: Option<bool>,
    pub disable_telemetry: Option<bool>,
    pub allowed_subnets_regex: Option<String>,
    pub source_path: Option<String>,
}

pub fn load() -> PolicyOverrides {
    #[cfg(target_os = "macos")]
    if let Some(p) = try_load_macos() {
        return p;
    }
    #[cfg(target_os = "linux")]
    if let Some(p) = try_load_linux() {
        return p;
    }
    #[cfg(windows)]
    if let Some(p) = try_load_windows() {
        return p;
    }
    PolicyOverrides::default()
}

#[cfg(target_os = "macos")]
fn try_load_macos() -> Option<PolicyOverrides> {
    use std::path::PathBuf;

    let mut paths: Vec<PathBuf> = vec![PathBuf::from(
        "/Library/Managed Preferences/io.sshuttle.ui.plist",
    )];
    if let Some(h) = UserDirs::new().map(|u| u.home_dir().to_path_buf()) {
        paths.push(h.join("Library/Preferences/io.sshuttle.ui.policy.plist"));
    }
    for path in paths {
        if path.exists() {
            match plist::from_file::<_, PolicyOverrides>(&path) {
                Ok(mut policy) => {
                    policy.source_path = Some(path.to_string_lossy().into_owned());
                    return Some(policy);
                }
                Err(e) => tracing::warn!("policy plist {}: {e}", path.display()),
            }
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn try_load_linux() -> Option<PolicyOverrides> {
    use std::path::PathBuf;

    let mut paths = vec![PathBuf::from("/etc/sshuttle-ui/policy.json")];
    let xdg = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .filter(|p| !p.as_os_str().is_empty())
        .or_else(|| UserDirs::new().map(|u| u.home_dir().join(".config")));
    if let Some(base) = xdg {
        paths.push(base.join("sshuttle-ui").join("policy.json"));
    }
    for path in paths {
        if path.exists() {
            match std::fs::read_to_string(&path).and_then(|s| {
                serde_json::from_str::<PolicyOverrides>(&s).map_err(|e| {
                    std::io::Error::new(std::io::ErrorKind::InvalidData, e.to_string())
                })
            }) {
                Ok(mut policy) => {
                    policy.source_path = Some(path.to_string_lossy().into_owned());
                    return Some(policy);
                }
                Err(e) => tracing::warn!("policy json {}: {e}", path.display()),
            }
        }
    }
    None
}

#[cfg(windows)]
fn try_load_windows() -> Option<PolicyOverrides> {
    use winreg::enums::*;
    use winreg::{RegKey, RegValue};

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let key = match hklm.open_subkey(r"Software\Policies\sshuttle-ui") {
        Ok(k) => k,
        Err(_) => return None,
    };

    fn reg_bool(rv: &RegValue) -> Option<bool> {
        match rv {
            RegValue::DWord(n) => Some(*n != 0),
            RegValue::Sz(s) => match s.to_lowercase().as_str() {
                "1" | "true" | "yes" => Some(true),
                "0" | "false" | "no" => Some(false),
                _ => None,
            },
            _ => None,
        }
    }

    let mut policy = PolicyOverrides::default();
    let mut any = false;

    if let Ok(rv) = key.get_value("forceKillSwitch") {
        if let Some(b) = reg_bool(&rv) {
            policy.force_kill_switch = Some(b);
            any = true;
        }
    }
    if let Ok(rv) = key.get_value("disableProfileEditing") {
        if let Some(b) = reg_bool(&rv) {
            policy.disable_profile_editing = Some(b);
            any = true;
        }
    }
    if let Ok(rv) = key.get_value("disableTelemetry") {
        if let Some(b) = reg_bool(&rv) {
            policy.disable_telemetry = Some(b);
            any = true;
        }
    }
    if let Ok(RegValue::Sz(s)) = key.get_value("forceDefaultProfileId") {
        policy.force_default_profile_id = Some(s);
        any = true;
    }
    if let Ok(RegValue::Sz(s)) = key.get_value("lockTheme") {
        policy.lock_theme = Some(s);
        any = true;
    }
    if let Ok(RegValue::Sz(s)) = key.get_value("allowedSubnetsRegex") {
        policy.allowed_subnets_regex = Some(s);
        any = true;
    }

    if !any {
        return None;
    }
    policy.source_path = Some(r"HKLM\Software\Policies\sshuttle-ui".into());
    Some(policy)
}
