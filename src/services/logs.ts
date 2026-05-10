import { commands } from "@/bindings";
import type { DailyTotal, HistoryEntry, LogLine } from "@/types";
import { unwrap } from "./tauri";

export const logsService = {
  fetch: (limit = 1_000): Promise<LogLine[]> =>
    commands.fetchLogs(limit) as Promise<LogLine[]>,
  clear: async (): Promise<void> => {
    await unwrap(commands.clearLogs());
  },
  export: (): Promise<string> => unwrap(commands.exportLogs()),
  history: (limit = 100): Promise<HistoryEntry[]> =>
    unwrap(commands.listHistory(limit)) as Promise<HistoryEntry[]>,
  dailyTotals: (days = 30): Promise<DailyTotal[]> =>
    unwrap(commands.historyDailyTotals(days)) as Promise<DailyTotal[]>,
};
