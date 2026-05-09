import { invoke } from "./tauri";

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
  status: () => invoke<SudoStatus>("sudo_status"),
  /**
   * Pre-authenticate sudo. When `password` is `null`/`undefined`, the backend
   * tries the keychain-saved password (if any). Resolves to `true` when sudo
   * credentials are now cached, `false` when no usable password was found.
   */
  authenticate: (password: string | null, save: boolean) =>
    invoke<boolean>("sudo_authenticate", { password, save }),
  /** Forget keychain entry and clear sudo's credential timestamp. */
  forget: () => invoke<void>("sudo_forget"),

  touchIdStatus: () => invoke<TouchIdSudoStatus>("touch_id_sudo_status"),

  /** Insert/remove `pam_tid.so` in `/etc/pam.d/sudo`. Password optional if sudo is cached or keychain has sudo password. */
  touchIdSetEnabled: (enabled: boolean, password: string | null) =>
    invoke<void>("touch_id_sudo_set_enabled", { args: { enabled, password } }),
};
