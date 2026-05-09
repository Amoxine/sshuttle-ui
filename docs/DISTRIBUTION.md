# Distribution (CI, releases, updates)

## CI (`/.github/workflows/ci.yml`)

On every push / PR to `main`, GitHub Actions runs:

1. **Frontend**: `npm ci` → ESLint → TypeScript → `npm run build`
2. **Rust**: Linux WebKit/GTK deps → `cargo clippy -D warnings` → `cargo test`

The Rust job installs native packages required to **link** the Tauri shell on Ubuntu runners.

## Release builds (`/.github/workflows/release.yml`)

Pushing a git tag matching `v*` (for example `v0.2.0`) triggers **tauri-apps/tauri-action**, which:

- Builds installers for **macOS**, **Ubuntu (deb/AppImage)**, and **Windows**
- Uploads artifacts to a **GitHub Release** (draft by default — flip to published when ready)

### macOS DMG reliability

The workflow runs a small **pre-clean** step that detaches stale `hdiutil` volumes named like our product bundle before `tauri build`. If DMG creation still fails, locally run:

```bash
hdiutil detach "/Volumes/sshuttle UI" || true
```

then retry `npm run app:build`.

### Signing secrets (optional but recommended)

Configure repository **Secrets**:

| Secret | Purpose |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of the **private** key from `npm run tauri signer generate -w ~/.tauri/my.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Passphrase for that key (empty string if none) |

Without these, installers still build; **signed updater artifacts** (`.sig` files) need the private key at compile time.

---

## Auto-updates (`tauri-plugin-updater`)

The app does **not** ship with updater signing keys — each publisher must generate their own.

### One-time key generation (developer machine with a TTY)

```bash
npm run tauri signer generate -w ~/.tauri/sshuttle-ui.key
# Paste the printed **public** key into src-tauri/tauri.conf.json → plugins.updater.pubkey
```

### Enable updater bundles

In `src-tauri/tauri.conf.json`:

```json
{
  "bundle": {
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "pubkey": "PASTE_PUBLIC_KEY_HERE",
      "endpoints": [
        "https://github.com/<OWNER>/<REPO>/releases/latest/download/latest.json"
      ]
    }
  }
}
```

Then add the Rust + JS updater plugins:

```bash
cargo add tauri-plugin-updater@2 --manifest-path src-tauri/Cargo.toml
npm install @tauri-apps/plugin-updater@^2
```

Wire `.plugin(tauri_plugin_updater::Builder::new().build())` in `src-tauri/src/lib.rs`, grant `updater:default` in `capabilities/default.json`, and call `check()` from the UI (see the [Tauri updater guide](https://v2.tauri.app/plugin/updater/)).

### `latest.json` format

GitHub Releases can host a static `latest.json` next to signed bundles. See the upstream docs for the exact schema (`version`, `platforms.<target>.url`, `platforms.<target>.signature`, …).

---

## `Cargo.lock`

This repository **commits** `src-tauri/Cargo.lock` so CI and release builds resolve the same dependency graph.
