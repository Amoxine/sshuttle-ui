import type { AppSettings } from "@/types";
import { invoke } from "./tauri";

export const settingsService = {
  load: () => invoke<AppSettings>("get_settings"),
  save: (settings: AppSettings) =>
    invoke<AppSettings>("save_settings", { settings }),
  dataDir: () => invoke<string>("data_dir"),
};
