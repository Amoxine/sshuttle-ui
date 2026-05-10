import { useEffect, useMemo, useState } from "react";

import { logsService } from "@/services/logs";

function fmt(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

/** Calendar-ish grid of recent daily tunnel time from SQLite history. */
export function ConnectionHeatmap() {
  const [rows, setRows] = useState<{ day: string; seconds: number }[]>([]);

  useEffect(() => {
    void logsService.dailyTotals(56).then(setRows).catch(() => setRows([]));
  }, []);

  const chartData = rows.map((r) => ({
    day: r.day.slice(5),
    hours: r.seconds / 3600,
    label: r.day,
    raw: r.seconds,
  }));

  const maxHours = useMemo(
    () => chartData.reduce((m, r) => Math.max(m, r.hours), 0),
    [chartData],
  );

  return (
    <section className="card space-y-3">
      <div className="label">Recent tunnel time (UTC days)</div>
      {chartData.length === 0 ? (
        <p className="text-sm text-ink-500">
          No ended sessions recorded yet — connect once and disconnect cleanly
          to build history.
        </p>
      ) : (
        <div className="flex h-40 w-full items-end gap-0.5 px-1 pt-4">
          {chartData.map((d) => {
            const h = maxHours > 0 ? (d.hours / maxHours) * 100 : 0;
            return (
              <div
                key={d.label}
                className="group relative flex min-w-0 flex-1 flex-col justify-end"
                title={`${d.label}: ${fmt(d.raw)}`}
              >
                <div
                  className="min-h-[2px] rounded-t bg-emerald-400/90 transition-[height] light:bg-emerald-600"
                  style={{ height: `${Math.max(h, 2)}%` }}
                />
                <span className="mt-1 truncate text-center text-[9px] text-ink-500 opacity-0 transition-opacity group-hover:opacity-100 sm:text-[10px]">
                  {d.day}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
