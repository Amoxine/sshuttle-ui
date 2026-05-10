import { useEffect, useRef } from "react";
import toast from "react-hot-toast";

import { connectionService } from "@/services/connection";
import { useAppStore } from "@/store/appStore";

const CHECK_MS = 30_000;

/**
 * When Settings → idle_disconnect_minutes > 0 and the tunnel is connected,
 * disconnect after that many minutes without keyboard/mouse/scroll activity.
 */
export function useIdleDisconnect() {
  const phase = useAppStore((s) => s.connection?.phase ?? "idle");
  const minutes = useAppStore((s) => s.settings.idle_disconnect_minutes ?? 0);
  const disarmReconnect = useAppStore((s) => s.disarmReconnect);
  const refreshConnection = useAppStore((s) => s.refreshConnection);

  const lastActivityRef = useRef(Date.now());
  const firedForSessionRef = useRef(false);

  useEffect(() => {
    lastActivityRef.current = Date.now();
    firedForSessionRef.current = false;
  }, [phase, minutes]);

  useEffect(() => {
    if (phase !== "connected") {
      firedForSessionRef.current = false;
    }
  }, [phase]);

  useEffect(() => {
    if (minutes <= 0 || phase !== "connected") return;

    const bump = () => {
      lastActivityRef.current = Date.now();
    };

    const events = [
      "mousemove",
      "mousedown",
      "keydown",
      "click",
      "scroll",
      "wheel",
      "touchstart",
    ] as const;
    for (const ev of events) {
      window.addEventListener(ev, bump, { passive: true, capture: true });
    }

    const interval = window.setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs < minutes * 60_000) return;
      if (firedForSessionRef.current) return;
      firedForSessionRef.current = true;
      void (async () => {
        try {
          disarmReconnect();
          await connectionService.stop();
          toast.success(`Disconnected after ${minutes} min idle`, {
            id: "idle-disconnect",
          });
          await refreshConnection();
        } catch {
          /* toast upstream */
        }
      })();
    }, CHECK_MS);

    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, bump, true);
      }
      window.clearInterval(interval);
    };
  }, [phase, minutes, disarmReconnect, refreshConnection]);
}
