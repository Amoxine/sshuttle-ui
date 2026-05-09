import { create } from "zustand";

import { connectionService } from "@/services/connection";
import { profilesService } from "@/services/profiles";
import { settingsService } from "@/services/settings";
import type {
  AppSettings,
  ConnectionState,
  LogLine,
  Profile,
  RuntimeEvent,
} from "@/types";
import { DEFAULT_APP_SETTINGS } from "@/types";

interface NetStats {
  bytes_in: number;
  bytes_out: number;
  latency_ms: number | null;
}

interface AppStore {
  profiles: Profile[];
  settings: AppSettings;
  connection: ConnectionState | null;
  liveLogs: LogLine[];
  stats: NetStats | null;
  loadProfiles: () => Promise<void>;
  loadSettings: () => Promise<void>;
  saveSettings: (s: AppSettings) => Promise<void>;
  refreshConnection: () => Promise<void>;
  applyRuntimeEvent: (e: RuntimeEvent) => void;
  pushLiveLog: (line: LogLine) => void;
  clearLiveLogs: () => void;
  setLiveLogs: (lines: LogLine[]) => void;
}

const MAX_LIVE = 5_000;

export const useAppStore = create<AppStore>((set, get) => ({
  profiles: [],
  settings: DEFAULT_APP_SETTINGS,
  connection: null,
  liveLogs: [],
  stats: null,

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
      set({
        stats: {
          bytes_in: e.bytes_in,
          bytes_out: e.bytes_out,
          latency_ms: e.latency_ms,
        },
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
}));
