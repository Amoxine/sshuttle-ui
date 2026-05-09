import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Fingerprint, Skull } from "lucide-react";

import { settingsService } from "@/services/settings";
import { systemService } from "@/services/system";
import { sudoService, type SudoStatus, type TouchIdSudoStatus } from "@/services/sudo";
import { PamTouchIdDialog } from "@/components/PamTouchIdDialog";
import { useAppStore } from "@/store/appStore";
import type { AppSettings, SshuttleProcess } from "@/types";
import { DEFAULT_APP_SETTINGS } from "@/types";
import { toastError } from "@/utils/toastError";

export function SettingsPage() {
  const profiles = useAppStore((s) => s.profiles);
  const storeSettings = useAppStore((s) => s.settings);
  const saveSettings = useAppStore((s) => s.saveSettings);
  const loadSettings = useAppStore((s) => s.loadSettings);

  const setOrphans = useAppStore((s) => s.setOrphans);
  const dismissOrphans = useAppStore((s) => s.dismissOrphans);
  const [draft, setDraft] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [dataDir, setDataDir] = useState<string>("");
  const [sudoStatus, setSudoStatus] = useState<SudoStatus | null>(null);
  const [orphanProcs, setOrphanProcs] = useState<SshuttleProcess[]>([]);
  const [touchIdStatus, setTouchIdStatus] = useState<TouchIdSudoStatus | null>(
    null,
  );
  const [touchIdBusy, setTouchIdBusy] = useState(false);
  const [pamDialogOpen, setPamDialogOpen] = useState(false);
  const [pamDialogEnabling, setPamDialogEnabling] = useState(true);
  const [killing, setKilling] = useState(false);

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

  const refreshTouchIdStatus = async () => {
    try {
      setTouchIdStatus(await sudoService.touchIdStatus());
    } catch {
      setTouchIdStatus(null);
    }
  };

  useEffect(() => {
    void refreshSudoStatus();
    void refreshTouchIdStatus();
  }, []);

  const refreshOrphans = async () => {
    try {
      const list = await systemService.listOrphanSshuttle();
      setOrphanProcs(list);
    } catch {
      setOrphanProcs([]);
    }
  };

  useEffect(() => {
    void refreshOrphans();
  }, []);

  const forceKillAll = async () => {
    if (
      !confirm(
        "This sends TERM then KILL to every sshuttle process on this machine, including any started outside this app. Continue?",
      )
    ) {
      return;
    }
    setKilling(true);
    try {
      const useSaved = !!sudoStatus?.hasSavedPassword;
      const n = await systemService.forceKillAllSshuttle(useSaved);
      toast.success(
        n === 1
          ? "Killed 1 sshuttle process"
          : n === 0
            ? "Nothing to kill"
            : `Killed ${n} sshuttle processes`,
      );
      await refreshOrphans();
      const remaining = await systemService
        .listOrphanSshuttle()
        .catch(() => []);
      setOrphans(remaining);
      if (remaining.length === 0) dismissOrphans();
    } catch (e) {
      toastError(e);
    } finally {
      setKilling(false);
    }
  };

  const forgetSudo = async () => {
    try {
      await sudoService.forget();
      toast.success("Saved sudo password removed");
      await refreshSudoStatus();
    } catch (e) {
      toastError(e);
    }
  };

  const applyPamChange = async (
    enabled: boolean,
    password: string | null,
  ): Promise<void> => {
    await sudoService.touchIdSetEnabled(enabled, password);
    toast.success(
      enabled
        ? "Touch ID for sudo is enabled (pam_tid.so added)."
        : "Touch ID line removed from /etc/pam.d/sudo.",
    );
    await refreshTouchIdStatus();
    await refreshSudoStatus();
  };

  const requestPamChange = async (enabled: boolean) => {
    setTouchIdBusy(true);
    try {
      await applyPamChange(enabled, null);
    } catch (e) {
      const m = String(e);
      if (/password|Administrator|sudo is not cached/i.test(m)) {
        setPamDialogEnabling(enabled);
        setPamDialogOpen(true);
      } else {
        toastError(e);
      }
    } finally {
      setTouchIdBusy(false);
    }
  };

  const submitPamPassword = async (password: string) => {
    setTouchIdBusy(true);
    try {
      await applyPamChange(pamDialogEnabling, password);
      setPamDialogOpen(false);
    } finally {
      setTouchIdBusy(false);
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
      toastError(e);
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
          Auto reconnect after the tunnel drops
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="label">Reconnect delay (seconds)</span>
            <input
              type="number"
              min={1}
              className="input"
              disabled={!draft.auto_reconnect}
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
          <label className="block space-y-1">
            <span className="label">Max reconnect attempts (0 = unlimited)</span>
            <input
              type="number"
              min={0}
              className="input"
              disabled={!draft.auto_reconnect}
              value={draft.max_reconnect_attempts}
              onChange={(e) =>
                patch({
                  max_reconnect_attempts: Math.max(
                    0,
                    Number.parseInt(e.target.value, 10) || 0,
                  ),
                })
              }
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-300">
          <input
            type="checkbox"
            disabled={!draft.auto_reconnect}
            checked={draft.reconnect_on_network_change}
            onChange={(e) =>
              patch({ reconnect_on_network_change: e.target.checked })
            }
          />
          Reconnect immediately on sleep/wake or default-route change
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-300">
          <input
            type="checkbox"
            checked={draft.kill_switch}
            onChange={(e) => patch({ kill_switch: e.target.checked })}
          />
          Kill switch — fullscreen guard if the tunnel drops unexpectedly
          (blocks this app until reconnect; does not OS-firewall traffic)
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
        <div className="space-y-2">
          <span className="label">When I close the window</span>
          <div className="grid gap-2 sm:grid-cols-3">
            <label
              className={`cursor-pointer rounded-md border p-3 text-sm transition ${
                draft.close_action_chosen === false
                  ? "border-brand-500/60 bg-brand-500/10"
                  : "border-ink-700 bg-ink-900/40 hover:border-ink-600"
              }`}
            >
              <input
                type="radio"
                className="sr-only"
                name="close-behaviour"
                checked={draft.close_action_chosen === false}
                onChange={() =>
                  patch({ close_action_chosen: false })
                }
              />
              <div className="font-medium text-ink-100 light:text-ink-900">
                Ask me
              </div>
              <div className="mt-1 text-xs text-ink-400">
                Show a dialog each time the close button is clicked.
              </div>
            </label>
            <label
              className={`cursor-pointer rounded-md border p-3 text-sm transition ${
                draft.close_action_chosen && draft.minimize_to_tray
                  ? "border-brand-500/60 bg-brand-500/10"
                  : "border-ink-700 bg-ink-900/40 hover:border-ink-600"
              }`}
            >
              <input
                type="radio"
                className="sr-only"
                name="close-behaviour"
                checked={
                  draft.close_action_chosen && draft.minimize_to_tray
                }
                onChange={() =>
                  patch({
                    close_action_chosen: true,
                    minimize_to_tray: true,
                  })
                }
              />
              <div className="font-medium text-ink-100 light:text-ink-900">
                Minimize to tray
              </div>
              <div className="mt-1 text-xs text-ink-400">
                Hide the window; keep the tunnel running in the background.
              </div>
            </label>
            <label
              className={`cursor-pointer rounded-md border p-3 text-sm transition ${
                draft.close_action_chosen && !draft.minimize_to_tray
                  ? "border-brand-500/60 bg-brand-500/10"
                  : "border-ink-700 bg-ink-900/40 hover:border-ink-600"
              }`}
            >
              <input
                type="radio"
                className="sr-only"
                name="close-behaviour"
                checked={
                  draft.close_action_chosen && !draft.minimize_to_tray
                }
                onChange={() =>
                  patch({
                    close_action_chosen: true,
                    minimize_to_tray: false,
                  })
                }
              />
              <div className="font-medium text-ink-100 light:text-ink-900">
                Quit and disconnect
              </div>
              <div className="mt-1 text-xs text-ink-400">
                Stop sshuttle and exit the app.
              </div>
            </label>
          </div>
          <p className="text-xs text-ink-400">
            Tray ▸ Quit and ⌘Q always exit cleanly regardless of this setting.
          </p>
        </div>
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

      <section className="card space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-200">
          <Fingerprint className="size-4 text-brand-400" />
          Touch ID for sudo (macOS)
        </h2>
        {!touchIdStatus?.supported ? (
          <p className="text-sm text-ink-400">
            Lets macOS show your fingerprint when{" "}
            <code className="font-mono text-brand-300">sudo</code> runs (after a
            small change to{" "}
            <code className="font-mono text-brand-300">/etc/pam.d/sudo</code>).
            This section only appears on macOS builds.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-ink-800 px-3 py-1 text-xs text-ink-300 light:bg-ink-100 light:text-ink-700">
                pam file readable:{" "}
                {touchIdStatus.fileReadable ? "yes" : "no"}
              </span>
              <span className="rounded-full bg-ink-800 px-3 py-1 text-xs text-ink-300 light:bg-ink-100 light:text-ink-700">
                Touch ID line:{" "}
                {!touchIdStatus.fileReadable
                  ? "unknown"
                  : touchIdStatus.enabled
                    ? "present"
                    : "absent"}
              </span>
            </div>
            {!touchIdStatus.fileReadable && (
              <p className="text-sm text-amber-300/90">
                Could not read{" "}
                <code className="font-mono text-brand-300">
                  {touchIdStatus.filePath || "/etc/pam.d/sudo"}
                </code>
                . Open the app from a normal user session with standard macOS
                permissions.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={
                  touchIdBusy ||
                  !touchIdStatus.fileReadable ||
                  touchIdStatus.enabled
                }
                onClick={() => void requestPamChange(true)}
              >
                Enable Touch ID for sudo
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={
                  touchIdBusy ||
                  !touchIdStatus.fileReadable ||
                  !touchIdStatus.enabled
                }
                onClick={() => void requestPamChange(false)}
              >
                Remove Touch ID line
              </button>
            </div>
            <p className="text-xs leading-relaxed text-ink-500">
              Adds{" "}
              <code className="font-mono text-brand-300">
                auth sufficient pam_tid.so
              </code>{" "}
              before the first{" "}
              <code className="font-mono text-brand-300">auth</code> line in{" "}
              <code className="font-mono text-brand-300">/etc/pam.d/sudo</code>.
              Uses your administrator password (or cached sudo / saved password)
              once so the file can be updated. After this, macOS may prompt for
              Touch ID when you run{" "}
              <code className="font-mono text-brand-300">sudo -v</code> — same as
              when connecting from this app.
            </p>
          </>
        )}
      </section>

      <PamTouchIdDialog
        open={pamDialogOpen}
        enabling={pamDialogEnabling}
        onCancel={() => setPamDialogOpen(false)}
        onSubmitPassword={submitPamPassword}
      />
      <section className="card space-y-3 border border-rose-500/30">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-rose-200 light:text-rose-700">
          <Skull className="size-4" />
          Danger zone
        </h2>
        <p className="text-sm text-ink-400">
          If a previous run of the app crashed, sshuttle may still be
          tunnelling in the background. This panic button finds every
          sshuttle process on this machine and terminates it (TERM, then
          KILL after a short grace period). Routes and firewall rules
          installed by sshuttle should be cleaned up by sshuttle's own
          shutdown handler.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-full bg-ink-800 px-3 py-1 text-xs text-ink-300 light:bg-ink-100 light:text-ink-700">
            Detected: <strong>{orphanProcs.length}</strong>
          </span>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void refreshOrphans()}
          >
            Re-scan
          </button>
          <button
            type="button"
            className="btn-danger inline-flex items-center gap-2"
            disabled={killing}
            onClick={() => void forceKillAll()}
          >
            <Skull className="size-4" />
            {killing ? "Killing…" : "Force kill all sshuttle"}
          </button>
        </div>
        {orphanProcs.length > 0 && (
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md bg-ink-900/40 p-2 font-mono text-xs text-ink-300 light:bg-ink-100 light:text-ink-700">
            {orphanProcs.map((p) => (
              <li key={p.pid} className="truncate">
                <span className="text-ink-500">[{p.pid}]</span>{" "}
                {p.elevated && (
                  <span className="rounded bg-amber-500/20 px-1 text-[10px] uppercase tracking-wide text-amber-300">
                    sudo
                  </span>
                )}{" "}
                {p.command}
              </li>
            ))}
          </ul>
        )}
      </section>

      <button type="button" className="btn-primary" onClick={() => void save()}>
        Save settings
      </button>
    </div>
  );
}
