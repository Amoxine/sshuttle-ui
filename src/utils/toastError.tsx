import toast from "react-hot-toast";

import { appNavigate } from "@/utils/appNavigate";
import { captureException } from "@/utils/sentry";

function stringify(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Error toast with an **Open logs** action (connection / backend failures).
 * Use plain `toast.error` for validation hints that are not log-worthy.
 */
export function toastError(error: unknown, headline?: string): void {
  const detail = stringify(error);
  const message = headline ? `${headline}: ${detail}` : detail;

  toast.custom(
    (t) => (
      <div className="max-w-md rounded-lg border border-red-500/40 bg-ink-900 px-4 py-3 shadow-lg light:border-red-300 light:bg-white">
        <p className="text-sm leading-snug text-red-100 light:text-red-900">
          {message}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs font-medium text-ink-400 hover:bg-ink-800 hover:text-ink-200 light:text-ink-600 light:hover:bg-ink-100"
            onClick={() => toast.dismiss(t.id)}
          >
            Dismiss
          </button>
          <button
            type="button"
            className="rounded-md bg-brand-500 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-400"
            onClick={() => {
              appNavigate("/logs");
              toast.dismiss(t.id);
            }}
          >
            Open logs
          </button>
        </div>
      </div>
    ),
    { duration: 8000 },
  );

  captureException(error, { headline });
}
