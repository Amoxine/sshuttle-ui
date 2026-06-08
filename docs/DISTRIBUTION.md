# Distribution (CI, releases, downloads)

## Overview

| Workflow | When it runs | What it produces |
| --- | --- | --- |
| **CI** | Every push/PR to `main` | Lint, typecheck, tests — no installers |
| **Semantic release** | After CI succeeds on `main` (or manual) | Semver bump, changelog, git tag `v*`, empty GitHub Release |
| **Release** | When a `v*` tag is pushed (or manual) | macOS `.dmg`, Linux `.deb`/`.AppImage`, Windows `.msi`/`.exe` attached to that GitHub Release |

End users download installers from **GitHub → Releases**.

---

## CI (`/.github/workflows/ci.yml`)

On every push / PR to `main`:

1. **Frontend**: `npm ci` → ESLint → TypeScript → `npm run build`
2. **Rust**: Linux WebKit/GTK deps → `cargo fmt` → `cargo clippy -D warnings` → `cargo test` → bindings freshness check → link smoke test

---

## Automatic releases

### 1. Push conventional commits to `main`

Use [Conventional Commits](https://www.conventionalcommits.org/) so semantic-release can pick a version:

```
feat: add profile folders
fix: reconnect after sleep
perf!: change default subnets (breaking)
```

Chore/docs/test-only commits usually produce **no** release.

### 2. CI passes → Semantic release runs

`/.github/workflows/semantic-release.yml` triggers when CI completes successfully on `main`. It:

- Bumps `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
- Prepends `public/CHANGELOG.md`
- Pushes `chore(release): x.y.z [skip ci]`
- Creates git tag **`vX.Y.Z`** and a **GitHub Release**

### 3. Tag push → Release builds all platforms

`/.github/workflows/release.yml` triggers on every `v*` tag push and builds in parallel:

| Runner | Artifacts |
| --- | --- |
| `macos-latest` | Universal `.dmg` (Apple Silicon + Intel) |
| `ubuntu-22.04` | `.deb`, `.AppImage` |
| `windows-latest` | `.msi`, NSIS `.exe` |

Binaries are uploaded to the GitHub Release for that tag.

### First-time setup

If the repo has **no** `v*` tags yet, seed one matching your current version before relying on automation:

```bash
git tag v1.0.0
git push origin v1.0.0
```

That tag push also triggers a release build if you want to validate the pipeline immediately.

**Repo admins:** If branch protection blocks bot pushes, allow GitHub Actions to push release commits (ruleset exception) or use a PAT for semantic-release.

---

## Manual release (without waiting for semantic-release)

1. Ensure `src-tauri/tauri.conf.json` `version` matches the tag you want.
2. Create and push a tag:

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

   — **or** go to **Actions → Release → Run workflow**, enter `v1.0.0`, and run.

3. Wait for the three-platform matrix to finish; download assets from **Releases**.

---

## macOS DMG reliability

The release workflow detaches stale `hdiutil` volumes before building. If DMG creation fails locally:

```bash
hdiutil detach "/Volumes/sshuttle UI" || true
npm run app:build
```

---

## Signing secrets (optional)

Installers build and upload **without** any secrets. Configure these only when you want **signed auto-update** bundles (`.sig` files):

| Secret | Purpose |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Full multiline private key from `npm run tauri signer generate -w ~/.tauri/sshuttle-ui.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Passphrase (use an empty string secret if none) |

When `TAURI_SIGNING_PRIVATE_KEY` is set, CI sets `createUpdaterArtifacts: true` via `scripts/prepare-tauri-ci-config.mjs`. Otherwise updater signing is skipped and only plain installers are produced.

---

## Auto-updates (`tauri-plugin-updater`)

The in-app updater is wired but **disabled by default** (`plugins.updater.active: false`, empty `pubkey`). To enable:

1. Generate keys: `npm run tauri signer generate -w ~/.tauri/sshuttle-ui.key`
2. Paste the **public** key into `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`
3. Set `plugins.updater.endpoints` to your `latest.json` URL (e.g. GitHub Releases)
4. Set `bundle.createUpdaterArtifacts: true` locally; CI enables it automatically when signing secrets exist
5. Add `TAURI_SIGNING_*` secrets so release builds produce `.sig` sidecars

See the [Tauri updater guide](https://v2.tauri.app/plugin/updater/).

---

## `Cargo.lock`

`src-tauri/Cargo.lock` is committed so CI and release builds resolve the same dependency graph.
