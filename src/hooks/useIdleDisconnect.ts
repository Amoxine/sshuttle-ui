import React, { useEffect, useRef } from "react";
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
  const warnShownRef = useRef(false);
  const bumpRef = useRef<() => void>(() => {});

  useEffect(() => {
    lastActivityRef.current = Date.now();
    firedForSessionRef.current = false;
    warnShownRef.current = false;
    toast.dismiss("idle-warn");
  }, [phase, minutes]);

  useEffect(() => {
    if (phase !== "connected") {
      firedForSessionRef.current = false;
      warnShownRef.current = false;
      toast.dismiss("idle-warn");
    }
  }, [phase]);

  useEffect(() => {
    if (minutes <= 0 || phase !== "connected") return;

    const bump = () => {
      lastActivityRef.current = Date.now();
      warnShownRef.current = false;
      toast.dismiss("idle-warn");
    };
    bumpRef.current = bump;

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
      const threshold = minutes * 60_000;
      const idleMs = Date.now() - lastActivityRef.current;
      const msLeft = threshold - idleMs;

      if (msLeft <= 60_000 && msLeft > 0) {
        if (!warnShownRef.current) {
          warnShownRef.current = true;
          toast.custom(
            (t) =>
              React.createElement(
                "div",
                {
                  className:
                    "max-w-sm rounded-lg border border-amber-500/40 bg-ink-900 px-4 py-3 shadow-lg light:border-amber-300 light:bg-white",
                },
                React.createElement(
                  "p",
                  {
                    className: "text-sm text-ink-100 light:text-ink-900",
                  },
                  "Idle timeout: disconnecting in less than a minute unless activity resumes.",
                ),
                React.createElement(
                  "div",
                  { className: "mt-3 flex justify-end" },
                  React.createElement(
                    "button",
                    {
                      type: "button",
                      className: "btn-primary text-xs",
                      onClick: () => {
                        bumpRef.current();
                        toast.dismiss(t.id);
                      },
                    },
                    "Stay connected",
                  ),
                ),
              ),
            { id: "idle-warn", duration: Infinity },
          );
        }
      } else if (msLeft > 60_000) {
        warnShownRef.current = false;
        toast.dismiss("idle-warn");
      }

      if (idleMs < threshold) return;
      if (firedForSessionRef.current) return;
      firedForSessionRef.current = true;
      toast.dismiss("idle-warn");
      void (async () => {
        try {
          disarmReconnect();
          await connectionService.stop();
          toast.success(`Disconnected after ${minutes} min idle`, {
            id: "idle-disconnect",
          });
          await refreshConnection();
        } catch {
          firedForSessionRef.current = false;
        }
      })();
    }, CHECK_MS);

    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, bump, true);
      }
      window.clearInterval(interval);
      toast.dismiss("idle-warn");
    };
  }, [phase, minutes, disarmReconnect, refreshConnection]);
}
