import type { ConnectionState, SshuttleConfig } from "@/types";
import { invoke } from "./tauri";

export const connectionService = {
  state: () => invoke<ConnectionState>("connection_state"),
  startByProfile: (profileId: string, sudo = false) =>
    invoke<ConnectionState>("start_by_profile", {
      args: { profileId, sudo },
    }),
  startAdHoc: (config: SshuttleConfig, sudo = false) =>
    invoke<ConnectionState>("start_ad_hoc", {
      args: { config, sudo },
    }),
  stop: () => invoke<void>("stop"),
  restart: () => invoke<ConnectionState>("restart"),
  preview: (config: SshuttleConfig) =>
    invoke<{ command: string; args: string[] }>("preview_command", { config }),
};
