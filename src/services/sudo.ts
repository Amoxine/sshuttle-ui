import { commands } from "@/bindings";
import { unwrap } from "./tauri";

export interface SudoStatus {
  cached: boolean;
  hasSavedPassword: boolean;
  supported: boolean;
}

/** macOS Touch ID for `sudo` (`pam_tid.so`); other platforms set `supported` false */
export interface TouchIdSudoStatus {
  supported: boolean;
  fileReadable: boolean;
  enabled: boolean;
  filePath: string;
}

export const sudoService = {
  status: (): Promise<SudoStatus> => unwrap(commands.sudoStatus()),
  /**
   * Pre-authenticate sudo. When `password` is `null`/`undefined`, the backend
   * tries the keychain-saved password (if any). Resolves to `true` when sudo
   * credentials are now cached, `false` when no usable password was found.
   */
  authenticate: (password: string | null, save: boolean): Promise<boolean> =>
    unwrap(commands.sudoAuthenticate(password, save)),
  /** Forget keychain entry and clear sudo's credential timestamp. */
  forget: async (): Promise<void> => {
    await unwrap(commands.sudoForget());
  },

  touchIdStatus: (): Promise<TouchIdSudoStatus> =>
    unwrap(commands.touchIdSudoStatus()),

  /** Insert/remove `pam_tid.so` in `/etc/pam.d/sudo`. Password optional if sudo is cached or keychain has sudo password. */
  touchIdSetEnabled: async (
    enabled: boolean,
    password: string | null,
  ): Promise<void> => {
    await unwrap(commands.touchIdSudoSetEnabled({ enabled, password }));
  },
};
