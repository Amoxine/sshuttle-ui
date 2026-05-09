import { useEffect, useMemo, useRef, useState } from "react";
import { Eraser, Pause, Play, Terminal } from "lucide-react";

import { logsService } from "@/services/logs";
import { useAppStore } from "@/store/appStore";
import type { LogLevel } from "@/types";
import { cn } from "@/utils/cn";

interface LiveLogsPanelProps {
  /** Maximum lines rendered in the scroll viewport. Older lines are clipped. */
  maxLines?: number;
  /** Pixel height of the scroll area. */
  height?: number;
}

const LEVEL_STYLE: Record<LogLevel, string> = {
  debug: "text-ink-500",
  info: "text-ink-200",
  warn: "text-amber-300",
  error: "text-red-300",
};

/**
 * Tail-style log viewport that mirrors the global runtime event stream
 * (populated by `useBoot`). Auto-scrolls to bottom unless the user has
 * scrolled away — then the "Resume" pill appears.
 */
export function LiveLogsPanel({ maxLines = 250, height = 240 }: LiveLogsPanelProps) {
  const liveLogs = useAppStore((s) => s.liveLogs);
  const setLiveLogs = useAppStore((s) => s.setLiveLogs);
  const clearLiveLogs = useAppStore((s) => s.clearLiveLogs);

  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Hydrate from the backend ring buffer once if we mount with no events.
  // Useful when the dashboard is reopened during an active tunnel.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (liveLogs.length === 0) {
      logsService
        .fetch(maxLines)
        .then((lines) => {
          if (lines.length) setLiveLogs(lines);
        })
        .catch(() => {});
    }
  }, [liveLogs.length, maxLines, setLiveLogs]);

  const visible = useMemo(() => {
    if (liveLogs.length <= maxLines) return liveLogs;
    return liveLogs.slice(liveLogs.length - maxLines);
  }, [liveLogs, maxLines]);

  // Auto-scroll-to-bottom when new lines arrive and user is "stuck" at the
  // end of the log (i.e. they haven't scrolled up to inspect history).
  useEffect(() => {
    if (!autoScroll) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [visible, autoScroll]);

  const onScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    setAutoScroll(distanceFromBottom < 24);
  };

  return (
    <section className="card space-y-3">
      <header className="flex items-center justify-between">
        <div className="label flex items-center gap-2">
          <Terminal className="size-4" />
          Live output
          <span className="text-[10px] font-normal normal-case text-ink-500">
            {visible.length} line{visible.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!autoScroll && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full bg-brand-500/15 px-3 py-1 text-xs font-medium text-brand-300 ring-1 ring-brand-500/30 hover:bg-brand-500/25"
              onClick={() => {
                setAutoScroll(true);
                const el = containerRef.current;
                if (el) el.scrollTop = el.scrollHeight;
              }}
            >
              <Play className="size-3" />
              Resume tail
            </button>
          )}
          {autoScroll && visible.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-ink-500">
              <Pause className="size-3" />
              tailing
            </span>
          )}
          <button
            type="button"
            aria-label="Clear local view"
            className="btn-ghost px-2 py-1 text-xs"
            onClick={() => clearLiveLogs()}
          >
            <Eraser className="size-3.5" />
          </button>
        </div>
      </header>

      <div
        ref={containerRef}
        onScroll={onScroll}
        style={{ height }}
        className="overflow-auto rounded-lg border border-ink-800 bg-ink-950 p-3 font-mono text-[11px] leading-relaxed light:border-ink-200 light:bg-white"
      >
        {visible.length === 0 ? (
          <p className="select-none text-ink-500">
            Waiting for output… hit Connect above to start the tunnel.
          </p>
        ) : (
          visible.map((l, i) => (
            <div
              key={`${l.timestamp}-${i}`}
              className={cn("whitespace-pre-wrap break-words", LEVEL_STYLE[l.level])}
            >
              <span className="mr-2 select-none text-ink-600">
                {formatTime(l.timestamp)}
              </span>
              {l.line}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function formatTime(iso: string): string {
  // Render compact HH:mm:ss when possible; fall back to the raw value.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
