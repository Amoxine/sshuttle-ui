#!/usr/bin/env node
/**
 * Sync Rust/Tauri manifests to the semantic-release version.
 * package.json is updated by @semantic-release/npm (prepare phase, before this runs).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error("usage: bump-release-version.mjs <semver>");
  process.exit(1);
}

function syncCargoToml(contents) {
  if (!/^version = "[^"]+"/m.test(contents)) {
    throw new Error('src-tauri/Cargo.toml: expected `[package] version = "..."`');
  }
  return contents.replace(/^version = "[^"]+"/m, `version = "${version}"`);
}

const cargoPath = path.join(root, "src-tauri", "Cargo.toml");
fs.writeFileSync(cargoPath, syncCargoToml(fs.readFileSync(cargoPath, "utf8")));

const tauriPath = path.join(root, "src-tauri", "tauri.conf.json");
let tauriRaw = fs.readFileSync(tauriPath, "utf8");
if (!/"version"\s*:/.test(tauriRaw)) {
  console.error("src-tauri/tauri.conf.json: missing version field");
  process.exit(1);
}
tauriRaw = tauriRaw.replace(/("version"\s*:\s*")([^"]+)(")/, `$1${version}$3`);
fs.writeFileSync(tauriPath, tauriRaw);

console.log(`Synced src-tauri manifests to ${version}`);
