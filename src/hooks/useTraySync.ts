import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { onTauri, safeInvoke } from "@/services/tauri";
import { useAppStore } from "@/store/appStore";
import type { ConnectionPhase, Profile } from "@/types";

interface TrayProfilePayload {
  id: string;
  name: string;
  favorite: boolean;
}

interface TrayStatePayload {
  phase: ConnectionPhase | "";
  activeProfileId: string | null;
  activeProfileName: string | null;
  bytesIn: number | null;
  bytesOut: number | null;
  latencyMs: number | null;
  profiles: TrayProfilePayload[];
}

/**
 * Push the current React app state to the system tray. The Rust side
 * rebuilds the menu, tooltip, and icon variant atomically.
 *
 * Stats are debounced because they fire every ~2s while connected and
 * we don't need a tray rebuild on every tick (the user only sees the
 * menu when they open it, but the icon swap and tooltip both benefit
 * from being fresh-ish).
 */
export function useTraySync(): void {
  const profiles = useAppStore((s) => s.profiles);
  const phase = useAppStore((s) => s.connection?.phase ?? "idle") as ConnectionPhase;
  const activeProfileId = useAppStore(
    (s) => s.connection?.profile_id ?? null,
  );
  const activeProfileName = useAppStore(
    (s) => s.connection?.profile_name ?? null,
  );
  const stats = useAppStore((s) => s.stats);
  const navigate = useNavigate();
  const navRef = useRef(navigate);
  navRef.current = navigate;

  // Build payload — memoized so identity-stable while inputs are stable.
  const payload = useMemo<TrayStatePayload>(
    () => ({
      phase: phase ?? "idle",
      activeProfileId,
      activeProfileName,
      bytesIn: stats?.bytes_in ?? null,
      bytesOut: stats?.bytes_out ?? null,
      latencyMs: stats?.latency_ms ?? null,
      profiles: profiles.map((p: Profile) => ({
        id: p.id,
        name: p.name,
        favorite: p.favorite,
      })),
    }),
    [phase, activeProfileId, activeProfileName, stats, profiles],
  );

  // Debounce when only stats changed: stats arrive every ~2s.
  const pendingRef = useRef<number | null>(null);
  const lastSentRef = useRef<TrayStatePayload | null>(null);

  useEffect(() => {
    const last = lastSentRef.current;
    const onlyStatsChanged =
      last !== null &&
      last.phase === payload.phase &&
      last.activeProfileId === payload.activeProfileId &&
      last.activeProfileName === payload.activeProfileName &&
      last.profiles.length === payload.profiles.length &&
      last.profiles.every(
        (p, i) =>
          p.id === payload.profiles[i].id &&
          p.name === payload.profiles[i].name &&
          p.favorite === payload.profiles[i].favorite,
      );

    const flush = () => {
      lastSentRef.current = payload;
      void safeInvoke<void>("update_tray", { state: payload });
    };

    if (onlyStatsChanged) {
      if (pendingRef.current != null) window.clearTimeout(pendingRef.current);
      pendingRef.current = window.setTimeout(flush, 1500);
    } else {
      if (pendingRef.current != null) {
        window.clearTimeout(pendingRef.current);
        pendingRef.current = null;
      }
      flush();
    }
  }, [payload]);

  // Listen for "Open settings" tray click.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void onTauri<void>("tray:settings", () => {
      navRef.current("/settings");
    }).then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);
}
