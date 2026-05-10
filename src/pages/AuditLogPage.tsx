import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ClipboardCopy, RefreshCw, Trash2 } from "lucide-react";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PolicyBadge } from "@/components/PolicyBadge";
import type { AuditEvent } from "@/bindings";
import { auditService } from "@/services/audit";
import { toastError } from "@/utils/toastError";

function formatTs(iso: string): string {
  const dot = iso.indexOf("T");
  if (dot < 0) return iso;
  return iso.slice(dot + 1).replace(/Z$/, "");
}

export function AuditLogPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const rows = await auditService.list(500);
      setEvents(rows);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const count = events.length;

  const rows = useMemo(() => [...events].reverse(), [events]);

  const exportClipboard = useCallback(async () => {
    try {
      const text = await auditService.export();
      await navigator.clipboard.writeText(text);
      toast.success("Audit log copied to clipboard");
    } catch (e) {
      toastError(e);
    }
  }, []);

  const clearLog = useCallback(async () => {
    try {
      await auditService.clear();
      toast.success("Audit log cleared");
      setClearOpen(false);
      await refresh();
    } catch (e) {
      toastError(e);
    }
  }, [refresh]);

  return (
    <div className="animate-fade-in space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100 light:text-ink-900">
            Audit log
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            Privileged and destructive actions ({count} events loaded).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-2"
            disabled={busy}
            onClick={() => void refresh()}
          >
            <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-2"
            disabled={busy}
            onClick={() => void exportClipboard()}
          >
            <ClipboardCopy className="size-4" />
            Export to clipboard
          </button>
          <button
            type="button"
            className="btn-danger inline-flex items-center gap-2"
            disabled={busy}
            onClick={() => setClearOpen(true)}
          >
            <Trash2 className="size-4" />
            Clear log…
          </button>
        </div>
      </header>

      <PolicyBadge />

      <section className="card overflow-hidden p-0">
        <div className="max-h-[min(70vh,720px)] overflow-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-ink-925/95 backdrop-blur light:bg-white/95">
              <tr className="border-b border-ink-800 light:border-ink-200">
                <th className="label px-3 py-2 font-medium text-ink-400">
                  Time
                </th>
                <th className="label px-3 py-2 font-medium text-ink-400">
                  Actor
                </th>
                <th className="label px-3 py-2 font-medium text-ink-400">
                  Action
                </th>
                <th className="label px-3 py-2 font-medium text-ink-400">
                  Result
                </th>
                <th className="label px-3 py-2 font-medium text-ink-400">
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => (
                <tr
                  key={`${e.ts}-${i}`}
                  className="border-b border-ink-850/80 align-top light:border-ink-100"
                >
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-ink-300">
                    {formatTs(e.ts)}
                  </td>
                  <td className="px-3 py-2 text-ink-200">{e.actor}</td>
                  <td className="px-3 py-2 font-mono text-xs text-brand-300">
                    {e.action}
                  </td>
                  <td className="px-3 py-2 text-ink-200">{e.result}</td>
                  <td className="max-w-xl px-3 py-2">
                    <pre className="whitespace-pre-wrap break-all font-mono text-xs text-ink-400">
                      {JSON.stringify(e.details, null, 2)}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-ink-500">
              No audit entries yet.
            </p>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={clearOpen}
        title="Clear audit log?"
        description="Removes all entries from the audit log file. This cannot be undone."
        confirmLabel="Clear audit log"
        variant="danger"
        onCancel={() => setClearOpen(false)}
        onConfirm={() => void clearLog()}
      />
    </div>
  );
}
