import { useEffect, useRef } from "react";
import toast from "react-hot-toast";

import { useConnectionStatus } from "@/hooks/useConnectionStatus";
import { useAppStore } from "@/store/appStore";

const CHECK_MS = 45_000;
const URL = "https://connectivitycheck.gstatic.com/generate_204";

/**
 * While connected, periodically probe for captive portals (hotel Wi‑Fi
 * login pages). If we don't get HTTP 204, show a toast — the tunnel may
 * need you to sign in on plain HTTP first.
 */
export function useCaptivePortalWatch(): void {
  const connected = useConnectionStatus().isConnected;
  const notifications = useAppStore((s) => s.settings.notifications);
  const warned = useRef(false);

  useEffect(() => {
    warned.current = false;
  }, [connected]);

  useEffect(() => {
    if (!connected || !notifications) return;

    const tick = async () => {
      try {
        const ac = new AbortController();
        const t = window.setTimeout(() => ac.abort(), 8_000);
        const res = await fetch(URL, { method: "GET", signal: ac.signal });
        clearTimeout(t);
        if (res.status === 204) {
          warned.current = false;
          return;
        }
        if (!warned.current) {
          warned.current = true;
          toast(
            "Network returned something other than the usual “all clear” check. You might be on a sign-in page (captive portal). Open a browser and log in, then reconnect.",
            { duration: 12_000, icon: "📶" },
          );
        }
      } catch {
        /* offline / blocked — ignore */
      }
    };

    const id = window.setInterval(() => void tick(), CHECK_MS);
    void tick();
    return () => clearInterval(id);
  }, [connected, notifications]);
}
