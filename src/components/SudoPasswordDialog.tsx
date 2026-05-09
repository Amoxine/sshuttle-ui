import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ShieldAlert, X } from "lucide-react";

import { sudoService } from "@/services/sudo";

interface SudoPasswordDialogProps {
  open: boolean;
  /** Whether the keychain already has a saved password (just informational). */
  hasSavedPassword: boolean;
  onCancel: () => void;
  /** Called once sudo credentials are successfully cached. */
  onAuthenticated: () => void;
}

/**
 * Modal that prompts for the user's sudo password. Submits via the
 * `sudo_authenticate` Tauri command, which pre-primes sudo's credential
 * cache so the subsequent `sudo sshuttle …` spawn doesn't need a tty.
 */
export function SudoPasswordDialog({
  open,
  hasSavedPassword,
  onCancel,
  onAuthenticated,
}: SudoPasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [save, setSave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state every time the dialog opens.
  useEffect(() => {
    if (open) {
      setPassword("");
      setError(null);
      setSubmitting(false);
      // Slight delay so the field exists before we focus it.
      const t = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  // Esc to cancel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onCancel]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (submitting || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      const ok = await sudoService.authenticate(password, save);
      if (ok) {
        onAuthenticated();
      } else {
        setError("Authentication failed.");
      }
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, ""));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => {
            if (!submitting) onCancel();
          }}
        >
          <motion.form
            initial={{ y: 8, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 8, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            className="w-full max-w-md rounded-xl border border-ink-700 bg-ink-900 p-6 shadow-2xl light:border-ink-200 light:bg-white"
          >
            <header className="mb-4 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-amber-500/15 p-2 ring-1 ring-amber-500/30">
                  <ShieldAlert className="size-5 text-amber-300" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-ink-100 light:text-ink-900">
                    Administrator password required
                  </h2>
                  <p className="mt-1 text-xs text-ink-400">
                    sshuttle needs root to install firewall/routing rules.
                    Your password is sent to <code className="font-mono text-brand-300">sudo&nbsp;-S&nbsp;-v</code>{" "}
                    over stdin and never written to disk unless you opt in below.
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Cancel"
                className="btn-ghost p-1"
                onClick={onCancel}
                disabled={submitting}
              >
                <X className="size-4" />
              </button>
            </header>

            <label className="mb-3 block space-y-1">
              <span className="label">Password</span>
              <input
                ref={inputRef}
                type="password"
                autoComplete="current-password"
                className="input font-mono text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
            </label>

            <label className="mb-4 flex items-center gap-2 text-sm text-ink-300">
              <input
                type="checkbox"
                checked={save}
                onChange={(e) => setSave(e.target.checked)}
                disabled={submitting}
                className="rounded border-ink-600 text-brand-500"
              />
              Remember in keychain
              {hasSavedPassword && (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-500/30">
                  saved entry will be replaced
                </span>
              )}
            </label>

            {error && (
              <div
                role="alert"
                className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
              >
                {error}
              </div>
            )}

            <footer className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={onCancel}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary inline-flex min-w-[140px] items-center justify-center gap-2"
                disabled={submitting || !password}
              >
                {submitting && <Loader2 className="size-4 animate-spin" />}
                Authenticate
              </button>
            </footer>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
