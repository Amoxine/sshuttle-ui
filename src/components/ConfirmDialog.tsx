import FocusTrap from "focus-trap-react";
import { Loader2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/utils/cn";

export type ConfirmVariant = "danger" | "default";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Secondary explanation shown below the title */
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  /**
   * When true, confirm button stays disabled and shows a spinner.
   * Otherwise the dialog tracks loading while `onConfirm` runs.
   */
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  /** Merged onto the backdrop wrapper — use e.g. z-[110] above another modal */
  overlayClassName?: string;
}

/**
 * Modal confirmation for destructive or privileged actions. Prefer this over
 * `window.confirm` so messaging stays consistent with the rest of the shell.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  busy: busyExternal,
  onCancel,
  onConfirm,
  overlayClassName,
}: ConfirmDialogProps) {
  const [busyInternal, setBusyInternal] = useState(false);
  const busy = busyExternal ?? busyInternal;

  useEffect(() => {
    if (!open) setBusyInternal(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const confirmClass =
    variant === "danger"
      ? "btn-danger inline-flex min-w-[100px] items-center justify-center gap-2"
      : "btn-primary inline-flex min-w-[100px] items-center justify-center gap-2";

  const run = async () => {
    if (busyExternal !== undefined) {
      await Promise.resolve(onConfirm());
      return;
    }
    setBusyInternal(true);
    try {
      await Promise.resolve(onConfirm());
    } finally {
      setBusyInternal(false);
    }
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm",
        overlayClassName,
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <FocusTrap
        active={open}
        focusTrapOptions={{
          escapeDeactivates: false,
          allowOutsideClick: true,
          initialFocus: "#confirm-dialog-cancel-btn",
        }}
      >
        <div className="card relative w-full max-w-md border border-ink-700 shadow-2xl light:border-ink-200">
          <button
            type="button"
            aria-label={cancelLabel}
            className="absolute right-3 top-3 rounded-md p-1 text-ink-400 hover:text-ink-100 disabled:opacity-40"
            onClick={onCancel}
            disabled={busy}
          >
            <X className="size-4" />
          </button>
          <h2
            id="confirm-dialog-title"
            className="pr-10 text-lg font-semibold text-ink-100 light:text-ink-900"
          >
            {title}
          </h2>
          {description != null && (
            <div className="mt-3 text-sm leading-relaxed text-ink-400">
              {description}
            </div>
          )}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              id="confirm-dialog-cancel-btn"
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={onCancel}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className={confirmClass}
              disabled={busy}
              onClick={() => void run()}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {confirmLabel}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
