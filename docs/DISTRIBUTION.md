# Distribution (CI, releases, updates)

## CI (`/.github/workflows/ci.yml`)

On every push / PR to `main`, GitHub Actions runs:

1. **Frontend**: `npm ci` → ESLint → TypeScript → `npm run build`
2. **Rust**: Linux WebKit/GTK deps → `cargo clippy -D warnings` → `cargo test`

The Rust job installs native packages required to **link** the Tauri shell on Ubuntu runners.

## Packaging (`/.github/workflows/package.yml`)

After **semantic-release** succeeds on `main`, this workflow runs a **3-OS packaging matrix**:

- macOS
- Ubuntu
- Windows

This workflow builds Tauri bundles and uploads them as **GitHub Actions artifacts** (no release publishing). Use this for continuous cross-platform packaging validation after each successful release decision step.

Manual `workflow_dispatch` runs are constrained to dispatches started from `main`.

## Semantic versioning (`/.github/workflows/semantic-release.yml`)

This workflow runs **after CI completes successfully on `main`** (and is also runnable manually via **Actions → Semantic release → Run workflow**). It:

- Parses commits since the previous **`v*`** git tag using **[Conventional Commits](https://www.conventionalcommits.org/)** (`feat:`, `fix:`, `perf:`, breaking footer/`!`, …).
- Decides the next **semver**, bumps `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, updates `src-tauri/Cargo.lock`, and prepends **`public/CHANGELOG.md`** (served to the in-app changelog drawer).
- Pushes a `chore(release): …` commit (**`[skip ci]`** so CI does not run twice for metadata-only bumps) and creates the **Git tag + GitHub Release**.

Commits that only touch chores/docs/tests typically produce **no** release.

Before relying on automation on an older repo with **no** `v*` tags yet, create one matching your current app version once so the first bump is sane:

```bash
git tag v0.1.0
git push origin v0.1.0
```

(**Repo admins:** If `main` requires reviews or blocks bot pushes, allow GitHub Actions to push release commits—e.g. a ruleset exception—or use a machine-account PAT with semantic-release as documented upstream.)

## Release builds (`/.github/workflows/release.yml`)

Creating or pushing a git tag matching `v*` (for example after semantic-release, or from a manual tag) triggers **tauri-apps/tauri-action**, which:

- Builds installers for **macOS**, **Ubuntu (deb/AppImage)**, and **Windows**
- Uploads artifacts to the **GitHub Release** for that tag (the release is created by semantic-release when using the default pipeline; this workflow attaches binaries to it — **not** a draft, so it matches the published release semantic-release opens)

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
The release workflow now includes a preflight check that fails early when the signing key looks malformed (for example, missing minisign comment lines from partial copy/paste).

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
