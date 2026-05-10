import FocusTrap from "focus-trap-react";
import { useState } from "react";

import { commands } from "@/bindings";
import { useAppStore } from "@/store/appStore";
import { toastError } from "@/utils/toastError";

const MIT_LICENSE = `MIT License

Copyright (c) sshuttle-ui contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

export function EulaModal() {
  const eulaAccepted = useAppStore((s) => s.eulaAccepted);
  const setEulaAccepted = useAppStore((s) => s.setEulaAccepted);
  const [acceptedCheck, setAcceptedCheck] = useState(false);

  if (eulaAccepted) return null;

  const accept = () => {
    try {
      localStorage.setItem("sshuttle-ui-eula-accepted-v1", "true");
    } catch {
      /* ignore */
    }
    setEulaAccepted(true);
  };

  const quit = async () => {
    try {
      const r = await commands.quitApp();
      if (r.status === "error") toastError(r.error);
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="fixed inset-0 z-[105] flex items-center justify-center bg-black/70 p-6 backdrop-blur-md">
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
          aria-labelledby="eula-title"
          className="card flex max-h-[85vh] max-w-2xl flex-col border border-brand-500/30 shadow-2xl"
        >
          <h2
            id="eula-title"
            className="text-xl font-semibold text-ink-100 light:text-ink-900"
          >
            Software license
          </h2>
          <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto text-sm leading-relaxed text-ink-400">
            <p>
              This software is provided as-is; you may use, copy, and modify it
              under the terms below. The authors provide no warranty and are not
              liable for damages arising from use of the software.
            </p>
            <pre className="whitespace-pre-wrap font-mono text-xs text-ink-300 light:text-ink-600">
              {MIT_LICENSE}
            </pre>
          </div>
          <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-ink-300">
            <input
              type="checkbox"
              className="mt-1"
              checked={acceptedCheck}
              onChange={(e) => setAcceptedCheck(e.target.checked)}
            />
            <span>I accept the license terms</span>
          </label>
          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-ink-800 pt-4 light:border-ink-200">
            <button type="button" className="btn-secondary" onClick={() => void quit()}>
              Quit
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!acceptedCheck}
              onClick={accept}
            >
              Accept and continue
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
