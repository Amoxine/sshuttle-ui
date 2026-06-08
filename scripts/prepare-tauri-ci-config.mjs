#!/usr/bin/env node
/**
 * Writes src-tauri/tauri.ci.conf.json for CI release builds (all platforms).
 *
 * Tauri validates plugins.updater.pubkey during `tauri build` on every OS.
 * An empty or malformed pubkey fails even when createUpdaterArtifacts is false.
 * When signing is not fully configured we omit the updater plugin block entirely
 * and never pass signing env vars to the build (see release.yml).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src-tauri", "tauri.conf.json");
const out = path.join(root, "src-tauri", "tauri.ci.conf.json");

/** Minisign public keys include comment lines — bare base64 is rejected. */
function isValidMinisignPublicKey(key) {
  return (
    typeof key === "string" &&
    key.includes("untrusted comment:") &&
    key.trim().length > 40
  );
}

const signingKey = process.env.TAURI_SIGNING_PRIVATE_KEY?.trim();
const publicKey = process.env.TAURI_SIGNING_PUBLIC_KEY?.trim();
const signingEnabled =
  Boolean(signingKey) &&
  Boolean(publicKey) &&
  isValidMinisignPublicKey(publicKey);

const config = JSON.parse(fs.readFileSync(src, "utf8"));
config.bundle = config.bundle ?? {};
config.plugins = config.plugins ?? {};

// Never ship updater settings from the base manifest into CI builds.
delete config.plugins.updater;

if (signingEnabled) {
  config.bundle.createUpdaterArtifacts = true;
  config.plugins.updater = {
    active: false,
    dialog: false,
    pubkey: publicKey,
  };
  console.log(
    `Wrote ${path.relative(root, out)} (createUpdaterArtifacts=true, updater pubkey set)`,
  );
} else {
  config.bundle.createUpdaterArtifacts = false;
  if (signingKey && !isValidMinisignPublicKey(publicKey ?? "")) {
    console.warn(
      "WARNING: TAURI_SIGNING_PRIVATE_KEY is set but TAURI_SIGNING_PUBLIC_KEY is missing or not a minisign public key — building unsigned installers only.",
    );
  }
  console.log(
    `Wrote ${path.relative(root, out)} (createUpdaterArtifacts=false, updater plugin omitted)`,
  );
}

fs.writeFileSync(out, `${JSON.stringify(config, null, 2)}\n`);

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `signing_enabled=${signingEnabled}\n`,
  );
}
