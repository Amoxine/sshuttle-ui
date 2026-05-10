/**
 * Semantic versioning + changelog from Conventional Commits.
 *
 * Requires commits like: feat:, fix:, perf:, refactor!: (breaking), etc.
 * Docs: https://www.conventionalcommits.org/
 *
 * Flow: push to main → analyze commits since last git tag → bump semver,
 * update manifests, prepend public/CHANGELOG.md, push chore(release) commit,
 * create Git tag + GitHub Release → tag push triggers `.github/workflows/release.yml`
 * (Tauri binaries attach to that existing release when releaseDraft matches).
 */
module.exports = {
  branches: ["main"],
  tagFormat: "v${version}",
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "conventionalcommits",
      },
    ],
    [
      "@semantic-release/release-notes-generator",
      {
        preset: "conventionalcommits",
      },
    ],
    [
      "@semantic-release/changelog",
      {
        changelogFile: "public/CHANGELOG.md",
      },
    ],
    [
      "@semantic-release/npm",
      {
        npmPublish: false,
      },
    ],
    [
      "@semantic-release/exec",
      {
        prepareCmd:
          "node scripts/bump-release-version.mjs ${nextRelease.version} && cargo update -p sshuttle-ui --manifest-path src-tauri/Cargo.toml",
      },
    ],
    [
      "@semantic-release/git",
      {
        assets: [
          "public/CHANGELOG.md",
          "package.json",
          "package-lock.json",
          "src-tauri/Cargo.toml",
          "src-tauri/Cargo.lock",
          "src-tauri/tauri.conf.json",
        ],
        message:
          "chore(release): ${nextRelease.version}\n\n[skip ci]",
      },
    ],
    "@semantic-release/github",
  ],
};
