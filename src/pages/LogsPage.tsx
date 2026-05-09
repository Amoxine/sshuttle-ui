import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Download, Trash2 } from "lucide-react";

import { logsService } from "@/services/logs";
import { useAppStore } from "@/store/appStore";
import type { LogLevel } from "@/types";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function LogsPage() {
  const liveLogs = useAppStore((s) => s.liveLogs);
  const clearLiveLogs = useAppStore((s) => s.clearLiveLogs);
  const setLiveLogs = useAppStore((s) => s.setLiveLogs);

  const [filter, setFilter] = useState("");
  const [levelMin, setLevelMin] = useState<LogLevel>("debug");

  const refreshFromProcess = useCallback(async () => {
    try {
      const lines = await logsService.fetch(5_000);
      setLiveLogs(lines);
    } catch (e) {
      toast.error(String(e));
    }
  }, [setLiveLogs]);

  useEffect(() => {
    void refreshFromProcess();
    const id = window.setInterval(() => void refreshFromProcess(), 3_000);
    return () => window.clearInterval(id);
  }, [refreshFromProcess]);

  const minR = LEVEL_RANK[levelMin];

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return liveLogs.filter((l) => {
      if (LEVEL_RANK[l.level] < minR) return false;
      if (!q) return true;
      return (
        l.line.toLowerCase().includes(q) ||
        l.timestamp.toLowerCase().includes(q)
      );
    });
  }, [liveLogs, filter, minR]);

  const exportText = async () => {
    try {
      const text = await logsService.export();
      await navigator.clipboard.writeText(text);
      toast.success("Exported logs copied");
    } catch (e) {
      toast.error(String(e));
    }
  };

  const clearAll = async () => {
    try {
      await logsService.clear();
      clearLiveLogs();
      toast.success("Log buffer cleared");
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <div className="animate-fade-in space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100 light:text-ink-900">
            Logs
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            Live sshuttle stdout/stderr mirrored into this buffer (also saved in
            memory server-side).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void refreshFromProcess()}
          >
            Refresh
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void exportText()}
          >
            <Download className="size-4" />
            Export
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={() => void clearAll()}
          >
            <Trash2 className="size-4" />
            Clear
          </button>
        </div>
      </header>

      <div className="card flex flex-wrap gap-4">
        <label className="block flex-1 min-w-[200px] space-y-1">
          <span className="label">Search</span>
          <input
            className="input font-mono text-sm"
            placeholder="filter lines…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="label">Minimum level</span>
          <select
            className="input"
            value={levelMin}
            onChange={(e) => setLevelMin(e.target.value as LogLevel)}
          >
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
        </label>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="max-h-[calc(100vh-320px)] overflow-auto font-mono text-xs leading-relaxed">
          {filtered.length === 0 ? (
            <p className="p-6 text-ink-500">No log lines yet.</p>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 bg-ink-900/95 text-ink-500 light:bg-white">
                <tr>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Lv</th>
                  <th className="px-3 py-2 font-medium">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800 light:divide-ink-100">
                {filtered.map((l, i) => (
                  <tr key={`${l.timestamp}-${i}`} className="hover:bg-ink-900/40">
                    <td className="whitespace-nowrap px-3 py-1.5 text-ink-500">
                      {l.timestamp}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-brand-400">
                      {l.level}
                    </td>
                    <td className="px-3 py-1.5 text-ink-200 light:text-ink-800">
                      {l.line}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
