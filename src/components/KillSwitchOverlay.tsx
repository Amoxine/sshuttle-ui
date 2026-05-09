import { ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

import { connectionService } from "@/services/connection";
import { useAppStore } from "@/store/appStore";

/**
 * Soft kill switch — blocks *this app's* chrome until you reconnect or
 * disable the setting. Does not firewall the OS (that needs root hooks).
 */
export function KillSwitchOverlay() {
  const tripped = useAppStore((s) => s.killSwitchTripped);
  const setTripped = useAppStore((s) => s.setKillSwitchTripped);
  const settings = useAppStore((s) => s.settings);
  const saveSettings = useAppStore((s) => s.saveSettings);
  const profileId = useAppStore((s) => s.connection?.profile_id);
  const refreshConnection = useAppStore((s) => s.refreshConnection);

  if (!tripped) return null;

  const reconnect = async () => {
    if (!profileId) return;
    try {
      await connectionService.startByProfile(profileId, false);
      setTripped(false);
      await refreshConnection();
    } catch {
      /* toast upstream */
    }
  };

  const disableGuard = async () => {
    await saveSettings({ ...settings, kill_switch: false });
    setTripped(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6 backdrop-blur-md">
      <div className="card max-w-md space-y-4 border border-red-500/40 bg-ink-900 shadow-2xl light:bg-white">
        <div className="flex items-start gap-3">
          <ShieldAlert className="size-8 shrink-0 text-red-400" />
          <div>
            <h2 className="text-lg font-semibold text-ink-100 light:text-ink-900">
              Tunnel dropped — kill switch tripped
            </h2>
            <p className="mt-2 text-sm text-ink-400">
              You enabled “Kill switch” in Settings. The sshuttle process
              stopped without a normal disconnect. This overlay reminds you
              so you don’t browse blindly — it does{" "}
              <strong>not</strong> firewall your whole computer.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={!profileId}
            onClick={() => void reconnect()}
          >
            Reconnect last profile
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void disableGuard()}
          >
            Turn off kill switch
          </button>
          <Link to="/settings" className="btn-ghost">
            Open settings
          </Link>
        </div>
      </div>
    </div>
  );
}
