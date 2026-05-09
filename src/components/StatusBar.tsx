import { Activity, Cable } from "lucide-react";
import { Link } from "react-router-dom";

import { PhaseBadge } from "@/components/PhaseBadge";
import { formatBytes } from "@/utils/format";
import { useAppStore } from "@/store/appStore";

/** Bottom strip: always-visible phase + tunnel + live throughput snapshot. */
export function StatusBar() {
  const connection = useAppStore((s) => s.connection);
  const stats = useAppStore((s) => s.stats);

  const phase = connection?.phase ?? "idle";
  const label =
    connection?.profile_name ??
    (connection?.profile_id ? "Profile" : "No tunnel");

  return (
    <footer className="flex shrink-0 items-center gap-4 border-t border-ink-800 bg-ink-950/95 px-4 py-2 text-xs text-ink-400 light:border-ink-200 light:bg-white">
      <div className="flex min-w-0 items-center gap-2">
        <Cable className="size-3.5 shrink-0 text-brand-400" />
        <span className="truncate font-medium text-ink-200 light:text-ink-800">
          {label}
        </span>
        <PhaseBadge phase={phase} compact />
      </div>
      <div className="hidden items-center gap-3 sm:flex">
        <span className="inline-flex items-center gap-1">
          <Activity className="size-3 text-emerald-400" />
          ↓ {stats ? `${formatBytes(stats.bytes_in)}/s` : "—"}
        </span>
        <span className="inline-flex items-center gap-1">
          <Activity className="size-3 rotate-180 text-sky-400" />
          ↑ {stats ? `${formatBytes(stats.bytes_out)}/s` : "—"}
        </span>
        {stats?.latency_ms != null && (
          <span className="text-ink-500">
            RTT {Math.round(stats.latency_ms)} ms
          </span>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Link
          to="/logs"
          className="rounded px-2 py-1 text-ink-500 hover:bg-ink-900 hover:text-ink-200 light:hover:bg-ink-100 light:hover:text-ink-900"
        >
          Logs
        </Link>
        <Link
          to="/settings"
          className="rounded px-2 py-1 text-ink-500 hover:bg-ink-900 hover:text-ink-200 light:hover:bg-ink-100 light:hover:text-ink-900"
        >
          Settings
        </Link>
      </div>
    </footer>
  );
}
