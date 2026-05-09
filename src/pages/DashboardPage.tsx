import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Loader2,
  Power,
  RefreshCw,
  ShieldOff,
  Terminal,
  Zap,
} from "lucide-react";

import { LiveLogsPanel } from "@/components/LiveLogsPanel";
import { PhaseBadge } from "@/components/PhaseBadge";
import { SudoPasswordDialog } from "@/components/SudoPasswordDialog";
import { connectionService } from "@/services/connection";
import { sudoService } from "@/services/sudo";
import { formatBytes } from "@/utils/format";
import { useAppStore } from "@/store/appStore";

export function DashboardPage() {
  const profiles = useAppStore((s) => s.profiles);
  const settings = useAppStore((s) => s.settings);
  const connection = useAppStore((s) => s.connection);
  const stats = useAppStore((s) => s.stats);
  const refreshConnection = useAppStore((s) => s.refreshConnection);

  const [profileId, setProfileId] = useState<string>("");

  useEffect(() => {
    const def = settings.default_profile_id;
    if (def && profiles.some((p) => p.id === def)) {
      setProfileId(def);
    } else if (profiles.length && !profileId) {
      setProfileId(profiles[0].id);
    }
  }, [settings.default_profile_id, profiles, profileId]);

  // Sudo dialog state. We only show the dialog when sudo is requested AND
  // pre-auth fails (no cache + no usable saved password).
  const [sudoDialogOpen, setSudoDialogOpen] = useState(false);
  const [sudoHasSaved, setSudoHasSaved] = useState(false);
  const [sudo, setSudo] = useState(false);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => profiles.find((p) => p.id === profileId),
    [profiles, profileId],
  );

  const phase = connection?.phase ?? "idle";
  const active =
    phase === "starting" ||
    phase === "connecting" ||
    phase === "connected" ||
    phase === "reconnecting";

  const launchTunnel = async () => {
    await connectionService.startByProfile(profileId, sudo);
    toast.success("Tunnel starting…");
    await refreshConnection();
  };

  const connect = async () => {
    if (!profileId) {
      toast.error("Select a profile or create one under Profiles.");
      return;
    }
    setBusy(true);
    try {
      // When sudo is requested, make sure sudo's credential cache is primed
      // before we try to spawn sshuttle. Otherwise sshuttle dies with the
      // confusing `fw: fatal` error because sudo had no tty.
      if (sudo) {
        const status = await sudoService.status();
        if (!status.supported) {
          // Native Windows etc. — just attempt the spawn and let the OS deal.
        } else if (!status.cached) {
          // First, see if a keychain-saved password works silently.
          let primed = false;
          if (status.hasSavedPassword) {
            try {
              primed = await sudoService.authenticate(null, false);
            } catch {
              primed = false;
            }
          }
          if (!primed) {
            // Need to ask the user. The dialog completes the flow.
            setSudoHasSaved(status.hasSavedPassword);
            setSudoDialogOpen(true);
            setBusy(false);
            return;
          }
        }
      }

      await launchTunnel();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onSudoAuthenticated = async () => {
    setSudoDialogOpen(false);
    setBusy(true);
    try {
      await launchTunnel();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await connectionService.stop();
      toast.success("Disconnected");
      await refreshConnection();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  const reconnect = async () => {
    setBusy(true);
    try {
      await connectionService.restart();
      toast.success("Reconnecting…");
      await refreshConnection();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100 light:text-ink-900">
            Dashboard
          </h1>
          <p className="mt-1 max-w-xl text-sm text-ink-400 light:text-ink-600">
            Route traffic through sshuttle with profile-based tunnels. Status
            updates stream live from the sshuttle process.
          </p>
        </div>
        <PhaseBadge phase={phase} />
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2 space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <label className="label block w-full sm:w-auto">Profile</label>
            <select
              className="input max-w-md flex-1 font-mono text-sm"
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
            >
              <option value="">Select profile…</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.favorite ? "★ " : ""}
                  {p.name}
                  {p.tags.length ? ` · ${p.tags.join(", ")}` : ""}
                </option>
              ))}
            </select>
          </div>

          {selected && (
            <p className="text-sm text-ink-400">
              Target{" "}
              <span className="font-mono text-brand-300">
                {selected.config.username
                  ? `${selected.config.username}@${selected.config.host}`
                  : selected.config.host}
              </span>
              {selected.config.port ? `:${selected.config.port}` : ""}
            </p>
          )}

          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-300">
            <input
              type="checkbox"
              checked={sudo}
              onChange={(e) => setSudo(e.target.checked)}
              className="rounded border-ink-600 text-brand-500 focus:ring-brand-500"
            />
            Run sshuttle with sudo (usually required on macOS/Linux for routing)
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="btn-primary inline-flex min-w-[140px] items-center gap-2"
              disabled={busy || active}
              onClick={() => void connect()}
            >
              {busy && !active ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Power className="size-4" />
              )}
              Connect
            </button>
            <button
              type="button"
              className="btn-danger inline-flex min-w-[140px] items-center gap-2"
              disabled={busy || !active}
              onClick={() => void disconnect()}
            >
              <ShieldOff className="size-4" />
              Disconnect
            </button>
            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-2"
              disabled={busy || !active}
              onClick={() => void reconnect()}
            >
              <RefreshCw className="size-4" />
              Restart
            </button>
          </div>

          {connection?.message && (
            <p className="rounded-lg border border-ink-800 bg-ink-900/80 px-3 py-2 text-sm text-ink-300 light:border-ink-200 light:bg-ink-50">
              {connection.message}
            </p>
          )}
        </section>

        <section className="card space-y-4">
          <div className="label flex items-center gap-2">
            <Zap className="size-4 text-brand-400" />
            Activity
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-ink-500">Down</dt>
              <dd className="font-mono text-ink-100">
                {stats ? formatBytes(stats.bytes_in) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">Up</dt>
              <dd className="font-mono text-ink-100">
                {stats ? formatBytes(stats.bytes_out) : "—"}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-ink-500">Latency hint</dt>
              <dd className="font-mono text-ink-100">
                {stats?.latency_ms != null ? `${stats.latency_ms} ms` : "—"}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-ink-500">
            Byte counters advance when the backend emits stats samples (future:
            deeper sshuttle-side metering).
          </p>
        </section>
      </div>

      <section className="card space-y-3">
        <div className="label flex items-center gap-2">
          <Terminal className="size-4" />
          Generated command
        </div>
        <pre className="max-h-48 overflow-auto rounded-lg border border-ink-800 bg-ink-950 p-4 font-mono text-xs leading-relaxed text-brand-200 light:border-ink-200 light:bg-white light:text-ink-900">
          {connection?.command_preview ??
            "When you connect, the exact sshuttle command line appears here. Edit routing and SSH options per profile under Profiles."}
        </pre>
      </section>

      <LiveLogsPanel />

      <SudoPasswordDialog
        open={sudoDialogOpen}
        hasSavedPassword={sudoHasSaved}
        onCancel={() => setSudoDialogOpen(false)}
        onAuthenticated={() => void onSudoAuthenticated()}
      />
    </div>
  );
}
