import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import toast from "react-hot-toast";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDownToLine,
  Download,
  Pause,
  Play,
  Search,
  Trash2,
} from "lucide-react";
import clsx from "clsx";

import { logsService } from "@/services/logs";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAppStore } from "@/store/appStore";
import type { LogLevel, LogLine } from "@/types";
import { toastError } from "@/utils/toastError";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "text-ink-500",
  info: "text-brand-300",
  warn: "text-amber-400",
  error: "text-red-400",
};

const ROW_HEIGHT = 22;
/** Pixels of slack from the bottom that still counts as "tailing". */
const TAIL_THRESHOLD = 24;

export function LogsPage() {
  const liveLogs = useAppStore((s) => s.liveLogs);
  const clearLiveLogs = useAppStore((s) => s.clearLiveLogs);
  const setLiveLogs = useAppStore((s) => s.setLiveLogs);

  const [filter, setFilter] = useState("");
  const [levelMin, setLevelMin] = useState<LogLevel>("debug");
  const [paused, setPaused] = useState(false);
  const [tail, setTail] = useState(true);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const refreshFromProcess = useCallback(async () => {
    try {
      const lines = await logsService.fetch(5_000);
      setLiveLogs(lines);
    } catch (e) {
      toastError(e);
    }
  }, [setLiveLogs]);

  // Initial hydrate on mount; thereafter the store is fed by the live
  // event subscription (`useBoot`) so polling is redundant.
  useEffect(() => {
    void refreshFromProcess();
  }, [refreshFromProcess]);

  // Snapshot of logs we render. When paused we freeze the buffer so the
  // user can scroll without it scrolling out from under them.
  const pausedSnapshotRef = useRef<LogLine[] | null>(null);
  useEffect(() => {
    if (paused) {
      pausedSnapshotRef.current = liveLogs;
    } else {
      pausedSnapshotRef.current = null;
    }
  }, [paused, liveLogs]);

  const sourceLines = paused ? pausedSnapshotRef.current ?? liveLogs : liveLogs;

  const minR = LEVEL_RANK[levelMin];
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q && levelMin === "debug") return sourceLines;
    return sourceLines.filter((l) => {
      if (LEVEL_RANK[l.level] < minR) return false;
      if (!q) return true;
      return (
        l.line.toLowerCase().includes(q) ||
        l.timestamp.toLowerCase().includes(q)
      );
    });
  }, [sourceLines, filter, minR, levelMin]);

  // Virtualization.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  // Auto-scroll to the latest row whenever the buffer grows AND we're
  // tailing. If the user scrolled up, we stop tailing automatically.
  const lastCountRef = useRef(0);
  useEffect(() => {
    if (!tail) return;
    const len = filtered.length;
    if (len === 0) return;
    if (len === lastCountRef.current) return;
    lastCountRef.current = len;
    rowVirtualizer.scrollToIndex(len - 1, { align: "end" });
  }, [filtered.length, tail, rowVirtualizer]);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom <= TAIL_THRESHOLD;
    setTail((current) => (current === atBottom ? current : atBottom));
  }, []);

  const exportText = async () => {
    try {
      const text = await logsService.export();
      await navigator.clipboard.writeText(text);
      toast.success("Exported logs copied");
    } catch (e) {
      toastError(e);
    }
  };

  const clearAll = async () => {
    try {
      await logsService.clear();
      clearLiveLogs();
      toast.success("Log buffer cleared");
      setClearConfirmOpen(false);
    } catch (e) {
      toastError(e);
    }
  };

  const counts = useMemo(() => {
    const out = { debug: 0, info: 0, warn: 0, error: 0 } as Record<LogLevel, number>;
    for (const l of liveLogs) out[l.level]++;
    return out;
  }, [liveLogs]);

  return (
    <div className="animate-fade-in space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100 light:text-ink-900">
            Logs
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            Live sshuttle stdout/stderr. Buffer: {liveLogs.length.toLocaleString()}{" "}
            line{liveLogs.length === 1 ? "" : "s"}, showing{" "}
            {filtered.length.toLocaleString()}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={clsx("btn-secondary", paused && "ring-2 ring-amber-400/50")}
            onClick={() => setPaused((v) => !v)}
            title={paused ? "Resume live updates" : "Pause buffer"}
          >
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            className={clsx(
              "btn-secondary",
              tail ? "ring-2 ring-brand-400/40" : "opacity-70",
            )}
            onClick={() => {
              setTail((v) => {
                const nxt = !v;
                if (nxt) {
                  // Re-engage tail: jump to bottom.
                  const len = filtered.length;
                  if (len > 0) rowVirtualizer.scrollToIndex(len - 1, { align: "end" });
                }
                return nxt;
              });
            }}
            title="Auto-scroll to newest log line"
          >
            <ArrowDownToLine className="size-4" />
            {tail ? "Tailing" : "Tail"}
          </button>
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
            onClick={() => setClearConfirmOpen(true)}
          >
            <Trash2 className="size-4" />
            Clear
          </button>
        </div>
      </header>

      <div className="card flex flex-wrap items-center gap-4">
        <label className="relative block flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
          <input
            className="input pl-9 font-mono text-sm"
            placeholder="filter lines (substring match)…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <span className="label">Level</span>
          {LEVELS.map((lvl) => (
            <button
              key={lvl}
              type="button"
              className={clsx(
                "rounded-full border px-3 py-1 text-xs uppercase tracking-wide",
                levelMin === lvl
                  ? "border-brand-500/60 bg-brand-500/15 text-brand-200"
                  : "border-ink-800 bg-ink-900 text-ink-400 hover:text-ink-200 light:border-ink-200 light:bg-white light:text-ink-600",
              )}
              onClick={() => setLevelMin(lvl)}
              title={`Show ${lvl} and above`}
            >
              <span className={LEVEL_COLORS[lvl]}>●</span>{" "}
              {lvl}{" "}
              <span className="text-ink-500">{counts[lvl]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="grid grid-cols-[120px_60px_1fr] gap-0 border-b border-ink-800 bg-ink-900/95 px-3 py-2 text-xs font-medium text-ink-500 light:border-ink-100 light:bg-white">
          <span>Time</span>
          <span>Lv</span>
          <span>Message</span>
        </div>
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="max-h-[calc(100vh-360px)] overflow-auto font-mono text-xs leading-relaxed"
          style={{ minHeight: 240 }}
        >
          {filtered.length === 0 ? (
            <p className="p-6 text-ink-500">No log lines match.</p>
          ) : (
            <div
              style={{
                height: rowVirtualizer.getTotalSize(),
                width: "100%",
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((vRow) => {
                const l = filtered[vRow.index];
                if (!l) return null;
                return (
                  <div
                    key={vRow.key}
                    data-index={vRow.index}
                    className="grid grid-cols-[120px_60px_1fr] items-baseline gap-0 border-b border-ink-900 px-3 hover:bg-ink-900/60 light:border-ink-100 light:hover:bg-ink-50"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      transform: `translateY(${vRow.start}px)`,
                      height: ROW_HEIGHT,
                    }}
                  >
                    <span className="truncate text-ink-500">
                      {formatTimestamp(l.timestamp)}
                    </span>
                    <span
                      className={clsx(
                        "truncate uppercase",
                        LEVEL_COLORS[l.level],
                      )}
                    >
                      {l.level}
                    </span>
                    <span className="truncate text-ink-200 light:text-ink-800">
                      {l.line}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={clearConfirmOpen}
        title="Clear log buffer?"
        description="Removes stored log lines from the app database. You cannot undo this."
        confirmLabel="Clear logs"
        variant="danger"
        onCancel={() => setClearConfirmOpen(false)}
        onConfirm={() => void clearAll()}
      />
    </div>
  );
}

function formatTimestamp(iso: string): string {
  // ISO-8601 with Z; render HH:MM:SS.mmm to keep rows compact and aligned.
  const dot = iso.indexOf("T");
  if (dot < 0) return iso;
  return iso.slice(dot + 1).replace(/Z$/, "");
}
