import { commands, type ImportBackupResult } from "@/bindings";
import { unwrap } from "./tauri";

export type { ImportBackupResult };

export const backupService = {
  exportJson: (): Promise<string> => unwrap(commands.exportFullBackup()),
  exportToPath: async (path: string): Promise<void> => {
    await unwrap(commands.exportFullBackupToPath(path));
  },
  importPayload: (args: {
    json: string;
    mergeProfiles: boolean;
    applySettings: boolean;
  }): Promise<ImportBackupResult> => unwrap(commands.importFullBackup(args)),
  importFromPath: (args: {
    path: string;
    mergeProfiles: boolean;
    applySettings: boolean;
  }): Promise<ImportBackupResult> =>
    unwrap(commands.importFullBackupFromPath(args)),
};
