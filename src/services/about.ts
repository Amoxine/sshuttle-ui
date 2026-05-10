import { commands } from "@/bindings";
import type {
  AppVersionInfo,
  SupportBundle,
  UpdateCheckResult,
} from "@/bindings";

import { unwrap } from "./tauri";

export const aboutService = {
  versionInfo: () =>
    unwrap(commands.appVersionInfo()) as Promise<AppVersionInfo>,
  checkForUpdate: () =>
    unwrap(commands.checkForUpdate()) as Promise<UpdateCheckResult>,
  installUpdate: async () => {
    await unwrap(commands.installUpdate());
  },
  generateSupportBundle: () =>
    unwrap(commands.generateSupportBundle()) as Promise<SupportBundle>,
};
