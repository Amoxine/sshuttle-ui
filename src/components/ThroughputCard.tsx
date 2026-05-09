import { useMemo } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from "recharts";
import { ArrowDown, ArrowUp, Gauge, Zap } from "lucide-react";

import { useAppStore } from "@/store/appStore";

function formatRate(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return "0 B/s";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let value = bps;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  const digits = value < 10 ? 2 : value < 100 ? 1 : 0;
  return `${value.toFixed(digits)} ${units[i]}`;
}

/**
 * Live network throughput display: peak/avg KPIs on the side, area chart
 * for the trailing window. Reads its data from `store.statsHistory`,
 * which is fed by the backend `RuntimeEvent::Stats` stream.
 */
export function ThroughputCard() {
  const history = useAppStore((s) => s.statsHistory);
  const stats = useAppStore((s) => s.stats);

  const summary = useMemo(() => {
    if (history.length === 0) {
      return { peakIn: 0, peakOut: 0, avgIn: 0, avgOut: 0 };
    }
    let peakIn = 0,
      peakOut = 0,
      sumIn = 0,
      sumOut = 0;
    for (const s of history) {
      if (s.rate_in > peakIn) peakIn = s.rate_in;
      if (s.rate_out > peakOut) peakOut = s.rate_out;
      sumIn += s.rate_in;
      sumOut += s.rate_out;
    }
    return {
      peakIn,
      peakOut,
      avgIn: sumIn / history.length,
      avgOut: sumOut / history.length,
    };
  }, [history]);

  const chartData = useMemo(
    () =>
      history.map((s, i) => ({
        i,
        rate_in: s.rate_in,
        rate_out: s.rate_out,
        latency_ms: s.latency_ms ?? null,
      })),
    [history],
  );

  const live = stats ?? { bytes_in: 0, bytes_out: 0, latency_ms: null };

  return (
    <section className="card space-y-4">
      <div className="flex items-center justify-between">
        <div className="label flex items-center gap-2">
          <Gauge className="size-4 text-brand-400" />
          Throughput
        </div>
        <span className="font-mono text-xs text-ink-500">
          last {history.length} samples
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="flex items-center gap-1 text-ink-500">
            <ArrowDown className="size-3" />
            Down
          </dt>
          <dd className="font-mono text-ink-100">
            {formatRate(live.bytes_in)}
          </dd>
          <dd className="text-[11px] text-ink-500">
            avg {formatRate(summary.avgIn)} · peak {formatRate(summary.peakIn)}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-ink-500">
            <ArrowUp className="size-3" />
            Up
          </dt>
          <dd className="font-mono text-ink-100">
            {formatRate(live.bytes_out)}
          </dd>
          <dd className="text-[11px] text-ink-500">
            avg {formatRate(summary.avgOut)} · peak {formatRate(summary.peakOut)}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-ink-500">
            <Zap className="size-3" />
            Latency
          </dt>
          <dd className="font-mono text-ink-100">
            {live.latency_ms != null ? `${live.latency_ms} ms` : "—"}
          </dd>
          <dd className="text-[11px] text-ink-500">probe 1.1.1.1</dd>
        </div>
      </div>

      <div className="h-28">
        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 2, right: 0, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="grad-in" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="grad-out" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <YAxis hide domain={[0, "dataMax + 1"]} />
              <Tooltip
                cursor={false}
                contentStyle={{
                  background: "rgba(15, 23, 42, 0.92)",
                  border: "1px solid rgba(148, 163, 184, 0.3)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "#e2e8f0",
                }}
                formatter={(value: number, name: string) => {
                  const label =
                    name === "rate_in"
                      ? "Down"
                      : name === "rate_out"
                        ? "Up"
                        : name;
                  return [formatRate(value), label];
                }}
                labelFormatter={() => ""}
              />
              <Area
                type="monotone"
                dataKey="rate_in"
                stroke="#3b82f6"
                strokeWidth={1.5}
                fill="url(#grad-in)"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="rate_out"
                stroke="#10b981"
                strokeWidth={1.5}
                fill="url(#grad-out)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-ink-500">
            Waiting for samples…
          </div>
        )}
      </div>
    </section>
  );
}
