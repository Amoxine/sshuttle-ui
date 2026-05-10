import { invoke } from "./tauri";

export interface ImportBackupResult {
  profilesWritten: number;
  settingsApplied: boolean;
}

export const backupService = {
  exportJson: () => invoke<string>("export_full_backup"),
  exportToPath: (path: string) =>
    invoke<void>("export_full_backup_to_path", { path }),
  importPayload: (args: {
    json: string;
    mergeProfiles: boolean;
    applySettings: boolean;
  }) =>
    invoke<ImportBackupResult>("import_full_backup", {
      args: {
        json: args.json,
        mergeProfiles: args.mergeProfiles,
        applySettings: args.applySettings,
      },
    }),
  importFromPath: (args: {
    path: string;
    mergeProfiles: boolean;
    applySettings: boolean;
  }) =>
    invoke<ImportBackupResult>("import_full_backup_from_path", {
      args: {
        path: args.path,
        mergeProfiles: args.mergeProfiles,
        applySettings: args.applySettings,
      },
    }),
};
