use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

/// Runtime context used to assemble the spawn arguments. Keeps the config
/// itself pure (no I/O) while allowing the manager to inject runtime info
/// like the resolved `sshpass` binary path for non-interactive password auth.
#[derive(Debug, Clone, Default)]
pub struct SpawnContext {
    /// When `Some(...)` AND `auth == Password`, ssh is wrapped with
    /// `sshpass -e` so it reads the password from the `SSHPASS` env var.
    pub sshpass_bin: Option<PathBuf>,
}

/// All sshuttle / SSH options that map to CLI flags. A single struct keeps
/// the persistence layer simple — every UI toggle lives in one place.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SshuttleConfig {
    /// SSH endpoint user (defaults to current user if empty)
    #[serde(default)]
    pub username: String,
    /// SSH endpoint host (e.g. `vpn.example.com`)
    pub host: String,
    /// Optional non-default SSH port
    #[serde(default)]
    pub port: Option<u16>,
    /// Authentication method
    #[serde(default)]
    pub auth: SshAuth,
    /// Path to a private key when `auth` is `Key`
    #[serde(default)]
    pub identity_file: Option<String>,
    /// ProxyJump intermediate hosts: e.g. `["bastion@gw.corp:2222"]`
    #[serde(default)]
    pub jump_hosts: Vec<String>,
    /// Free-form extra SSH options appended via `--ssh-cmd`
    #[serde(default)]
    pub extra_ssh_options: Vec<String>,
    /// Subnets/CIDRs to send through the tunnel.
    /// `["0/0"]` means full tunnel; an explicit list means split tunnel.
    #[serde(default = "default_subnets")]
    pub subnets: Vec<String>,
    /// Subnets/CIDRs to bypass (`-x`)
    #[serde(default)]
    pub exclude_subnets: Vec<String>,
    /// Send DNS lookups through the tunnel (`--dns`)
    #[serde(default = "default_true")]
    pub dns: bool,
    /// Use sshuttle's NS hosts mode (`--ns-hosts`)
    #[serde(default)]
    pub ns_hosts: Vec<String>,
    /// Tunnel IPv6 (`--ipv6`)
    #[serde(default)]
    pub ipv6: bool,
    /// Use sshuttle in `--auto-hosts` mode
    #[serde(default)]
    pub auto_hosts: bool,
    /// Use sshuttle in `--auto-nets` mode
    #[serde(default)]
    pub auto_nets: bool,
    /// Run as a "Latency optimization" tunnel (`--latency-control`)
    #[serde(default = "default_true")]
    pub latency_control: bool,
    /// Enable SSH compression (`-C`)
    #[serde(default)]
    pub compression: bool,
    /// Specify a custom Python path on the remote (`--python`)
    #[serde(default)]
    pub remote_python: Option<String>,
    /// Verbose mode (`-v` or `-vv`)
    #[serde(default)]
    pub verbosity: u8,
    /// Run sshuttle as `--listen` (advanced)
    #[serde(default)]
    pub listen: Option<String>,
    /// Pre-connect script path (executed before tunnel)
    #[serde(default)]
    pub pre_connect_script: Option<String>,
    /// Post-disconnect script path
    #[serde(default)]
    pub post_disconnect_script: Option<String>,
}

fn default_subnets() -> Vec<String> {
    vec!["0/0".into()]
}
fn default_true() -> bool {
    true
}

