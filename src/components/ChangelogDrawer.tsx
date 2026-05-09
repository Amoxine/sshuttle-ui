import { BookOpen, X } from "lucide-react";
import { useEffect, useState } from "react";

import { useAppStore } from "@/store/appStore";

export function ChangelogDrawer() {
  const open = useAppStore((s) => s.changelogOpen);
  const setOpen = useAppStore((s) => s.setChangelogOpen);
  const [text, setText] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void fetch("/CHANGELOG.md")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      .then(setText)
      .catch(() =>
        setErr("CHANGELOG.md not found — run from the built app bundle."),
      );
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-black/50">
      <button
        type="button"
        className="h-full flex-1 cursor-default"
        aria-label="Close changelog backdrop"
        onClick={() => setOpen(false)}
      />
      <aside className="flex h-full w-full max-w-lg flex-col border-l border-ink-700 bg-ink-950 shadow-2xl light:border-ink-200 light:bg-white">
        <div className="flex items-center gap-2 border-b border-ink-800 px-4 py-3 light:border-ink-200">
          <BookOpen className="size-5 text-brand-400" />
          <h2 className="flex-1 text-sm font-semibold text-ink-100 light:text-ink-900">
            What’s new
          </h2>
          <button
            type="button"
            className="rounded p-1 hover:bg-ink-900 light:hover:bg-ink-100"
            onClick={() => setOpen(false)}
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto px-4 py-3">
          {err ? (
            <p className="text-sm text-amber-400">{err}</p>
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-xs text-ink-300 light:text-ink-700">
              {text || "Loading…"}
            </pre>
          )}
        </div>
      </aside>
    </div>
  );
}
