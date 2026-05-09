# sshuttle UI

### Tired of running plain `sshuttle` from a terminal?

You know the routine:

```bash
sudo sshuttle -r user@bastion.example.com 10.0.0.0/8 192.168.0.0/16 \
  -x 192.168.1.0/24 --dns --to-ns 1.1.1.1 -e "ssh -i ~/.ssh/work_ed25519 -J jump@gateway"
```

So you alias it. Then you alias the *other* two — one per environment — and now you can never remember which is `vpn`, which is `vpn-staging`, and which one routes your home subnet into a black hole. A few more papercuts pile up:

- You paste your **sudo password into a terminal** that still has your last command in scrollback.
- Your laptop sleeps, the SSH session dies, and you only notice ten minutes later when **Slack starts erroring out** — sshuttle didn't reconnect, and nothing told you.
- You want to **see throughput, logs, and which subnets are actually routed** without `tcpdump`-ing your way to enlightenment.
- Disconnecting cleanly means `ps aux | grep sshuttle | awk … | sudo xargs kill`, and half the time it leaves a privileged orphan running anyway.
- You want a **tray icon**, a **kill-switch**, **profiles**, **auto-reconnect on Wi-Fi changes**, and a way to **import the hosts you already keep in `~/.ssh/config`** instead of retyping them as flags.
- You don't want to install a SaaS VPN, a kernel module, or "yet another agent" — you just want the SSH access you already have, packaged like a real VPN client.

That's what this is.

