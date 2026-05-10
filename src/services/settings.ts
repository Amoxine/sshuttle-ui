import { commands } from "@/bindings";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "@/types";
import { unwrap } from "./tauri";

/**
 * Backend exposes most fields on `AppSettings` as optional because they
 * have `#[serde(default)]` on the Rust side. The rest of the frontend
 * still treats them as required, so we coerce by overlaying our default
 * struct at the boundary.
 */
const hydrate = (s: object | null | undefined): AppSettings => ({
  ...DEFAULT_APP_SETTINGS,
  ...(s ?? {}),
});

export const settingsService = {
  load: async (): Promise<AppSettings> =>
    hydrate(await unwrap(commands.getSettings())),
  save: async (settings: AppSettings): Promise<AppSettings> =>
    hydrate(await unwrap(commands.saveSettings(settings))),
  dataDir: (): Promise<string> => commands.dataDir(),
};
