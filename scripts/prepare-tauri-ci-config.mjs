#!/usr/bin/env node
/**
 * Writes src-tauri/tauri.ci.conf.json for CI builds.
 * Enables updater artifact signing only when TAURI_SIGNING_PRIVATE_KEY is set.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src-tauri", "tauri.conf.json");
const out = path.join(root, "src-tauri", "tauri.ci.conf.json");

const config = JSON.parse(fs.readFileSync(src, "utf8"));
config.bundle = config.bundle ?? {};
config.bundle.createUpdaterArtifacts = Boolean(
  process.env.TAURI_SIGNING_PRIVATE_KEY?.trim(),
);

fs.writeFileSync(out, `${JSON.stringify(config, null, 2)}\n`);
console.log(
  `Wrote ${path.relative(root, out)} (createUpdaterArtifacts=${config.bundle.createUpdaterArtifacts})`,
);
