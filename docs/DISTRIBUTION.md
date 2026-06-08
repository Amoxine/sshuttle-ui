# Distribution (CI, releases, downloads)

## Overview

| Workflow | When it runs | What it produces |
| --- | --- | --- |
| **CI** | Every push/PR to `main` | Lint, typecheck, tests — no installers |
| **Semantic release** | After CI succeeds on `main` (or manual) | Semver bump, `public/CHANGELOG.md`, git tag `v*`, GitHub Release with generated notes |
| **Release** | When a `v*` tag is pushed (or manual) | macOS `.dmg`, Linux `.deb`/`.AppImage`, Windows `.msi`/`.exe` attached to that release (notes preserved) |

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

| Commit prefix | Version bump |
| --- | --- |
| `fix:` | Patch (1.0.0 → 1.0.1) |
| `feat:` | Minor (1.0.0 → 1.1.0) |
| `feat!:` / `BREAKING CHANGE:` | Major (1.0.0 → 2.0.0) |

Dry-run locally (needs `GITHUB_TOKEN` with `contents: write`):

```bash
GITHUB_TOKEN=ghp_... npx semantic-release --dry-run
```

### 2. CI passes → Semantic release runs

`/.github/workflows/semantic-release.yml` triggers when CI completes successfully on `main`. It:

- Bumps `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
- Prepends `public/CHANGELOG.md`
- Pushes `chore(release): x.y.z [skip ci]`
- Creates git tag **`vX.Y.Z`** and a **GitHub Release** with notes from your commits

Config: [`release.config.cjs`](../release.config.cjs). Workflow: [`.github/workflows/semantic-release.yml`](../.github/workflows/semantic-release.yml).

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

**Repo admins:** If branch protection blocks bot pushes, allow GitHub Actions to push release commits (ruleset exception) or set a `SEMANTIC_RELEASE_TOKEN` PAT and use it instead of `GITHUB_TOKEN` in the semantic-release workflow.

**Manual trigger:** Actions → **Semantic release** → **Run workflow** (branch: `main`) after CI is green, to force a release check without a new push.

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
| `TAURI_SIGNING_PUBLIC_KEY` | Full multiline **public** key printed by the same command (required with the private key) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Passphrase (use an empty string secret if none) |

When both signing keys are set, CI sets `createUpdaterArtifacts: true` and injects the public key into `tauri.ci.conf.json`. Otherwise the updater plugin block is **omitted** so builds never fail on an empty `pubkey`.

---

## Auto-updates (`tauri-plugin-updater`)

The in-app updater is wired in Rust but **has no JSON config in the repo** until you enable signing. To turn on auto-updates later:

1. Generate keys: `npm run tauri signer generate -w ~/.tauri/sshuttle-ui.key`
2. Add GitHub secrets `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PUBLIC_KEY`, and optionally `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
3. Add `plugins.updater` with `pubkey` and `endpoints` to `tauri.conf.json` (see Tauri docs)

If you are **not** using signed updates yet, do **not** set `TAURI_SIGNING_PRIVATE_KEY` alone — a private key without a valid minisign public key used to break macOS/Linux/Windows release builds.

See the [Tauri updater guide](https://v2.tauri.app/plugin/updater/).

---

## `Cargo.lock`

`src-tauri/Cargo.lock` is committed so CI and release builds resolve the same dependency graph.
