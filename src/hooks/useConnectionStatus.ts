import { useAppStore } from "@/store/appStore";
import type { ConnectionPhase } from "@/types";

const ACTIVE_PHASES: ConnectionPhase[] = [
  "starting",
  "connecting",
  "connected",
  "reconnecting",
];

export interface ConnectionStatusView {
  /** Current phase (defaults to `idle`). */
  phase: ConnectionPhase;
  /** Profile id of the currently-active tunnel, if any. */
  activeProfileId: string | null;
  /** Profile name of the currently-active tunnel, if any. */
  activeProfileName: string | null;
  /** Tunnel is in any active phase (starting → reconnecting). */
  isActive: boolean;
  /** Tunnel is fully up (`connected`). */
  isConnected: boolean;
  /** True if the supplied profile id is the active one. */
  isProfileActive: (profileId: string) => boolean;
}

/**
 * One-call connection-status read for components that need to render
 * "Connected" badges or guard click handlers. Subscribes only to the
 * phase + active profile id (so it doesn't re-render on every byte
 * count change).
 */
export function useConnectionStatus(): ConnectionStatusView {
  const phase = (useAppStore((s) => s.connection?.phase) ?? "idle") as ConnectionPhase;
  const activeProfileId = useAppStore((s) => s.connection?.profile_id ?? null);
  const activeProfileName = useAppStore((s) => s.connection?.profile_name ?? null);
  const isActive = ACTIVE_PHASES.includes(phase);
  const isConnected = phase === "connected";
  return {
    phase,
    activeProfileId,
    activeProfileName,
    isActive,
    isConnected,
    isProfileActive: (id: string) => isActive && activeProfileId === id,
  };
}
