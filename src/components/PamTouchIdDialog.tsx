import FocusTrap from "focus-trap-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { KeyRound, Loader2, X } from "lucide-react";

interface PamTouchIdDialogProps {
  open: boolean;
  enabling: boolean;
  onCancel: () => void;
  onSubmitPassword: (password: string) => Promise<void>;
}

/**
 * Asks for the macOS administrator password so the backend can run sudo to
 * edit `/etc/pam.d/sudo`. Shown when Touch ID setup/remove needs credentials.
 */
export function PamTouchIdDialog({
  open,
  enabling,
  onCancel,
  onSubmitPassword,
}: PamTouchIdDialogProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPassword("");
      setError(null);
      setSubmitting(false);
      const t = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(t);
    }
  }, [open]);

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

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (submitting || !password.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmitPassword(password);
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, ""));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <FocusTrap
          active={open}
          focusTrapOptions={{
            escapeDeactivates: false,
            allowOutsideClick: true,
            initialFocus: false,
          }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <motion.form
              initial={{ y: 8, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 8, opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              onSubmit={submit}
              className="w-full max-w-md rounded-xl border border-ink-700 bg-ink-900 p-6 shadow-2xl light:border-ink-200 light:bg-white"
            >
              <header className="mb-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-brand-500/15 p-2 ring-1 ring-brand-500/30">
                    <KeyRound className="size-5 text-brand-300" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-ink-100 light:text-ink-900">
                      {enabling
                        ? "Enable Touch ID for sudo"
                        : "Remove Touch ID from sudo"}
                    </h2>
                    <p className="mt-1 text-xs text-ink-400">
                      Your administrator password is sent to{" "}
                      <code className="font-mono text-brand-300">
                        sudo&nbsp;-S&nbsp;-v
                      </code>{" "}
                      so we can update{" "}
                      <code className="font-mono text-brand-300">
                        /etc/pam.d/sudo
                      </code>
                      .
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

              <label className="mb-4 block space-y-1">
                <span className="label">Administrator password</span>
                <input
                  ref={inputRef}
                  type="password"
                  autoComplete="current-password"
                  className="input font-mono text-sm"
                  value={password}
                  onChange={(ev) => setPassword(ev.target.value)}
                  disabled={submitting}
                />
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
                  disabled={submitting || !password.trim()}
                >
                  {submitting && <Loader2 className="size-4 animate-spin" />}
                  Continue
                </button>
              </footer>
            </motion.form>
          </motion.div>
        </FocusTrap>
      )}
    </AnimatePresence>
  );
}
