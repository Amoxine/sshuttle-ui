import FocusTrap from "focus-trap-react";
import { useEffect } from "react";

import { useAppStore } from "@/store/appStore";

const GROUPS: { title: string; rows: { keys: string; action: string }[] }[] = [
  {
    title: "General",
    rows: [
      { keys: "⌘K / Ctrl+K", action: "Open command palette" },
      { keys: "Esc", action: "Close dialogs and palette" },
      { keys: "?", action: "Toggle this shortcuts panel" },
    ],
  },
  {
    title: "Navigation",
    rows: [
      { keys: "/audit", action: "Open audit log (deep link)" },
      { keys: "/about", action: "Open about (deep link)" },
    ],
  },
];

export function ShortcutsOverlay() {
  const open = useAppStore((s) => s.shortcutsOpen);
  const setOpen = useAppStore((s) => s.setShortcutsOpen);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
      <FocusTrap
        active
        focusTrapOptions={{
          escapeDeactivates: false,
          allowOutsideClick: true,
          initialFocus: false,
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-title"
          className="card max-w-lg border border-ink-700 shadow-2xl light:border-ink-200"
        >
          <h2
            id="shortcuts-title"
            className="text-lg font-semibold text-ink-100 light:text-ink-900"
          >
            Keyboard shortcuts
          </h2>
          <div className="mt-4 max-h-[60vh] space-y-6 overflow-y-auto">
            {GROUPS.map((g) => (
              <div key={g.title}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
                  {g.title}
                </h3>
                <ul className="space-y-2">
                  {g.rows.map((r) => (
                    <li
                      key={r.action}
                      className="flex items-start justify-between gap-4 text-sm"
                    >
                      <span className="text-ink-300 light:text-ink-600">{r.action}</span>
                      <kbd className="shrink-0 rounded border border-ink-700 bg-ink-800 px-2 py-0.5 font-mono text-xs text-ink-200 light:border-ink-200 light:bg-ink-100 light:text-ink-800">
                        {r.keys}
                      </kbd>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
