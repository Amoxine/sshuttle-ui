use once_cell::sync::Lazy;
use regex::Regex;

static RE_IPV4: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b(\d{1,3}\.){3}\d{1,3}\b").expect("ipv4 regex"));
static RE_IPV6: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"\b(?:[0-9a-fA-F]{1,4}:){2,}[0-9a-fA-F:]{2,}\b|(?:[0-9a-fA-F]{1,4}:){1,7}:|:(?::[0-9a-fA-F]{1,4}){1,7}\b",
    )
    .expect("ipv6 regex")
});
static RE_EMAIL: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}").expect("email regex"));
static RE_USER_AT_HOST: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b\w+@[\w.-]+\b").expect("user@host regex"));

/// Temporarily replaces `@` tokens so later passes cannot rematch inside `<user@host>`.
const AT_PLACEHOLDER: &str = "\u{E000}";
static RE_USERS_HOME: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"/Users/[^/\s]+").expect("/Users regex"));
static RE_LINUX_HOME: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"/home/[^/\s]+").expect("/home regex"));

/// Removes hostnames, IPs, usernames, paths that look like identity files.
pub fn redact_line(s: &str) -> String {
    let mut out = RE_USERS_HOME.replace_all(s, "/Users/<user>").into_owned();
    out = RE_LINUX_HOME.replace_all(&out, "/home/<user>").into_owned();
    out = RE_EMAIL.replace_all(&out, AT_PLACEHOLDER).into_owned();
    out = RE_USER_AT_HOST
        .replace_all(&out, AT_PLACEHOLDER)
        .into_owned();
    out = RE_IPV4.replace_all(&out, "<ip>").into_owned();
    out = RE_IPV6.replace_all(&out, "<ipv6>").into_owned();
    out.replace(AT_PLACEHOLDER, "<user@host>")
}

#[cfg(test)]
mod tests {
    use super::redact_line;

    #[test]
    fn redacts_ipv4() {
        assert_eq!(
            redact_line("ping 192.168.1.10 and 10.0.0.1"),
            "ping <ip> and <ip>"
        );
    }

    #[test]
    fn redacts_ipv6_simple() {
        let s = redact_line("addr fe80::1 and 2001:db8::1");
        assert!(s.contains("<ipv6>"), "{s}");
    }

    #[test]
    fn redacts_email_like() {
        assert_eq!(
            redact_line("contact alice@example.com please"),
            "contact <user@host> please"
        );
    }

    #[test]
    fn redacts_user_at_host_not_email_tld() {
        assert_eq!(redact_line("ssh root@myserver"), "ssh <user@host>");
    }

    #[test]
    fn redacts_macos_user_path() {
        assert_eq!(
            redact_line("file /Users/jdoe/.ssh/id_rsa"),
            "file /Users/<user>/.ssh/id_rsa"
        );
    }

    #[test]
    fn redacts_linux_home_path() {
        assert_eq!(redact_line("in /home/deploy/app"), "in /home/<user>/app");
    }

    #[test]
    fn combined_sensitive_line() {
        let s =
            redact_line("sudo -u bob ssh deploy@10.0.0.5 from /Users/alice/.ssh/key via 8.8.8.8");
        assert!(s.contains("<ip>"), "{s}");
        assert!(s.contains("<user@host>"), "{s}");
        assert!(s.contains("/Users/<user>"), "{s}");
    }
}
