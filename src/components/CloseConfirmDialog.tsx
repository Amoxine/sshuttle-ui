import { Loader2, LogOut, MinusSquare, X } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { invoke } from "@/services/tauri";
import { useAppStore } from "@/store/appStore";
import { toastError } from "@/utils/toastError";

/**
 * Modal shown the first time the user clicks the window's close button.
 * Lets them pick between "keep running in tray" and "quit and
 * disconnect", with a remember-my-choice toggle so the dialog can be
 * suppressed for future close events.
 */
export function CloseConfirmDialog() {
  const open = useAppStore((s) => s.closeDialogOpen);
  const setOpen = useAppStore((s) => s.setCloseDialogOpen);
  const connection = useAppStore((s) => s.connection);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState<"minimize" | "quit" | null>(null);

  useEffect(() => {
    if (!open) {
      setBusy(null);
      setRemember(true);
    }
  }, [open]);

  if (!open) return null;

  const isConnected =
    connection?.phase === "connected" ||
    connection?.phase === "connecting" ||
    connection?.phase === "reconnecting" ||
    connection?.phase === "starting";

  const minimize = async () => {
    setBusy("minimize");
    try {
      await invoke("apply_close_choice", {
        args: { action: "minimize", remember },
      });
      setOpen(false);
      if (remember) {
        toast.success(
          "Window will minimize to tray. Change in Settings → Application.",
          { duration: 4000 },
        );
      }
    } catch (e) {
      toastError(e, "Could not minimize");
    } finally {
      setBusy(null);
    }
  };

  const quit = async () => {
    setBusy("quit");
    try {
      await invoke("apply_close_choice", {
        args: { action: "quit", remember },
      });
      // App will exit shortly. Close the dialog so it doesn't flash.
      setOpen(false);
    } catch (e) {
      toastError(e, "Could not quit");
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[99] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-confirm-title"
    >
      <div className="card relative w-full max-w-md border border-brand-500/30 shadow-2xl">
        <button
          type="button"
          aria-label="Cancel"
          className="absolute right-3 top-3 rounded-md p-1 text-ink-400 hover:text-ink-100"
          onClick={() => setOpen(false)}
        >
          <X className="size-4" />
        </button>
        <h2
          id="close-confirm-title"
          className="text-lg font-semibold text-ink-100 light:text-ink-900"
        >
          Close sshuttle UI?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-400">
          {isConnected
            ? "Your tunnel is currently active. You can keep it running in the background, or quit and disconnect."
            : "What should the close button do? You can change this later in Settings."}
        </p>

        <div className="mt-5 grid gap-2">
          <button
            type="button"
            className="flex w-full items-start gap-3 rounded-lg border border-ink-700 bg-ink-900/40 p-3 text-left transition hover:border-brand-500/60 hover:bg-ink-900/60 disabled:opacity-50"
            onClick={minimize}
            disabled={busy !== null}
          >
            <div className="mt-0.5 rounded-md bg-brand-500/10 p-1.5 text-brand-400">
              {busy === "minimize" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <MinusSquare className="size-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ink-100 light:text-ink-900">
                Keep running in tray
              </div>
              <div className="mt-0.5 text-xs text-ink-400">
                Window hides; the tunnel keeps running. Click the tray icon
                to come back.
              </div>
            </div>
          </button>

          <button
            type="button"
            className="flex w-full items-start gap-3 rounded-lg border border-ink-700 bg-ink-900/40 p-3 text-left transition hover:border-rose-500/60 hover:bg-ink-900/60 disabled:opacity-50"
            onClick={quit}
            disabled={busy !== null}
          >
            <div className="mt-0.5 rounded-md bg-rose-500/10 p-1.5 text-rose-400">
              {busy === "quit" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LogOut className="size-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ink-100 light:text-ink-900">
                Quit and disconnect
              </div>
              <div className="mt-0.5 text-xs text-ink-400">
                Stops sshuttle and closes the app.
              </div>
            </div>
          </button>
        </div>

        <label className="mt-4 flex items-center gap-2 text-xs text-ink-400">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Remember my choice (don't ask again)
        </label>
      </div>
    </div>
  );
}