> A modern desktop client that drives **[sshuttle](https://github.com/sshuttle/sshuttle)** the way Tailscale or Mullvad drives WireGuard — profiles, routes, DNS, live throughput, system tray, and sane defaults. Every host you can already SSH into becomes a one-click VPN, with no server-side install and no userland network drivers.

<!-- Badges: replace OWNER/REPO with your fork or fill in once published -->
<p>
  <a href="../../actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/OWNER/REPO/ci.yml?branch=main&label=CI"></a>
  <img alt="Platforms" src="https://img.shields.io/badge/platforms-macOS%20%7C%20Linux%20%7C%20Windows%20(WSL)-blue">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green">
  <img alt="Stack" src="https://img.shields.io/badge/stack-Tauri%202%20%2B%20React%20%2B%20Rust-orange">
</p>

> **Screenshot placeholder** — drop a `docs/img/dashboard.png` and reference it here.

## Why use this

| You want… | Use this if… |
|---|---|
| A VPN you can stand up against any SSH host you already have | ✅ |
| Tailscale-style ergonomics over a tool you already trust (`sshuttle`) | ✅ |
| Connection profiles, routes, DNS toggles, live logs without the man page | ✅ |
| A free, local-first alternative to commercial VPN GUIs | ✅ |
| WireGuard-grade throughput on untrusted Wi-Fi | ❌ Use WireGuard or Tailscale; sshuttle is TCP-over-SSH |
| OS-level kill-switch that drops all traffic when the tunnel dies | ❌ Not in scope yet — see [Roadmap](#roadmap--non-goals) |
| Multiple simultaneous tunnels | ❌ Single managed process today |

## Feature tour

### Connect
- **Profiles** for hosts, routes, jump hosts, identity files, exclude subnets, IPv6, DNS, and per-profile pre/post scripts.
- **Quick templates** in the editor (full tunnel, RFC1918 split, compression).
- **Import** SSH host blocks from `~/.ssh/config`.
- **Preflight** before each connect — DNS resolution, `sshuttle` binary check, SSH batch-mode probe.
- **Sudo pre-auth dialog** primes the sudo cache (with optional Touch ID on macOS via PAM); no terminal required.
- **Background-friendly** — closing the window keeps the tunnel running in the tray. The first close prompts you between *minimize to tray* and *quit and disconnect*; **Tray ▸ Quit** and **⌘Q** always exit cleanly.

### Operate
- **Live status bar** with phase, active profile, and current throughput.
- **Tray menu** with connect, disconnect, favorite quick-connect, stats, and profile state — actions run **synchronously from the menu handler** so they work even before the webview has booted.
- **Auto-reconnect supervisor** with backoff + max-attempt cap, network-change and sleep/wake triggers, and a soft kill-switch overlay if the tunnel dies unexpectedly.
- **Captive-portal hint** while connected (probe-based).

### Inspect
- **Live logs** (virtualized) with level filtering and export.
- **Throughput sparkline**, **public IP + geo card**, **connection-time heatmap** from local history.
- **Diagnostics page** — environment report, default route, ping, DNS, history.

### Govern
- **OS keychain** for SSH passwords and the optional saved sudo password (Keychain / Credential Manager / Secret Service).
- **Orphan-process scanner** — detects `sshuttle` processes left over from a previous crash and offers a one-click *Force kill all* (TERM → KILL, with optional `sudo -S`).
- **Reduced-motion** support and a **command palette** (⌘K / Ctrl+K) for power users.
- **In-app changelog** drawer fed by `public/CHANGELOG.md`.

## Quick start

### As a user

1. Install **[sshuttle](https://github.com/sshuttle/sshuttle)** itself:
   - macOS: `brew install sshuttle`
   - Debian/Ubuntu: `sudo apt install sshuttle`
   - Fedora/RHEL: `sudo dnf install sshuttle`
   - From source: `pipx install sshuttle`
2. Download the installer for your OS from **[Releases](../../releases)**.
3. Launch the app, create a profile, click **Connect**.

The app searches `PATH` plus common install dirs (`/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`, …) so Homebrew binaries are found even when launched from the Dock.

### As a contributor

```bash
git clone https://github.com/OWNER/REPO.git sshuttle-ui
cd sshuttle-ui
npm install
npm run app:dev          # Vite + Tauri with hot reload
```

Frontend-only (Tauri APIs throw unless guarded):

```bash
npm run dev              # http://localhost:1420
```

**Prerequisites** — install once:

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥18 | `node --version` |
| Rust | stable | `rustup default stable` |
| Tauri 2 system deps | per-OS | [official prerequisites](https://v2.tauri.app/start/prerequisites/) |
| sshuttle | any | Required at runtime; not bundled |

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                          sshuttle UI process                           │
│                                                                        │
│  ┌──────────────────────┐         IPC (invoke /          ┌──────────┐  │
│  │   Webview (React)    │  ←───── tauri events) ───────→ │  Rust    │  │
│  │   src/               │                                │  core    │  │
│  │                      │                                │ src-tauri│  │
│  │  • Pages, components │                                │          │  │
│  │  • Zustand store     │                                │          │  │
│  │  • Toaster, palette  │                                │          │  │
│  └──────────────────────┘                                │          │  │
│                                                          │          │  │
│         ┌────────────────────────────────────────────────┘          │  │
│         │                                                           │  │
│         ▼                ▼                ▼                ▼        │  │
│   SshuttleManager   SecretStore     SQLite (rusqlite)   System      │  │
│   (tokio child,     (keyring)        profiles/history/  watchers,   │  │
│    log buffer,                       settings           tray, sudo, │  │
│    cancel token)                                        notifications│ │
│         │                                                           │  │
│         ▼                                                           │  │
│   sshuttle (subprocess; with `sudo -E -n` when elevation needed)    │  │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                              Remote SSH host
```

### Key components

| Layer | Path | Responsibility |
|---|---|---|
| UI shell | `src/layout/AppShell.tsx` | Routing, global hooks (boot, theme, tray-sync, kill-switch, captive-portal, close-guard, reconnect supervisor). |
| State | `src/store/appStore.ts` (Zustand) | Single source of truth for profiles, settings, connection, logs, stats, reconnect. |
| Tauri commands | `src-tauri/src/commands/` | The narrow IPC surface: `connection`, `profiles`, `settings`, `logs`, `dns`, `ssh`, `system`, `sudo`, `network`, `preflight`, `ssh_import`, `window`, `diagnostics`. |
| sshuttle engine | `src-tauri/src/sshuttle/` | `manager.rs` owns the child + reader tasks; `command.rs` builds argv; `sampler.rs` tracks throughput; `process_scanner.rs` detects orphans; `resolver.rs` finds the binary. |
| System integration | `src-tauri/src/system/` | `tray.rs` + `tray_actions.rs` (synchronous tray menu), `window_guard.rs` (close-button interceptor), `watcher.rs` (sleep/wake + route changes), `icon_overlay.rs` (status icon), `notification.rs`. |
| Storage | `src-tauri/src/storage/` | `db.rs` opens SQLite (WAL); `profiles.rs`, `history.rs`, `settings.rs` are typed repos. Migrations are forward-only via a `MIGRATIONS` slice. |
| Security | `src-tauri/src/security/keychain.rs` | OS-native credential storage abstraction (`keyring` crate). |
| Networking | `src-tauri/src/network/` | Default-route sampling, interface enumeration. |

### Event bus

The Rust core emits a single `RuntimeEvent` enum on a `sshuttle:event` channel; the webview applies them to the Zustand store. This keeps the IPC surface narrow (one event type, one channel) and the UI deterministic — every state change in the UI is replayable from a sequence of events.

```
RuntimeEvent ::= Phase | Log | Stats | NetworkChanged | OrphansDetected
```

### Architectural decisions worth knowing (the "not"s)

- **Tauri 2, not Electron** — ~10× smaller bundles and Rust-side OS access without a Node sidecar.
- **sshuttle resolved from `PATH`, not bundled** — packaging Python + sshuttle would bloat installers and break user upgrades.
- **SQLite, not flat JSON** — we need transactional history and indexed queries (heatmap, `sort_order`).
- **Single managed sshuttle process, not a pool** — multi-tunnel needs a broader rethink (per-tunnel tray entries, route conflict resolution); deferred to v2.
- **Soft kill-switch overlay, not OS firewall rules** — true kill-switch requires per-OS firewall code (pf / nftables / WFP); deferred.
- **Tray actions inline, not via the IPC event bus** — earlier versions emitted `tray:connect` and listened on the Rust side; that's flaky in Tauri 2 because of listener-attach timing. Menu handlers now spawn the work directly so a click *always* runs.
- **No telemetry.** All data is local; the only outbound call is the optional `ipwho.is` lookup behind the public-IP card.

## Security model

This is a VPN-class tool — be explicit about trust.

| Surface | What we do | What you should know |
|---|---|---|
| **Privilege escalation** | When a profile needs elevation, the app prompts in-app, runs `sudo -S -v` to prime the sudo cache, then spawns `sshuttle` with `sudo -E -n`. We refuse to spawn if the cache isn't primed (avoids `fw: fatal: You must have root privileges`). | The saved sudo password (optional) lives in the OS keychain only and never appears in argv. macOS users can enable Touch ID for sudo via `pam_tid.so` — see in-app Settings ▸ Touch ID hint. |
| **SSH passwords** | Stored per-profile in the OS keychain under key `profile-pwd-<id>`. Passed to `sshpass -e` via `SSHPASS` env var so they never touch argv or logs. | Requires `sshpass` for non-interactive password auth. Prefer agent or key auth where you can. |
| **Process lifecycle** | App exit triggers `RunEvent::ExitRequested` which gracefully stops sshuttle (3s bound). On Unix, we also scan for and reap any orphaned privileged children (because `SIGKILL` on `sudo` does not propagate). | Force-kill panic button uses `TERM → KILL` and can elevate with the saved sudo password. |
| **Network probes** | The optional public-IP card calls `https://ipwho.is/`. Nothing else leaves your machine. | Disable the card if you don't want the lookup. |
| **Local data** | SQLite DB (profiles, history, settings) at the platform data dir under `io.sshuttle.ui`. World-readable file mode by default; plain SQLite, no at-rest encryption — sensitive secrets are *not* in the DB. | Back up the data dir to migrate machines; reset by deleting it. The Diagnostics page shows the exact path. |
| **CSP** | Strict CSP in `tauri.conf.json` — `default-src 'self' ipc:`; no remote scripts. | Inline styles allowed (Tailwind); inline scripts blocked. |

## Failure modes & Day-2 ops

| Failure | What the app does |
|---|---|
| `sshuttle` crashes mid-session | Reader tasks notice EOF, `wait_for_exit` flips phase to `Failed`, supervisor schedules a reconnect (capped). |
| Network changes (Wi-Fi → wired, sleep/wake) | `system::watcher` emits `NetworkChanged`; supervisor triggers an out-of-band reconnect rather than waiting for sshuttle to time out. |
| Sudo cache expired between dialog and spawn | We use `sudo -n` so it fails fast with a clear error rather than blocking on a phantom TTY. |
| App SIGKILL'd by OS | Privileged sshuttle child is left as orphan → next launch, the `process_scanner` detects it and the dashboard banner offers *Force kill all*. |
| User clicks the window close button | Window guard intercepts, asks once (*minimize to tray* vs *quit*), and remembers the choice. Tray Quit and ⌘Q always exit. |
| Captive portal | While connected, periodic probe to `connectivitycheck.gstatic.com` raises a toast if a redirect is detected. |
| Tunnel disconnects unexpectedly with kill-switch on | Soft kill-switch overlay covers the UI until the user reconnects or clears it. |

## Configuration & data

| Item | Location |
|---|---|
| SQLite DB (profiles, history, settings) | `<data_dir>/sshuttle-ui.sqlite` (visible on the Diagnostics page) |
| Saved SSH/sudo passwords | OS keychain, service `io.sshuttle.ui` |
| In-app changelog | `public/CHANGELOG.md` (drawer renders this verbatim) |
| Logs | In-memory ring buffer (configurable size in Settings); export to file from Logs page |
| Default profile + autostart | Settings page |

`<data_dir>` is the platform default — `~/Library/Application Support/io.sshuttle.ui` on macOS, `~/.local/share/io.sshuttle.ui` on Linux, `%APPDATA%\io.sshuttle.ui` on Windows.

## Project layout

```
sshuttle-ui/
├── src/                    # React frontend
│   ├── pages/              # Dashboard, Profiles, Editor, Logs, DNS, Diagnostics, Settings
│   ├── components/         # Status bar, tray sync, dialogs, charts, command palette
│   ├── hooks/              # useBoot, useReconnectSupervisor, useCloseGuard, useTraySync, …
│   ├── store/appStore.ts   # Zustand store
│   ├── services/           # Thin wrappers over `invoke` per command module
│   └── layout/AppShell.tsx # Global hooks + outlet
├── src-tauri/
│   ├── src/
│   │   ├── commands/       # IPC surface (one module per concern)
│   │   ├── sshuttle/       # Manager, command builder, sampler, process scanner
│   │   ├── system/         # Tray, window guard, watcher, icon overlay, autostart
│   │   ├── storage/        # SQLite + repos + migrations
│   │   ├── security/       # OS keychain abstraction
│   │   ├── network/, dns/, ssh/, automation/
│   │   ├── state.rs        # AppState (managed by Tauri)
│   │   └── lib.rs          # Tauri builder, command registration, RunEvent loop
│   ├── icons/              # Generated by `npx tauri icon public/icon.svg`
│   └── tauri.conf.json
├── public/                 # Static assets + CHANGELOG.md
├── docs/DISTRIBUTION.md    # CI, signing, updater wiring
└── .github/workflows/      # ci.yml, release.yml
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run app:dev` | Tauri + Vite with hot reload (the usual dev loop) |
| `npm run dev` | Vite only (frontend, browser) |
| `npm run build` | TypeScript build + production web bundle → `dist/` |
| `npm run app:build` | `npm run build` + `tauri build` (installers in `src-tauri/target/release/bundle/`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (flat config) with `--max-warnings=0` |
| `npm run preview` | Preview the production web bundle |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Rust unit tests |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | Rust lints |

## Building installers

The default `npm run app:build` produces native bundles on the host OS — `.app`/`.dmg` on macOS, `.deb`/`.AppImage` on Linux, `.msi`/`.exe` on Windows. CI runners do this per-platform on git tags matching `v*`.

<details>
<summary>Specific bundle formats / cross-arch / icon regeneration</summary>

Choose specific bundles:

```bash
npm run build && npx tauri build --bundles dmg,app          # macOS
npm run build && npx tauri build --bundles deb,appimage     # Linux
npm run build && npx tauri build --bundles msi,nsis         # Windows
```

Build for a specific Rust target on the same OS family (e.g. Apple Silicon vs Intel):

```bash
rustup target add aarch64-apple-darwin
npm run build && npx tauri build --target aarch64-apple-darwin
```

Outputs land under `src-tauri/target/<target>/release/bundle/`.

Regenerate icons after editing `public/icon.svg`:

```bash
npx @tauri-apps/cli icon public/icon.svg
```

For signing, updater wiring, and CI release flow, see **[`docs/DISTRIBUTION.md`](docs/DISTRIBUTION.md)**.

</details>

## Platform support

| OS | Status | Notes |
|---|---|---|
| **macOS 11+** | ✅ Tier 1 | Tested on Apple Silicon and Intel; Touch ID for sudo supported via `pam_tid.so`. |
| **Linux (X11)** | ✅ Tier 1 | GTK + WebKitGTK 4.1; `appindicator` recommended for tray on GNOME. |
| **Linux (Wayland)** | ⚠️ Mostly | Tray support depends on the desktop's StatusNotifierItem implementation (KDE works; vanilla GNOME needs the AppIndicator extension). |
| **Windows 10/11** | ✅ Tier 2 | WebView2 required (usually pre-installed). sshuttle itself runs under WSL — point the app at the WSL `sshuttle` binary. |

## Troubleshooting

| Problem | Try |
|---|---|
| `sshuttle: error: unrecognized arguments: --latency-control` | Update sshuttle (≥1.1). Latency control is on by default in modern sshuttle; the app only emits `--no-latency-control` to disable it. |
| `fw: fatal: You must have root privileges` | The sudo cache wasn't primed. Use the in-app sudo dialog (Settings ▸ sudo) before connecting. |
| `sshuttle` not found when launched from Dock/Finder (macOS) | The app already searches `/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`. If it still isn't found, set the path in Settings or symlink the binary into `/usr/local/bin`. |
| Tray icon doesn't appear on GNOME Wayland | Install the **AppIndicator** GNOME Shell extension. |
| Linux build fails on missing webkit/gtk libs | See [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux). |
| Tunnel keeps dropping after sleep | Make sure *Reconnect on network change* is enabled (Settings ▸ Reconnect). |
| Want to start over | Quit the app, delete the data dir shown on the Diagnostics page, and remove the keychain entries under service `io.sshuttle.ui`. |

## Roadmap & non-goals

**Planned**
- Hard kill-switch via OS firewall rules (pf / nftables / WFP).
- Multiple simultaneous tunnels with per-tunnel tray entries.
- Per-app routing (split tunneling at the process level — Linux first, via cgroup/iptables).
- Updater plugin enabled with per-publisher signing keys (scaffolding already in `docs/DISTRIBUTION.md`).
- Profile sync via an optional self-hosted backend (encrypted, opt-in).

**Explicitly out of scope**
- Bundling sshuttle inside the installer.
- Replacing sshuttle's transport (this is a UI for sshuttle, not a new VPN protocol).
- Telemetry of any kind.
- Mobile clients.

## Contributing

Before opening a PR:

```bash
npm run typecheck && npm run lint
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

CI runs the same checks plus a `npm run build` smoke test.

When adding a feature that touches the IPC boundary:

1. Add the typed command in `src-tauri/src/commands/<area>.rs` and register it in `src-tauri/src/lib.rs`.
2. Add the matching service wrapper in `src/services/<area>.ts` and the type in `src/types/index.ts`.
3. If it's an event rather than a request/response, extend the `RuntimeEvent` enum on both sides.
4. Update `public/CHANGELOG.md`.

## License

MIT — see crate metadata and `package.json`.
