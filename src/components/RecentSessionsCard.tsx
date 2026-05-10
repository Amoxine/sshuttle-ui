import { useEffect, useState } from "react";
import { History } from "lucide-react";

import { connectionService } from "@/services/connection";
import { logsService } from "@/services/logs";
import { useAppStore } from "@/store/appStore";
import type { HistoryEntry } from "@/types";
import { toastError } from "@/utils/toastError";

/**
 * Last few completed sessions from SQLite — quick reconnect shortcuts.
 */
export function RecentSessionsCard() {
  const profiles = useAppStore((s) => s.profiles);
  const refreshConnection = useAppStore((s) => s.refreshConnection);
  const [rows, setRows] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    void logsService
      .history(8)
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  const entries = rows.filter((r) => r.profile_id && r.ended_at);

  const profileName = (id: string | null) => {
    if (!id) return "—";
    return profiles.find((p) => p.id === id)?.name ?? id.slice(0, 8);
  };

  const reconnect = async (profileId: string | null) => {
    if (!profileId) return;
    try {
      await connectionService.startByProfile(profileId, false);
      await refreshConnection();
    } catch (e) {
      toastError(e);
    }
  };

  if (entries.length === 0) return null;

  return (
    <section className="card space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-200">
        <History className="size-4 text-brand-400" />
        Recent sessions
      </h2>
      <ul className="space-y-2 text-sm">
        {entries.slice(0, 5).map((e) => (
          <li
            key={e.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-800 bg-ink-950/40 px-3 py-2 light:border-ink-200 light:bg-white"
          >
            <div className="min-w-0">
              <span className="font-medium text-ink-100 light:text-ink-900">
                {profileName(e.profile_id)}
              </span>
              <span className="ml-2 text-xs text-ink-500">
                {e.status} · {formatShort(e.started_at)}
              </span>
            </div>
            <button
              type="button"
              className="btn-secondary shrink-0 py-1 text-xs"
              onClick={() => void reconnect(e.profile_id)}
            >
              Connect
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-500">
        Uses connection history in your local database (not live sshuttle state).
      </p>
    </section>
  );
}

function formatShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
