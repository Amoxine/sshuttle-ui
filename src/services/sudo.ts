import { invoke } from "./tauri";

export interface SudoStatus {
  cached: boolean;
  hasSavedPassword: boolean;
  supported: boolean;
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
};
