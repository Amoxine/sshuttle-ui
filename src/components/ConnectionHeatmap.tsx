import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

  return (
    <section className="card space-y-3">
      <div className="label">Recent tunnel time (UTC days)</div>
      {chartData.length === 0 ? (
        <p className="text-sm text-ink-500">
          No ended sessions recorded yet — connect once and disconnect cleanly
          to build history.
        </p>
      ) : (
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ left: 0, right: 8 }}>
              <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="#64748b" />
              <YAxis
                tick={{ fontSize: 10 }}
                stroke="#64748b"
                tickFormatter={(v) => `${v}h`}
              />
              <Tooltip
                formatter={(_value: number, _name: string, item) => {
                  const p = item?.payload as { raw: number; label: string };
                  return [fmt(p.raw), "connected"];
                }}
                labelFormatter={(_l, p) =>
                  (p?.[0]?.payload as { label?: string })?.label ?? ""
                }
              />
              <Bar dataKey="hours" fill="#34d399" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
