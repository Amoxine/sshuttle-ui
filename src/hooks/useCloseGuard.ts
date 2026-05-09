import { useEffect } from "react";

import { onTauri } from "@/services/tauri";
import { useAppStore } from "@/store/appStore";
import { toastError } from "@/utils/toastError";

/**
 * Wires the frontend to the backend's window-close interceptor:
 *   - When the Rust side fires `tray:close-request`, we open the
 *     confirmation dialog.
 *   - When tray actions fail in Rust (`tray:error`), we surface them
 *     as a toast so the user knows the click did something.
 */
export function useCloseGuard(): void {
  const setCloseDialogOpen = useAppStore((s) => s.setCloseDialogOpen);

  useEffect(() => {
    const unlistens: Array<() => void> = [];
    let mounted = true;

    void onTauri<void>("tray:close-request", () => {
      if (!mounted) return;
      setCloseDialogOpen(true);
    }).then((u) => unlistens.push(u));

    void onTauri<{ title: string; message: string }>("tray:error", (p) => {
      if (!mounted) return;
      toastError(new Error(p.message), p.title);
    }).then((u) => unlistens.push(u));

    return () => {
      mounted = false;
      for (const u of unlistens) u();
    };
  }, [setCloseDialogOpen]);
}
