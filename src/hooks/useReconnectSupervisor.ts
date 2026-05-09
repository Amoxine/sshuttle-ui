import { useEffect, useRef } from "react";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import toast from "react-hot-toast";

import { connectionService } from "@/services/connection";
import { sudoService } from "@/services/sudo";
import { useAppStore } from "@/store/appStore";
import type { ConnectionPhase, NetworkChangeReason } from "@/types";

/** Phases that mean the tunnel is up and pumping packets. */
const ACTIVE_PHASES: ConnectionPhase[] = [
  "starting",
  "connecting",
  "connected",
  "reconnecting",
];

/**
 * Auto-reconnect supervisor. Subscribes to connection-phase + network-change
 * signals and orchestrates retry attempts with exponential-ish backoff
 * (linear delay clamped to settings.reconnect_delay_seconds).
 *
 * Also surfaces phase transitions as native desktop notifications when
 * `settings.notifications` is enabled.
 *
 * Mount this hook exactly once at the app root (AppShell).
 */
export function useReconnectSupervisor(): void {
  const settings = useAppStore((s) => s.settings);
  const phase = useAppStore((s) => s.connection?.phase) ?? "idle";
  const message = useAppStore((s) => s.connection?.message ?? null);
  const profileName = useAppStore((s) => s.connection?.profile_name ?? null);
  const reconnect = useAppStore((s) => s.reconnect);
  const setReconnect = useAppStore((s) => s.setReconnect);

  const timerRef = useRef<number | null>(null);
  const lastNotifiedPhaseRef = useRef<ConnectionPhase | null>(null);
  const notifReadyRef = useRef<boolean>(false);

  // ---- One-time notification permission check.
  useEffect(() => {
    void (async () => {
      try {
        const granted = await isPermissionGranted();
        if (granted) {
          notifReadyRef.current = true;
          return;
        }
        const result = await requestPermission();
        notifReadyRef.current = result === "granted";
      } catch {
        notifReadyRef.current = false;
      }
    })();
  }, []);

  // ---- Phase change → notifications.
  useEffect(() => {
    if (!settings.notifications) return;
    if (lastNotifiedPhaseRef.current === phase) return;
    lastNotifiedPhaseRef.current = phase;

    const tag = profileName ? ` · ${profileName}` : "";
    let title: string | null = null;
    let body: string | undefined;

    switch (phase) {
      case "connected":
        title = `Connected${tag}`;
        body = "Tunnel is up.";
        break;
      case "failed":
        title = `Tunnel failed${tag}`;
        body = message ?? "sshuttle exited unexpectedly.";
        break;
      case "reconnecting":
        title = `Reconnecting${tag}`;
        body = message ?? "Re-establishing tunnel…";
        break;
      case "disconnected":
        if (reconnect.supervised) {
          // We'll be retrying; suppress the bare "Disconnected" toast
          // because a "Reconnecting" notification will follow.
          break;
        }
        title = `Disconnected${tag}`;
        break;
      default:
        break;
    }

    if (title && notifReadyRef.current) {
      try {
        sendNotification({ title, body });
      } catch {
        // permission revoked mid-session — silent fallback
      }
    }
  }, [phase, settings.notifications, profileName, message, reconnect.supervised]);

  // ---- Phase change → schedule reconnect (or reset attempts on connected).
  useEffect(() => {
    if (!reconnect.supervised) return;

    if (phase === "connected") {
      // Tunnel up. Reset attempts so the next outage starts fresh.
      if (
        reconnect.attempts !== 0 ||
        reconnect.scheduledAt !== null ||
        reconnect.status !== "idle"
      ) {
        setReconnect({
          attempts: 0,
          scheduledAt: null,
          status: "idle",
          reason: null,
        });
      }
      cancelTimer(timerRef);
      return;
    }

    if (
      phase === "failed" ||
      (phase === "disconnected" && reconnect.status !== "scheduled")
    ) {
      if (!settings.auto_reconnect || !reconnect.profileId) return;

      const max = Math.max(0, settings.max_reconnect_attempts | 0);
      const next = reconnect.attempts + 1;
      if (max > 0 && next > max) {
        setReconnect({
          status: "given_up",
          reason: `Auto-reconnect gave up after ${max} attempts`,
          scheduledAt: null,
        });
        if (settings.notifications && notifReadyRef.current) {
          try {
            sendNotification({
              title: "Auto-reconnect stopped",
              body: `Gave up after ${max} attempts.`,
            });
          } catch {
            /* noop */
          }
        }
        toast.error(`Auto-reconnect gave up after ${max} attempts`);
        return;
      }

      const delayMs = Math.max(1, settings.reconnect_delay_seconds) * 1000;
      const scheduledAt = Date.now() + delayMs;
      setReconnect({
        attempts: next,
        scheduledAt,
        status: "scheduled",
        reason: `Retry ${next}${max > 0 ? `/${max}` : ""} scheduled`,
      });

      cancelTimer(timerRef);
      timerRef.current = window.setTimeout(() => {
        void issueReconnect();
      }, delayMs);
    }
    // We deliberately only respond to phase transitions; the dependency
    // on attempts/profileId etc. is reflected via the closure capture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, reconnect.supervised]);

  // ---- Network change while supervised+connected → snap reconnect.
  useEffect(() => {
    const reason: NetworkChangeReason | null = reconnect.lastNetworkChange;
    if (!reason) return;

    // Always clear it so we don't loop on the same flag.
    setReconnect({ lastNetworkChange: null });

    if (!reconnect.supervised) return;
    if (!settings.reconnect_on_network_change) return;
    if (!reconnect.profileId) return;

    // Only snap if the tunnel is up — if it's already failed/disconnected
    // the regular phase handler will pick up after the delay anyway.
    if (!ACTIVE_PHASES.includes(phase)) return;

    toast(
      reason === "wake"
        ? "System resumed — refreshing tunnel"
        : "Network changed — refreshing tunnel",
      { icon: "🔄" },
    );

    cancelTimer(timerRef);
    timerRef.current = window.setTimeout(() => {
      void issueReconnect(true);
    }, 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconnect.lastNetworkChange]);

  // ---- Cleanup on unmount.
  useEffect(() => {
    return () => cancelTimer(timerRef);
  }, []);

  // ---- Reconnect issuance (closure over current store reads).
  async function issueReconnect(forceStopFirst = false): Promise<void> {
    const state = useAppStore.getState();
    const r = state.reconnect;
    if (!r.supervised || !r.profileId) return;

    setReconnect({ status: "attempting", scheduledAt: null });

    try {
      // If sudo was used, try to silently re-prime via keychain.
      if (r.sudo) {
        try {
          const status = await sudoService.status();
          if (status.supported && !status.cached && status.hasSavedPassword) {
            await sudoService.authenticate(null, false).catch(() => false);
          }
        } catch {
          /* best effort */
        }
      }

      if (forceStopFirst) {
        try {
          await connectionService.stop();
        } catch {
          /* ignore "not running" */
        }
      }

      await connectionService.startByProfile(r.profileId, r.sudo);
      await state.refreshConnection();
    } catch (e) {
      // The phase event will likely come through as `failed` shortly
      // after; the supervisor will then schedule another attempt. We
      // surface the error in the reconnect status for visibility.
      setReconnect({ reason: String(e), status: "idle" });
    }
  }
}

function cancelTimer(ref: React.MutableRefObject<number | null>): void {
  if (ref.current != null) {
    window.clearTimeout(ref.current);
    ref.current = null;
  }
}
