# sshuttle UI

Desktop GUI for **[sshuttle](https://github.com/sshuttle/sshuttle)** — manage SSH-based tunnel profiles, routing, DNS options, and connection logs without memorizing CLI flags. Built with **Tauri 2**, **React**, **TypeScript**, **Tailwind CSS**, and a **Rust** backend with **SQLite** storage.

## Requirements

| Tool | Notes |
|------|--------|
| **Node.js** | v18+ (`node --version`) |
| **Rust** | Stable toolchain via [rustup](https://rustup.rs/) (`rustc --version`) |
| **sshuttle** | Must be installed on the machine that runs tunnels (not bundled). macOS: `brew install sshuttle`. Debian/Ubuntu: `sudo apt install sshuttle`. The app also searches common install paths when launched from the Dock/Finder so Homebrew binaries are found. |
| **Platform dev libs** | Tauri needs OS-specific dependencies. Follow the [official Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS. |

Optional but recommended:

- **npm** (comes with Node) or **pnpm** / **yarn** if you prefer.

## Quick start (development)

From the repository root:

```bash
npm install
npm run app:dev
```

This runs the Vite dev server and opens the Tauri window with hot reload.

To work on the web UI only in a browser (Tauri APIs will throw unless you guard them):

```bash
npm install
npm run dev
```

Then open the URL Vite prints (default port **1420**).

## Project layout

```
├── src/                 # React frontend (pages, components, services, store)
├── public/              # Static assets (favicon, icon source SVG)
├── src-tauri/           # Rust crate + Tauri config
│   ├── src/             # Commands, sshuttle manager, SQLite, networking
│   ├── icons/           # Bundled icons (regenerate — see below)
│   └── tauri.conf.json  # Window, bundle, tray
├── dist/                # Production web build (created by `npm run build`)
└── package.json         # Scripts and frontend dependencies
```

## Production web build (frontend only)

```bash
npm run build
```

Output goes to `dist/`. The Tauri bundler expects this folder before packaging (`beforeBuildCommand` in `tauri.conf.json`).

## Building the desktop app

**Important:** The usual workflow is to **build on the operating system you want to ship for**. Tauri produces native bundles on that machine. Cross-compiling the desktop shell from one OS to another is possible but involves extra toolchains and target setup; most teams use **CI runners** (macOS, Windows, Linux) per platform.

### Default: current OS

From the repo root:

```bash
npm install
npm run app:build
```

This runs `npm run build` then `tauri build`. Installers and bundles appear under:

`src-tauri/target/release/bundle/`

Typical artifacts:

| Host OS | Common outputs |
|---------|----------------|
| **macOS** | `.app`, `.dmg` (and sometimes `.tar.gz` depending on config) |
| **Windows** | `.msi`, `.exe` (NSIS), portable paths under `bundle/` |
| **Linux** | `.deb`, `.AppImage`, and/or `.rpm` depending on targets |

### Choose bundle formats only (still on the host OS)

Use the Tauri CLI directly with `--bundles` (or `-b`):

**macOS** — DMG and/or plain app:

```bash
npm run build
npx tauri build --bundles dmg,app
```

**Linux** — Debian package and/or AppImage:

```bash
npm run build
npx tauri build --bundles deb,appimage
```

**Windows** — MSI and/or NSIS installer (requires WiX tools / NSIS where applicable — see Tauri docs):

```bash
npm run build
npx tauri build --bundles msi,nsis
```

List available bundle types for your platform:

```bash
npx tauri build --help
```

### Build for a specific CPU architecture (same OS family)

Use Rust **targets** when you need arm64 vs x64 on the same OS (for example Apple Silicon vs Intel Macs, or aarch64 vs x86_64 Linux).

1. Install the Rust target:

   ```bash
   rustup target add aarch64-apple-darwin    # Apple Silicon macOS
   rustup target add x86_64-apple-darwin     # Intel macOS
   rustup target add x86_64-unknown-linux-gnu
   rustup target add aarch64-unknown-linux-gnu
   ```

2. Build with that target:

   ```bash
   npm run build
   npx tauri build --target aarch64-apple-darwin
   ```

Bundled apps land under `src-tauri/target/<target>/release/bundle/` instead of only `release/bundle/`.

### Icons before release

Icons referenced in `src-tauri/tauri.conf.json` must exist. Generate them from the SVG source:

```bash
npx @tauri-apps/cli icon public/icon.svg
```

This refreshes files under `src-tauri/icons/`.

## Scripts reference

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server only |
| `npm run build` | Typecheck + production web bundle → `dist/` |
| `npm run app:dev` | Full Tauri dev app |
| `npm run app:build` | Production web build + Tauri bundling |
| `npm run typecheck` | TypeScript `--noEmit` |
| `npm run lint` | ESLint |
| `npm run preview` | Preview production web build locally |

## Runtime notes

- **sshuttle** is invoked as a subprocess; routing/DNS often needs elevated privileges. The UI offers a **sudo** option where appropriate.
- **Data** (SQLite DB, settings) lives under the OS application data directory for the app id `io.sshuttle.ui` (see **Diagnostics** in the app or `data_dir` from settings commands).
- **Secrets** use the platform keychain/credential manager via the `keyring` crate where implemented.

## Troubleshooting builds

| Problem | What to try |
|---------|-------------|
| `frontendDist` / missing `dist/` | Run `npm run build` before `tauri build`, or rely on `npm run app:build`. |
| macOS code signing / hardened runtime | Configure signing in Xcode / Apple Developer account; see [Tauri macOS signing](https://v2.tauri.app/distribute/sign-macos/). |
| Linux missing webkit/gtk libs | Install distro packages from [Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux). |
| Windows WebView2 | Usually installed; Tauri documents offline installers if needed. |
| `sshuttle` not found inside the packaged app | Ensure sshuttle is installed on the end-user machine; the app searches PATH and common paths (`/opt/homebrew/bin`, `/usr/local/bin`, etc.). |

## CI & releases

GitHub Actions workflows live under `.github/workflows/`:

- **CI** runs ESLint, TypeScript, `npm run build`, `cargo clippy`, and `cargo test` on every push / PR to `main`.
- **Release** builds installers when you push a version tag like `v0.2.0`.

See **[docs/DISTRIBUTION.md](docs/DISTRIBUTION.md)** for DMG cleanup tips, signing secrets (`TAURI_SIGNING_PRIVATE_KEY`), and how to wire **tauri-plugin-updater** when you're ready to publish signed updates.

## Contributing

Use the same formatting and lint scripts before opening a PR:

```bash
npm run typecheck
npm run lint
```

## License

MIT (see `package.json` / crate metadata).
