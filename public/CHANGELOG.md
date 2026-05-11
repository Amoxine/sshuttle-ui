## [1.0.1](https://github.com/Amoxine/sshuttle-ui/compare/v1.0.0...v1.0.1) (2026-05-11)

### Bug Fixes

* **ci,windows:** harden signing checks and repair winreg policy parsing ([db6436a](https://github.com/Amoxine/sshuttle-ui/commit/db6436aed6417975a785bf8d2ea9b102179ba7e8))

## 1.0.0 (2026-05-11)

### Features

* **a11y:** focus traps, error boundary, skip-link, dialog hardening ([9790eee](https://github.com/Amoxine/sshuttle-ui/commit/9790eeed20de7ef319712abf4d06140dfd845bc0)), closes [#main-content](https://github.com/Amoxine/sshuttle-ui/issues/main-content)
* **audit,policy:** tamper-evident audit log, MDM policy reader, redactor ([1ebe772](https://github.com/Amoxine/sshuttle-ui/commit/1ebe7724e357727ef5f02a76290c261a95754d0e))
* backup/restore, idle disconnect, recent sessions ([fe1005f](https://github.com/Amoxine/sshuttle-ui/commit/fe1005fb35425e60f6670375042c5d68711bd4fb))
* **deep-link:** sshuttle-ui:// URL scheme with single-instance routing ([ca09368](https://github.com/Amoxine/sshuttle-ui/commit/ca09368a7ad9c5fe8c6a34de4569ed9739eaeae6))
* initial Tauri 2 + React app with sshuttle integration ([8c1180d](https://github.com/Amoxine/sshuttle-ui/commit/8c1180dfc02383288846d1e1adf96839b442778d))
* **lifecycle:** graceful exit, orphan recovery, force-kill all ([631bd63](https://github.com/Amoxine/sshuttle-ui/commit/631bd634c540dee4f240c310086a5ffea66e079d))
* **macos:** enable Touch ID for sudo from Settings (pam_tid.so) ([f16ded9](https://github.com/Amoxine/sshuttle-ui/commit/f16ded93cfcb2ee062008cb3fbf4da3f744f30d5))
* mega UX pack — status bar, geo, preflight, SSH import, templates ([838e505](https://github.com/Amoxine/sshuttle-ui/commit/838e505ccc389493e18df244a24cdf553498174c))
* **reliability:** auto-reconnect supervisor + native notifications ([73fb820](https://github.com/Amoxine/sshuttle-ui/commit/73fb82093a2eb2d4d24fdb926cdd3a38a98cd73a))
* **stats:** live throughput sampler + sparkline on Dashboard ([d87a2ae](https://github.com/Amoxine/sshuttle-ui/commit/d87a2ae61fc0f0754009f47b1a8abb6bd0d2f67f))
* **telemetry:** opt-in Sentry with privacy-first defaults ([c0252dc](https://github.com/Amoxine/sshuttle-ui/commit/c0252dc6bb0afad9de0e1b2ff308468c9acbfbbf))
* **tray:** live stats + green-check icon + reconnect guards ([88fddda](https://github.com/Amoxine/sshuttle-ui/commit/88fdddaeedf364c709a7c805872aaf21de0bffcb))
* **tray:** minimize-to-tray on close + reliable tray actions ([2213989](https://github.com/Amoxine/sshuttle-ui/commit/22139892e7c692aecfc67043a495dca3016cbe87))
* **typegen:** add tauri-specta scaffold for typed Rust↔TS bindings ([305aaa1](https://github.com/Amoxine/sshuttle-ui/commit/305aaa17c9b1ee39666190d71333d03237328c0c))
* **typegen:** port every command to tauri-specta, rewire all services ([a938acd](https://github.com/Amoxine/sshuttle-ui/commit/a938acdd7a8ce6c036b22f681aaeffe2333920d0))
* **typegen:** typed RuntimeEvent via tauri-specta Event derive ([d9400d3](https://github.com/Amoxine/sshuttle-ui/commit/d9400d3251b8261fc34009d3870ee050b874b7fa))
* **ui:** confirm dialogs for disconnect, imports, and destructive actions ([01b827e](https://github.com/Amoxine/sshuttle-ui/commit/01b827ef409f6ce2fb4b1c5bc9ec35fc666e3963))
* **updater:** tauri-plugin-updater wiring + About page + support bundle ([494b682](https://github.com/Amoxine/sshuttle-ui/commit/494b682d7952b41b374b0761f51c331f8ffdf0b1))
* **ux:** error toasts with "Open logs" + route splitting ([5b69d26](https://github.com/Amoxine/sshuttle-ui/commit/5b69d263b9ddcfa41f7ff7eecd4396c91b64dcba))
* **ux:** settings tabs, EULA, consent + shortcuts overlays, idle warning ([b70970c](https://github.com/Amoxine/sshuttle-ui/commit/b70970cd61cc1c6baf6a8c9bcecf0feaa79418fe)), closes [settings#privacy](https://github.com/Amoxine/settings/issues/privacy)
* **ux:** virtualized logs, profile filters, ⌘K palette, smarter tray ([f5744d7](https://github.com/Amoxine/sshuttle-ui/commit/f5744d71149e9534fa4d3627c7d719444c499859))

### Bug Fixes

* **sshuttle:** disconnect actually kills sudo'd tunnel + persist sessions in SQLite ([908a578](https://github.com/Amoxine/sshuttle-ui/commit/908a57827fee2cbb48d7c457bd06284b59bc510d))

### Performance Improvements

* **bundle:** drop recharts in favor of pure-SVG Sparkline ([565739f](https://github.com/Amoxine/sshuttle-ui/commit/565739fbbf2a4e52fe8901c6f891eb880330418a))

# Changelog

## Unreleased

- **Disconnect now actually kills the tunnel.** Previously, when a profile required `sudo`, clicking Disconnect SIGKILL'd the `sudo` parent — but SIGKILL on `sudo` doesn't propagate to its privileged child, so the tunnel kept running. Stop now does TERM → bounded wait → KILL targeting the privileged sshuttle PIDs directly, with the saved sudo password used to elevate the kill when needed. Falls back to a process-table sweep so nothing is missed.
- **Sessions are now persisted in SQLite end-to-end.** Every connection writes an `active_session` row at start (so the running tunnel survives an app crash and is reconciled on next launch) and closes its `connection_history` row at stop with the actual end time and status (`disconnected`, `failed`, `crashed`, or `force_killed`). Previously only `record_start` was wired, so the heatmap silently undercounted.
- **Boot recovery**: if the previous run crashed mid-session, the leftover history row is closed as `crashed` and the active-session marker is cleared. If the privileged sshuttle is still tunneling, the orphan banner takes over (unchanged behavior).
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
