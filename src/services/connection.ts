import { commands } from "@/bindings";
import type { ConnectionState, SshuttleConfig } from "@/types";
import { unwrap } from "./tauri";

export const connectionService = {
  state: (): Promise<ConnectionState> =>
    commands.connectionState() as Promise<ConnectionState>,
  startByProfile: (profileId: string, sudo = false): Promise<ConnectionState> =>
    unwrap(commands.startByProfile({ profileId, sudo })) as Promise<ConnectionState>,
  startAdHoc: (config: SshuttleConfig, sudo = false): Promise<ConnectionState> =>
    unwrap(commands.startAdHoc({ config, sudo })) as Promise<ConnectionState>,
  stop: async (): Promise<void> => {
    await unwrap(commands.stop());
  },
  restart: (): Promise<ConnectionState> =>
    unwrap(commands.restart()) as Promise<ConnectionState>,
  preview: (
    config: SshuttleConfig,
  ): Promise<{ command: string; args: string[] }> =>
    unwrap(commands.previewCommand(config)),
};
