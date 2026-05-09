import { create } from "zustand";

import { connectionService } from "@/services/connection";
import { profilesService } from "@/services/profiles";
import { settingsService } from "@/services/settings";
import type {
  AppSettings,
  ConnectionState,
  LogLine,
  NetworkChangeReason,
  Profile,
  RuntimeEvent,
  SshuttleProcess,
} from "@/types";
import { DEFAULT_APP_SETTINGS } from "@/types";

interface NetStats {
  bytes_in: number;
  bytes_out: number;
  latency_ms: number | null;
}

export interface StatSample {
  /** Bytes/sec over the last sampler interval. */
  rate_in: number;
  rate_out: number;
  latency_ms: number | null;
  timestamp: string;
}

const MAX_SAMPLES = 120;

/**
 * Auto-reconnect supervisor state. Drives the user-facing "Reconnecting
 * (n/N)" hint and lets the supervisor hook know when to schedule another
 * attempt vs stand down.
 */
export interface ReconnectState {
  /** True between user clicking Connect and Disconnect. */
  supervised: boolean;
  /** Number of reconnect attempts we've spent on the current outage. */
  attempts: number;
  /** Profile id supervised, used when re-issuing start_by_profile. */
  profileId: string | null;
  /** Whether the original connect was made with sudo. */
  sudo: boolean;
  /** Wall-clock timestamp (ms) when the next attempt will be issued. */
  scheduledAt: number | null;
  /** Last status reported by the supervisor (for UI display). */
  status: "idle" | "scheduled" | "attempting" | "given_up";
  /** Optional reason for the most recent action. */
  reason: string | null;
  /** Last network-change reason observed; populated for one tick then cleared. */
  lastNetworkChange: NetworkChangeReason | null;
}

interface AppStore {
  profiles: Profile[];
  settings: AppSettings;
  connection: ConnectionState | null;
  liveLogs: LogLine[];
  stats: NetStats | null;
  /**
   * Rolling history of stats samples (bytes/sec) for the dashboard
   * sparkline. Older samples are dropped at MAX_SAMPLES.
   */
  statsHistory: StatSample[];
  reconnect: ReconnectState;
  paletteOpen: boolean;
  /**
   * sshuttle processes detected at startup that aren't managed by our
   * app (typically leftovers from a crashed previous session).
   * Cleared once the user dismisses the banner or successfully kills
   * them all.
   */
  orphans: SshuttleProcess[];
  /** Whether the user dismissed the orphans banner this session. */
  orphansDismissed: boolean;
  loadProfiles: () => Promise<void>;
  loadSettings: () => Promise<void>;
  saveSettings: (s: AppSettings) => Promise<void>;
  refreshConnection: () => Promise<void>;
  applyRuntimeEvent: (e: RuntimeEvent) => void;
  pushLiveLog: (line: LogLine) => void;
  clearLiveLogs: () => void;
  setLiveLogs: (lines: LogLine[]) => void;
  armReconnect: (profileId: string, sudo: boolean) => void;
  disarmReconnect: () => void;
  setReconnect: (patch: Partial<ReconnectState>) => void;
  setPaletteOpen: (open: boolean) => void;
  togglePalette: () => void;
  setOrphans: (procs: SshuttleProcess[]) => void;
  dismissOrphans: () => void;

  /** Soft kill-switch overlay after unexpected tunnel loss */
  killSwitchTripped: boolean;
  setKillSwitchTripped: (v: boolean) => void;

  changelogOpen: boolean;
  setChangelogOpen: (open: boolean) => void;
}

const INITIAL_RECONNECT: ReconnectState = {
  supervised: false,
  attempts: 0,
  profileId: null,
  sudo: false,
  scheduledAt: null,
  status: "idle",
  reason: null,
  lastNetworkChange: null,
};

const MAX_LIVE = 5_000;

export const useAppStore = create<AppStore>((set, get) => ({
  profiles: [],
  settings: DEFAULT_APP_SETTINGS,
  connection: null,
  liveLogs: [],
  stats: null,
  statsHistory: [],
  reconnect: INITIAL_RECONNECT,
  paletteOpen: false,
  orphans: [],
  orphansDismissed: false,

  killSwitchTripped: false,
  changelogOpen: false,

  loadProfiles: async () => {
    const list = await profilesService.list();
    set({ profiles: list });
  },

  loadSettings: async () => {
    const s = await settingsService.load();
    set({ settings: s });
  },

  saveSettings: async (s) => {
    const saved = await settingsService.save(s);
    set({ settings: saved });
  },

  refreshConnection: async () => {
    const connection = await connectionService.state();
    set({ connection });
  },

  applyRuntimeEvent: (e: RuntimeEvent) => {
    if (e.type === "stats") {
      set((state) => {
        const sample: StatSample = {
          rate_in: e.bytes_in,
          rate_out: e.bytes_out,
          latency_ms: e.latency_ms,
          timestamp: e.timestamp,
        };
        const next = [...state.statsHistory, sample];
        if (next.length > MAX_SAMPLES) {
          next.splice(0, next.length - MAX_SAMPLES);
        }
        return {
          stats: {
            bytes_in: e.bytes_in,
            bytes_out: e.bytes_out,
            latency_ms: e.latency_ms,
          },
          statsHistory: next,
        };
      });
      return;
    }
    if (e.type === "log") {
      get().pushLiveLog({
        level: e.level,
        line: e.line,
        timestamp: e.timestamp,
      });
      return;
    }
    if (e.type === "phase") {
      void get().refreshConnection();
      // Reset rolling stats when leaving the active set so the sparkline
      // doesn't carry stale ranges into the next session.
      if (
        e.phase === "idle" ||
        e.phase === "disconnected" ||
        e.phase === "failed"
      ) {
        set({ statsHistory: [], stats: null });
      }
      return;
    }
    if (e.type === "network_changed") {
      // Stamp the reason so the supervisor hook can react to it on the
      // next render. The supervisor clears it once consumed.
      set((state) => ({
        reconnect: {
          ...state.reconnect,
          lastNetworkChange: e.reason,
        },
      }));
      return;
    }
    if (e.type === "orphans_detected") {
      set({ orphans: e.processes, orphansDismissed: false });
    }
  },

  pushLiveLog: (line) => {
    set((state) => {
      const next = [...state.liveLogs, line];
      if (next.length > MAX_LIVE) next.splice(0, next.length - MAX_LIVE);
      return { liveLogs: next };
    });
  },

  clearLiveLogs: () => set({ liveLogs: [] }),
  setLiveLogs: (lines) => set({ liveLogs: lines }),

  armReconnect: (profileId, sudo) =>
    set({
      reconnect: {
        ...INITIAL_RECONNECT,
        supervised: true,
        profileId,
        sudo,
      },
    }),

  disarmReconnect: () =>
    set({
      reconnect: { ...INITIAL_RECONNECT },
    }),

  setReconnect: (patch) =>
    set((state) => ({
      reconnect: { ...state.reconnect, ...patch },
    })),

  setPaletteOpen: (open) => set({ paletteOpen: open }),
  togglePalette: () => set((state) => ({ paletteOpen: !state.paletteOpen })),

  setOrphans: (procs) => set({ orphans: procs, orphansDismissed: false }),
  dismissOrphans: () => set({ orphansDismissed: true }),

  setKillSwitchTripped: (v) => set({ killSwitchTripped: v }),
  setChangelogOpen: (open) => set({ changelogOpen: open }),
}));
