import FocusTrap from "focus-trap-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { useAppStore } from "@/store/appStore";

export const ConsentKeys = {
  sentry: "sshuttle-ui-sentry-consent",
  eula: "sshuttle-ui-eula-accepted-v1",
} as const;

export function ConsentModal() {
  const eulaAccepted = useAppStore((s) => s.eulaAccepted);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const sentry = localStorage.getItem(ConsentKeys.sentry);
      const eulaOk = localStorage.getItem(ConsentKeys.eula) === "true";
      setVisible(sentry === null && eulaOk && eulaAccepted);
    } catch {
      setVisible(false);
    }
  }, [eulaAccepted]);

  if (!visible) return null;

  const choose = (allow: boolean) => {
    try {
      localStorage.setItem(ConsentKeys.sentry, allow ? "true" : "false");
    } catch {
      /* ignore */
    }
    setVisible(false);
    if (allow) {
      toast.success("Thanks — reports will start after the next restart.");
    }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
      <FocusTrap
        active
        focusTrapOptions={{
          escapeDeactivates: false,
          allowOutsideClick: false,
          initialFocus: false,
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="consent-title"
          className="card max-w-lg border border-brand-500/30 shadow-2xl"
        >
          <h2
            id="consent-title"
            className="text-xl font-semibold text-ink-100 light:text-ink-900"
          >
            Help improve sshuttle UI
          </h2>
          <div className="mt-3 max-h-[50vh] space-y-3 overflow-y-auto text-sm leading-relaxed text-ink-400">
            <p>
              This app can send anonymized crash reports to help diagnose issues.
              No IP addresses, hostnames, passwords, or SSH contents are
              included.
            </p>
            <p className="text-ink-300 light:text-ink-600">What may be sent:</p>
            <ul className="list-inside list-disc space-y-1 text-ink-400">
              <li>Stack traces from crashes</li>
              <li>App version and build</li>
              <li>Operating system name and version</li>
            </ul>
          </div>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => choose(false)}
            >
              Don&apos;t send
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => choose(true)}
            >
              Send crash reports
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