impl Default for SshuttleConfig {
    fn default() -> Self {
        Self {
            username: String::new(),
            host: String::new(),
            port: None,
            auth: SshAuth::default(),
            identity_file: None,
            jump_hosts: vec![],
            extra_ssh_options: vec![],
            subnets: default_subnets(),
            exclude_subnets: vec![],
            dns: true,
            ns_hosts: vec![],
            ipv6: false,
            auto_hosts: false,
            auto_nets: false,
            latency_control: true,
            compression: false,
            remote_python: None,
            verbosity: 0,
            listen: None,
            pre_connect_script: None,
            post_disconnect_script: None,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum SshAuth {
    #[default]
    Agent,
    Key,
    Password,
}

impl SshuttleConfig {
    /// Validate the config and return a friendly error if anything is wrong.
    pub fn validate(&self) -> AppResult<()> {
        if self.host.trim().is_empty() {
            return Err(AppError::Invalid("host is required".into()));
        }
        if self.subnets.is_empty() {
            return Err(AppError::Invalid(
                "at least one subnet is required (use 0/0 for a full tunnel)".into(),
            ));
        }
        if matches!(self.auth, SshAuth::Key)
            && self.identity_file.as_deref().unwrap_or("").is_empty()
        {
            return Err(AppError::Invalid(
                "identity file is required when auth is set to 'Key'".into(),
            ));
        }
        if let Some(p) = self.port {
            if p == 0 {
                return Err(AppError::Invalid("port cannot be 0".into()));
            }
        }
        for s in &self.subnets {
            sanity_check_subnet(s)?;
        }
        for s in &self.exclude_subnets {
            sanity_check_subnet(s)?;
        }
        Ok(())
    }

    /// Build the canonical sshuttle argument vector used to spawn the
    /// process. The first element is intentionally NOT the binary path so
    /// the manager can choose between `sshuttle` and `sudo sshuttle`.
    pub fn build_args(&self) -> Vec<String> {
        self.build_args_with(&SpawnContext::default())
    }

    /// Like `build_args` but lets the caller inject runtime info such as
    /// the resolved `sshpass` binary path for non-interactive password auth.
    pub fn build_args_with(&self, ctx: &SpawnContext) -> Vec<String> {
        let mut args: Vec<String> = Vec::new();

        // -r user@host[:port]
        let mut endpoint = String::new();
        if !self.username.is_empty() {
            endpoint.push_str(&self.username);
            endpoint.push('@');
        }
        endpoint.push_str(self.host.trim());
        if let Some(p) = self.port {
            endpoint.push(':');
            endpoint.push_str(&p.to_string());
        }
        args.push("-r".into());
        args.push(endpoint);

        // SSH command override — assemble flags that aren't directly
        // exposed by sshuttle and pass them via --ssh-cmd "ssh ...".
        let mut ssh_cmd_parts: Vec<String> = Vec::new();

        // sshpass wrapper goes BEFORE ssh when password auth + binary present.
        // ssh inherits SSHPASS from the sshuttle process environment.
        let using_sshpass = matches!(self.auth, SshAuth::Password) && ctx.sshpass_bin.is_some();
        if using_sshpass {
            let p = ctx.sshpass_bin.as_ref().unwrap();
            ssh_cmd_parts.push(p.to_string_lossy().into_owned());
            ssh_cmd_parts.push("-e".into());
        }

        let ssh_only_start = ssh_cmd_parts.len();
        ssh_cmd_parts.push("ssh".into());

        if self.compression {
            ssh_cmd_parts.push("-C".into());
        }
        if let Some(id) = self.identity_file.as_deref() {
            if matches!(self.auth, SshAuth::Key) && !id.is_empty() {
                ssh_cmd_parts.push("-i".into());
                ssh_cmd_parts.push(id.into());
            }
        }
        for j in &self.jump_hosts {
            if !j.trim().is_empty() {
                ssh_cmd_parts.push("-J".into());
                ssh_cmd_parts.push(j.clone());
            }
        }
        for opt in &self.extra_ssh_options {
            if !opt.trim().is_empty() {
                ssh_cmd_parts.push("-o".into());
                ssh_cmd_parts.push(opt.clone());
            }
        }
        if matches!(self.auth, SshAuth::Password) {
            ssh_cmd_parts.push("-o".into());
            ssh_cmd_parts.push("PreferredAuthentications=password".into());
            ssh_cmd_parts.push("-o".into());
            ssh_cmd_parts.push("PubkeyAuthentication=no".into());

            // sshpass is fully non-interactive — a host-key prompt would
            // hang the connection forever. Default to `accept-new` if the
            // user hasn't already specified `StrictHostKeyChecking`.
            if using_sshpass
                && !self
                    .extra_ssh_options
                    .iter()
                    .any(|o| o.trim_start().starts_with("StrictHostKeyChecking"))
            {
                ssh_cmd_parts.push("-o".into());
                ssh_cmd_parts.push("StrictHostKeyChecking=accept-new".into());
            }
        }

        // Emit --ssh-cmd only if we have anything beyond a bare `ssh`.
        let added_options = ssh_cmd_parts.len() > ssh_only_start + 1;
        if using_sshpass || added_options {
            args.push("--ssh-cmd".into());
            args.push(shell_join(&ssh_cmd_parts));
        }

        if self.dns {
            args.push("--dns".into());
        }
        for h in &self.ns_hosts {
            if !h.trim().is_empty() {
                args.push("--ns-hosts".into());
                args.push(h.clone());
            }
        }
        if self.ipv6 {
            args.push("--ipv6".into());
        }
        if self.auto_hosts {
            args.push("--auto-hosts".into());
        }
        if self.auto_nets {
            args.push("--auto-nets".into());
        }
        // Modern sshuttle (≥ 1.0) enables latency control by default and only
        // accepts the negative form. Older versions had `--latency-control`
        // which is now removed. Only emit a flag when the user disables it.
        if !self.latency_control {
            args.push("--no-latency-control".into());
        }
        if let Some(py) = self.remote_python.as_deref() {
            if !py.is_empty() {
                args.push("--python".into());
                args.push(py.into());
            }
        }
        if let Some(listen) = self.listen.as_deref() {
            if !listen.is_empty() {
                args.push("--listen".into());
                args.push(listen.into());
            }
        }
        for _ in 0..self.verbosity.min(3) {
            args.push("-v".into());
        }
        for x in &self.exclude_subnets {
            if !x.trim().is_empty() {
                args.push("-x".into());
                args.push(x.clone());
            }
        }

        // Subnets are positional and must come last.
        for s in &self.subnets {
            if !s.trim().is_empty() {
                args.push(s.clone());
            }
        }

        args
    }

    /// Pretty preview of the command string (for the UI "command preview"
    /// panel). Quoting is best-effort and intended for display only.
    /// When auth is `Password`, a synthetic `sshpass` token is shown so the
    /// user understands the wrapping that will happen at runtime — the
    /// actual password is read from `SSHPASS` (set on the child process)
    /// and never appears in this string.
    pub fn preview_command(&self) -> String {
        let ctx = if matches!(self.auth, SshAuth::Password) {
            SpawnContext {
                sshpass_bin: Some(PathBuf::from("sshpass")),
            }
        } else {
            SpawnContext::default()
        };
        let mut s = String::from("sshuttle");
        for a in self.build_args_with(&ctx) {
            s.push(' ');
            s.push_str(&shell_quote(&a));
        }
        s
    }
}

fn sanity_check_subnet(s: &str) -> AppResult<()> {
    let s = s.trim();
    if s.is_empty() {
        return Err(AppError::Invalid("empty subnet".into()));
    }
    // Accept things like "0/0", "10.0.0.0/8", "::/0", "192.168.1.0/24",
    // "1.2.3.4", "1.2.3.4-1.2.3.10". sshuttle itself does the rigorous
    // parsing — we just keep obvious garbage out.
    let allowed = |c: char| c.is_ascii_alphanumeric() || matches!(c, '.' | ':' | '/' | '-' | '@');
    if !s.chars().all(allowed) {
        return Err(AppError::Invalid(format!(
            "subnet contains invalid characters: {s}"
        )));
    }
    Ok(())
}

fn shell_quote(s: &str) -> String {
    if s.is_empty() {
        return "''".into();
    }
    let safe = s.chars().all(|c| {
        c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '/' | '.' | ':' | '@' | ',' | '=')
    });
    if safe {
        s.to_string()
    } else {
        format!("'{}'", s.replace('\'', "'\\''"))
    }
}

fn shell_join(parts: &[String]) -> String {
    parts
        .iter()
        .map(|p| shell_quote(p))
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn full_tunnel_default() {
        let cfg = SshuttleConfig {
            host: "vpn.example.com".into(),
            username: "root".into(),
            ..SshuttleConfig::default()
        };
        let args = cfg.build_args();
        assert_eq!(args.first().map(String::as_str), Some("-r"));
        assert_eq!(
            args.get(1).map(String::as_str),
            Some("root@vpn.example.com")
        );
        assert!(args.contains(&"--dns".into()));
        assert!(args.contains(&"0/0".into()));
        // Default is latency_control=true → emit nothing (sshuttle's default)
        assert!(!args.iter().any(|a| a.contains("latency-control")));
    }

    #[test]
    fn latency_control_disabled_emits_negative_flag() {
        let cfg = SshuttleConfig {
            host: "h".into(),
            latency_control: false,
            ..Default::default()
        };
        let args = cfg.build_args();
        assert!(args.contains(&"--no-latency-control".into()));
        // We never emit the obsolete positive flag.
        assert!(!args.contains(&"--latency-control".into()));
    }

    #[test]
    fn split_tunnel_with_excludes() {
        let cfg = SshuttleConfig {
            host: "h".into(),
            subnets: vec!["10.0.0.0/8".into(), "192.168.1.0/24".into()],
            exclude_subnets: vec!["192.168.1.5".into()],
            dns: false,
            ..Default::default()
        };
        let args = cfg.build_args();
        assert!(args.windows(2).any(|w| w == ["-x", "192.168.1.5"]));
        assert!(!args.contains(&"--dns".into()));
        assert!(args.last().unwrap() == "192.168.1.0/24" || args.last().unwrap() == "10.0.0.0/8");
    }

    #[test]
    fn key_auth_requires_identity() {
        let cfg = SshuttleConfig {
            host: "h".into(),
            auth: SshAuth::Key,
            identity_file: None,
            ..Default::default()
        };
        assert!(cfg.validate().is_err());
    }

    #[test]
    fn host_required() {
        let cfg = SshuttleConfig::default();
        assert!(cfg.validate().is_err());
    }

    #[test]
    fn password_auth_with_sshpass_wraps_ssh() {
        let cfg = SshuttleConfig {
            host: "h".into(),
            auth: SshAuth::Password,
            ..Default::default()
        };
        let ctx = SpawnContext {
            sshpass_bin: Some(PathBuf::from("/opt/homebrew/bin/sshpass")),
        };
        let args = cfg.build_args_with(&ctx);

        // Find --ssh-cmd argument
        let i = args
            .iter()
            .position(|a| a == "--ssh-cmd")
            .expect("ssh-cmd flag");
        let ssh_cmd = &args[i + 1];
        assert!(ssh_cmd.contains("/opt/homebrew/bin/sshpass"));
        assert!(ssh_cmd.contains("-e"));
        assert!(ssh_cmd.contains("ssh "));
        assert!(ssh_cmd.contains("PreferredAuthentications=password"));
        // accept-new is auto-injected to prevent hanging on host-key prompts
        assert!(ssh_cmd.contains("StrictHostKeyChecking=accept-new"));
    }

    #[test]
    fn password_auth_without_sshpass_emits_interactive_options() {
        let cfg = SshuttleConfig {
            host: "h".into(),
            auth: SshAuth::Password,
            ..Default::default()
        };
        let args = cfg.build_args(); // no SpawnContext = no sshpass
        let i = args
            .iter()
            .position(|a| a == "--ssh-cmd")
            .expect("ssh-cmd flag");
        let ssh_cmd = &args[i + 1];
        assert!(!ssh_cmd.contains("sshpass"));
        assert!(ssh_cmd.contains("PreferredAuthentications=password"));
        // No accept-new injected when not using sshpass.
        assert!(!ssh_cmd.contains("StrictHostKeyChecking="));
    }

    #[test]
    fn password_user_strict_host_key_check_wins() {
        let cfg = SshuttleConfig {
            host: "h".into(),
            auth: SshAuth::Password,
            extra_ssh_options: vec!["StrictHostKeyChecking=yes".into()],
            ..Default::default()
        };
        let ctx = SpawnContext {
            sshpass_bin: Some(PathBuf::from("sshpass")),
        };
        let args = cfg.build_args_with(&ctx);
        let i = args.iter().position(|a| a == "--ssh-cmd").unwrap();
        let ssh_cmd = &args[i + 1];
        assert!(ssh_cmd.contains("StrictHostKeyChecking=yes"));
        assert!(!ssh_cmd.contains("StrictHostKeyChecking=accept-new"));
    }
}
