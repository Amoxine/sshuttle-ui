# Changelog

## Unreleased

- **Background running**: closing the window now keeps the tunnel running in the tray. First close prompts you to choose between “minimize to tray” and “quit and disconnect”; preference saved to Settings ▸ Application ▸ When I close the window. Tray ▸ Quit and ⌘Q always exit cleanly.
- Tray menu Connect / Disconnect / favorites now act directly (no longer relies on the IPC event bus, so it works even before the webview is fully ready) and surfaces failures as toasts.
- Status bar with phase, throughput snapshot, and quick links.
- Collapsible sidebar (persisted).
- Soft kill-switch overlay when the tunnel dies unexpectedly (optional setting).
- Public IP / geo card, connection-time heatmap, and SSH preflight checks.
- Import profiles from `~/.ssh/config`.
- Profile templates on the editor (full VPN, split RFC1918, compression).
- Command palette: cycle theme, open changelog.
- Captive-portal hint while connected.
- Onboarding modal (first launch).
- Changelog drawer (⌘K → What's new).
- Touch ID sudo notes on Settings (macOS).
- SQLite `sort_order` for profiles + reorder API (UI sort “Manual order”).
- Reduced-motion CSS and chart animation tied to system preference.

### Notes

- **Multi-tunnel**: still one managed sshuttle process — parallel tunnels need a larger backend refactor.
- **Hard kill-switch** (drop all traffic unless VPN): requires OS firewall integration; not shipped here.
