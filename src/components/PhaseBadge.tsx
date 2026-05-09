import { motion } from "framer-motion";

import { cn } from "@/utils/cn";
import type { ConnectionPhase } from "@/types";

const labels: Record<ConnectionPhase, string> = {
  idle: "Idle",
  starting: "Starting",
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  stopping: "Stopping",
  failed: "Failed",
  disconnected: "Disconnected",
};

const styles: Record<ConnectionPhase, string> = {
  idle: "bg-ink-700 text-ink-200",
  starting: "bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/40",
  connecting: "bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/40",
  connected: "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/40",
  reconnecting: "bg-amber-500/20 text-amber-200",
  stopping: "bg-ink-700 text-ink-200",
  failed: "bg-red-500/20 text-red-200 ring-1 ring-red-500/40",
  disconnected: "bg-ink-700 text-ink-300",
};

export function PhaseBadge({
  phase,
  compact,
}: {
  phase: ConnectionPhase;
  /** Smaller pill for tight layouts (e.g. footer status bar). */
  compact?: boolean;
}) {
  const pulse =
    !compact &&
    (phase === "starting" ||
      phase === "connecting" ||
      phase === "reconnecting" ||
      phase === "stopping");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full font-semibold uppercase tracking-wide",
        compact ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs",
        styles[phase],
      )}
    >
      {pulse && (
        <motion.span
          className="inline-block size-2 rounded-full bg-current"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
      )}
      {labels[phase]}
    </span>
  );
}
