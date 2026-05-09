import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { settingsService } from "@/services/settings";
import { sudoService, type SudoStatus } from "@/services/sudo";
import { useAppStore } from "@/store/appStore";
import type { AppSettings } from "@/types";
import { DEFAULT_APP_SETTINGS } from "@/types";

export function SettingsPage() {
  const profiles = useAppStore((s) => s.profiles);
  const storeSettings = useAppStore((s) => s.settings);
  const saveSettings = useAppStore((s) => s.saveSettings);
  const loadSettings = useAppStore((s) => s.loadSettings);

  const [draft, setDraft] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [dataDir, setDataDir] = useState<string>("");
  const [sudoStatus, setSudoStatus] = useState<SudoStatus | null>(null);

  useEffect(() => {
    setDraft(storeSettings);
  }, [storeSettings]);

  useEffect(() => {
    void settingsService
      .dataDir()
      .then(setDataDir)
      .catch(() => setDataDir(""));
  }, []);

  const refreshSudoStatus = async () => {
    try {
      setSudoStatus(await sudoService.status());
    } catch {
      setSudoStatus(null);
    }
  };

  useEffect(() => {
    void refreshSudoStatus();
  }, []);

  const forgetSudo = async () => {
    try {
      await sudoService.forget();
      toast.success("Saved sudo password removed");
      await refreshSudoStatus();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const patch = (partial: Partial<AppSettings>) => {
    setDraft((d) => ({ ...d, ...partial }));
  };

  const save = async () => {
    try {
      await saveSettings(draft);
      toast.success("Settings saved");
      await loadSettings();
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <div className="animate-fade-in space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-100 light:text-ink-900">
          Settings
        </h1>
        <p className="mt-1 text-sm text-ink-400">
          Persistence lives next to the SQLite database under your user data
          directory.
        </p>
        {dataDir && (
          <p className="mt-2 font-mono text-xs text-ink-500 break-all">
            {dataDir}
          </p>
        )}
      </header>

      <section className="card space-y-6">
        <h2 className="text-sm font-semibold text-ink-200">Appearance</h2>
        <label className="block space-y-1">
          <span className="label">Theme</span>
          <select
            className="input max-w-xs"
            value={draft.theme}
            onChange={(e) => patch({ theme: e.target.value })}
          >
            <option value="system">System</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
      </section>

      <section className="card space-y-4">
        <h2 className="text-sm font-semibold text-ink-200">Connection behavior</h2>
        <label className="flex items-center gap-2 text-sm text-ink-300">
          <input
            type="checkbox"
            checked={draft.auto_reconnect}
            onChange={(e) => patch({ auto_reconnect: e.target.checked })}
          />
          Auto reconnect (requires backend reconnect loop — preferences stored)
        </label>
        <label className="block space-y-1">
          <span className="label">Reconnect delay (seconds)</span>
          <input
            type="number"
            min={1}
            className="input max-w-xs"
            value={draft.reconnect_delay_seconds}
            onChange={(e) =>
              patch({
                reconnect_delay_seconds: Math.max(
                  1,
                  Number.parseInt(e.target.value, 10) || 5,
                ),
              })
            }
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-300">
          <input
            type="checkbox"
            checked={draft.kill_switch}
            onChange={(e) => patch({ kill_switch: e.target.checked })}
          />
          Kill switch preference (enforcement pending platform hooks)
        </label>
      </section>

      <section className="card space-y-4">
        <h2 className="text-sm font-semibold text-ink-200">Application</h2>
        <label className="flex items-center gap-2 text-sm text-ink-300">
          <input
            type="checkbox"
            checked={draft.launch_at_login}
            onChange={(e) => patch({ launch_at_login: e.target.checked })}
          />
          Launch at login (uses OS autostart integration where available)
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-300">
          <input
            type="checkbox"
            checked={draft.start_minimized}
            onChange={(e) => patch({ start_minimized: e.target.checked })}
          />
          Start minimized
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-300">
          <input
            type="checkbox"
            checked={draft.minimize_to_tray}
            onChange={(e) => patch({ minimize_to_tray: e.target.checked })}
          />
          Minimize to tray
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-300">
          <input
            type="checkbox"
            checked={draft.notifications}
            onChange={(e) => patch({ notifications: e.target.checked })}
          />
          Desktop notifications
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-300">
          <input
            type="checkbox"
            checked={draft.debug_logging}
            onChange={(e) => patch({ debug_logging: e.target.checked })}
          />
          Verbose app logging
        </label>
        <label className="block space-y-1">
          <span className="label">Log buffer lines</span>
          <input
            type="number"
            min={100}
            className="input max-w-xs"
            value={draft.log_buffer_lines}
            onChange={(e) =>
              patch({
                log_buffer_lines: Math.max(
                  100,
                  Number.parseInt(e.target.value, 10) || 5000,
                ),
              })
            }
          />
        </label>
      </section>

      <section className="card space-y-4">
        <h2 className="text-sm font-semibold text-ink-200">Defaults</h2>
        <label className="block space-y-1">
          <span className="label">Default profile for tray quick-connect</span>
          <select
            className="input max-w-lg"
            value={draft.default_profile_id ?? ""}
            onChange={(e) =>
              patch({
                default_profile_id: e.target.value || null,
              })
            }
          >
            <option value="">None</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {sudoStatus?.supported && (
        <section className="card space-y-3">
          <h2 className="text-sm font-semibold text-ink-200">Privileges</h2>
          <p className="text-sm text-ink-400">
            sshuttle is launched via{" "}
            <code className="font-mono text-brand-300">sudo</code>. The Connect
            dialog can pre-authenticate sudo (and optionally remember the
            password in your keychain) so the tunnel never blocks on a
            terminal prompt.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full bg-ink-800 px-3 py-1 text-xs text-ink-300 light:bg-ink-100 light:text-ink-700">
              Cached: {sudoStatus.cached ? "yes" : "no"}
            </span>
            <span className="rounded-full bg-ink-800 px-3 py-1 text-xs text-ink-300 light:bg-ink-100 light:text-ink-700">
              Saved password:{" "}
              {sudoStatus.hasSavedPassword ? "yes" : "no"}
            </span>
            <button
              type="button"
              className="btn-secondary"
              disabled={!sudoStatus.hasSavedPassword && !sudoStatus.cached}
              onClick={() => void forgetSudo()}
            >
              Forget password &amp; clear cache
            </button>
          </div>
        </section>
      )}

      <button type="button" className="btn-primary" onClick={() => void save()}>
        Save settings
      </button>
    </div>
  );
}
