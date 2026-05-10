import { useMemo } from "react";
import { ArrowDown, ArrowUp, Gauge, Zap } from "lucide-react";

import { Sparkline, type SparklinePoint } from "@/components/Sparkline";
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

  const sparkData = useMemo<SparklinePoint[]>(
    () => history.map((s) => ({ in: s.rate_in, out: s.rate_out })),
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
        <Sparkline
          data={sparkData}
          height={112}
          ariaLabel={`Throughput last ${history.length} seconds`}
        />
      </div>
    </section>
  );
}
