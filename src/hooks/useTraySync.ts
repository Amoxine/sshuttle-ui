import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { onTauri, safeInvoke } from "@/services/tauri";
import { useAppStore } from "@/store/appStore";
import type { ConnectionPhase } from "@/types";

const PHASE_LABELS: Record<ConnectionPhase, string> = {
  idle: "sshuttle UI · idle",
  starting: "sshuttle UI · starting",
  connecting: "sshuttle UI · connecting",
  connected: "sshuttle UI · connected",
  reconnecting: "sshuttle UI · reconnecting",
  stopping: "sshuttle UI · stopping",
  failed: "sshuttle UI · failed",
  disconnected: "sshuttle UI · disconnected",
};

/**
 * Keeps the system tray menu and tooltip in sync with the React app
 * state. Mounted at the AppShell level so it's active everywhere.
 *
 * - Rebuilds the tray menu when the profile list changes (so favorite
 *   quick-connect entries reflect reality).
 * - Updates the tray tooltip when the phase or active profile changes.
 * - Forwards `tray:settings` clicks to the in-app navigator.
 */
export function useTraySync(): void {
  const profiles = useAppStore((s) => s.profiles);
  const phase = useAppStore((s) => s.connection?.phase ?? "idle") as ConnectionPhase;
  const profileName = useAppStore((s) => s.connection?.profile_name ?? null);
  const navigate = useNavigate();
  const navRef = useRef(navigate);
  navRef.current = navigate;

  // Refresh menu on profile-list change.
  useEffect(() => {
    void safeInvoke<void>("refresh_tray_menu");
  }, [profiles]);

  // Update tooltip on phase / profile change.
  useEffect(() => {
    const base = PHASE_LABELS[phase] ?? PHASE_LABELS.idle;
    const text = profileName ? `${base} · ${profileName}` : base;
    void safeInvoke<void>("set_tray_status", { text });
  }, [phase, profileName]);

  // Listen for "Open settings" tray click.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void onTauri<void>("tray:settings", () => {
      navRef.current("/settings");
    }).then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);
}
