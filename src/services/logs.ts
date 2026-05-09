import type { HistoryEntry, LogLine } from "@/types";
import { invoke } from "./tauri";

export const logsService = {
  fetch: (limit = 1_000) => invoke<LogLine[]>("fetch_logs", { limit }),
  clear: () => invoke<void>("clear_logs"),
  export: () => invoke<string>("export_logs"),
  history: (limit = 100) => invoke<HistoryEntry[]>("list_history", { limit }),
};
