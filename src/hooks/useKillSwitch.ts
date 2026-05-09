import { useEffect, useRef } from "react";

import { useAppStore } from "@/store/appStore";
import type { ConnectionPhase } from "@/types";

/**
 * When Settings → kill switch is enabled, trip a fullscreen guard after an
 * *unexpected* tunnel loss (sshuttle died or vanished without going through
 * our graceful `Disconnecting…` path). This does **not** block machine-wide
 * traffic — it blocks interaction inside the app until you reconnect or turn
 * the switch off (honest “soft” kill switch).
 */
export function useKillSwitchGuard(): void {
  const phase = useAppStore((s) => s.connection?.phase);
  const message = useAppStore((s) => s.connection?.message);
  const killSwitch = useAppStore((s) => s.settings.kill_switch);
  const setTripped = useAppStore((s) => s.setKillSwitchTripped);

  const prev = useRef<ConnectionPhase | undefined>(undefined);

  useEffect(() => {
    if (!killSwitch) {
      setTripped(false);
      prev.current = phase;
      return;
    }

    const p = phase ?? "idle";
    const was = prev.current;

    if (p === "failed") {
      setTripped(true);
    } else if (
      was === "connected" &&
      p === "disconnected" &&
      !(message ?? "").toLowerCase().includes("disconnecting")
    ) {
      setTripped(true);
    }

    prev.current = p;
  }, [phase, message, killSwitch, setTripped]);
}
