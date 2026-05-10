//! `sshuttle-ui://` deep-link routing.
//!
//! ### URL shape
//!
//! | URL                                            | Action          |
//! |------------------------------------------------|-----------------|
//! | `sshuttle-ui://connect/<profileId>`            | Connect         |
//! | `sshuttle-ui://connect/<profileId>?sudo=true`  | Connect w/ sudo |
//! | `sshuttle-ui://disconnect`                     | Disconnect      |
//! | `sshuttle-ui://show`                           | Focus window    |
//! | `sshuttle-ui://edit/<profileId>`               | Open editor     |
//!
//! The action is parsed in Rust and forwarded to the frontend as a
//! typed `DeepLinkAction` event. The frontend decides what UI to
//! render (e.g. confirmation dialog before connecting). This keeps
//! parsing close to the URL and policy close to the user.
//!
//! ### Plumbing
//!
//! On first-instance launch and on every `sshuttle-ui://…` open
//! event delivered to the running app via
//! `tauri-plugin-deep-link` + `tauri-plugin-single-instance`,
//! [`handle_urls`] parses the URLs and emits the corresponding
//! `DeepLinkAction` events.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_specta::Event;

/// Action the frontend should perform when a deep link is opened.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DeepLinkAction {
    /// Open / focus the dashboard.
    Show,
    /// Disconnect the active tunnel.
    Disconnect,
    /// Connect using the given profile. `sudo` is true when the
    /// caller asks the elevated path (otherwise the frontend
    /// decides based on the profile's settings).
    Connect {
        profile_id: String,
        #[serde(default)]
        sudo: bool,
    },
    /// Open the profile editor for the given profile id.
    Edit { profile_id: String },
    /// URL we couldn't parse — surface so the frontend can show a
    /// "this deep link isn't valid" toast instead of swallowing it.
    Unknown { url: String },
}

/// Parse a single URL string into a `DeepLinkAction`. Public so unit
/// tests can pin the contract.
pub fn parse(url: &str) -> DeepLinkAction {
    // We intentionally do *not* pull in the `url` crate just for
    // this. The shape is small enough to parse by hand and avoids
    // a heavyweight dep on the binary.
    let unknown = || DeepLinkAction::Unknown {
        url: url.to_string(),
    };

    let Some(rest) = url.strip_prefix("sshuttle-ui://") else {
        return unknown();
    };

    // Split fragment off; we don't honour fragments today.
    let rest = rest.split('#').next().unwrap_or(rest);

    // Split query from path.
    let (path, query) = match rest.find('?') {
        Some(idx) => (&rest[..idx], Some(&rest[idx + 1..])),
        None => (rest, None),
    };

    // Trim trailing slash so `connect/` and `connect` both parse.
    let path = path.trim_end_matches('/');

    let mut parts = path.split('/');
    let host = parts.next().unwrap_or("").to_ascii_lowercase();
    let arg = parts.next().unwrap_or("");
    let extra = parts.next();

    let sudo = query
        .map(|q| {
            q.split('&').any(|kv| {
                let mut it = kv.splitn(2, '=');
                let key = it.next().unwrap_or("");
                let value = it.next().unwrap_or("");
                key.eq_ignore_ascii_case("sudo") && matches!(value, "1" | "true" | "yes" | "on")
            })
        })
        .unwrap_or(false);

    match host.as_str() {
        "show" | "open" => DeepLinkAction::Show,
        "disconnect" | "stop" => DeepLinkAction::Disconnect,
        "connect" => {
            if arg.is_empty() || extra.is_some() {
                return unknown();
            }
            DeepLinkAction::Connect {
                profile_id: arg.to_string(),
                sudo,
            }
        }
        "edit" => {
            if arg.is_empty() || extra.is_some() {
                return unknown();
            }
            DeepLinkAction::Edit {
                profile_id: arg.to_string(),
            }
        }
        _ => unknown(),
    }
}

/// Pop the main window to the foreground in addition to emitting
/// the event. Deep-link entries are almost always user-initiated
/// from outside the app, so they should bring the app forward.
fn focus_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Process a batch of URLs (one or many, depending on the OS).
/// Empty input is a no-op.
pub fn handle_urls(app: &AppHandle, urls: impl IntoIterator<Item = String>) {
    for url in urls {
        let action = parse(&url);
        focus_main_window(app);
        if let Err(e) = action.clone().emit(app) {
            tracing::warn!("deep-link emit failed for {url}: {e}");
        } else {
            tracing::info!("deep-link routed: {url} -> {action:?}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(p: &str) -> DeepLinkAction {
        parse(p)
    }

    #[test]
    fn parses_show() {
        assert!(matches!(url("sshuttle-ui://show"), DeepLinkAction::Show));
        assert!(matches!(url("sshuttle-ui://open/"), DeepLinkAction::Show));
    }

    #[test]
    fn parses_disconnect() {
        assert!(matches!(
            url("sshuttle-ui://disconnect"),
            DeepLinkAction::Disconnect
        ));
    }

    #[test]
    fn parses_connect_with_sudo_flag() {
        match url("sshuttle-ui://connect/abc?sudo=true") {
            DeepLinkAction::Connect { profile_id, sudo } => {
                assert_eq!(profile_id, "abc");
                assert!(sudo);
            }
            other => panic!("unexpected: {other:?}"),
        }
    }

    #[test]
    fn parses_connect_without_sudo() {
        match url("sshuttle-ui://connect/abc") {
            DeepLinkAction::Connect { profile_id, sudo } => {
                assert_eq!(profile_id, "abc");
                assert!(!sudo);
            }
            other => panic!("unexpected: {other:?}"),
        }
    }

    #[test]
    fn parses_edit() {
        match url("sshuttle-ui://edit/p123") {
            DeepLinkAction::Edit { profile_id } => assert_eq!(profile_id, "p123"),
            other => panic!("unexpected: {other:?}"),
        }
    }

    #[test]
    fn rejects_extra_path_segments() {
        match url("sshuttle-ui://connect/abc/extra") {
            DeepLinkAction::Unknown { url } => assert_eq!(url, "sshuttle-ui://connect/abc/extra"),
            other => panic!("unexpected: {other:?}"),
        }
    }

    #[test]
    fn rejects_other_schemes() {
        assert!(matches!(
            url("http://connect/abc"),
            DeepLinkAction::Unknown { .. }
        ));
    }

    #[test]
    fn rejects_missing_profile() {
        assert!(matches!(
            url("sshuttle-ui://connect"),
            DeepLinkAction::Unknown { .. }
        ));
    }

    #[test]
    fn ignores_fragment_and_other_query_keys() {
        match url("sshuttle-ui://connect/abc?sudo=true&unknown=1#frag") {
            DeepLinkAction::Connect { profile_id, sudo } => {
                assert_eq!(profile_id, "abc");
                assert!(sudo);
            }
            other => panic!("unexpected: {other:?}"),
        }
    }
}
