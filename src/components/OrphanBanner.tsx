import { useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, Skull, X } from "lucide-react";

import { systemService } from "@/services/system";
import { sudoService } from "@/services/sudo";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAppStore } from "@/store/appStore";
import { toastError } from "@/utils/toastError";

/**
 * Surfaces sshuttle processes that are running on the host but are
 * NOT under our manager — almost always leftovers from a previous
 * session that didn't shut down cleanly.
 *
 * The banner offers two paths: kill them all, or dismiss for now.
 * Killing privileged children needs an elevated `kill`; we try the
 * keychain-saved sudo password first and fall back to attempting an
 * unprivileged kill (which is harmless if the children are already
 * unprivileged).
 */
export function OrphanBanner() {
  const orphans = useAppStore((s) => s.orphans);
  const profiles = useAppStore((s) => s.profiles);
  const dismissed = useAppStore((s) => s.orphansDismissed);
  const dismiss = useAppStore((s) => s.dismissOrphans);
  const setOrphans = useAppStore((s) => s.setOrphans);
  const [busy, setBusy] = useState(false);
  const [killConfirmOpen, setKillConfirmOpen] = useState(false);

  if (orphans.length === 0 || dismissed) return null;

  const guessMatch = (cmd: string) => {
    const lower = cmd.toLowerCase();
    for (const p of profiles) {
      const h = p.config.host.toLowerCase();
      if (h && lower.includes(h)) return p.name;
      const u = p.config.username?.trim();
      if (u && h && lower.includes(`${u}@${h}`)) return p.name;
    }
    return null;
  };
  const hints = [...new Set(orphans.map((o) => guessMatch(o.command)).filter(Boolean))];

  const anyElevated = orphans.some((p) => p.elevated);

  const killAll = async () => {
    setBusy(true);
    try {
      // Best effort: if we have a saved sudo password and there are
      // elevated children, use it.
      let useSaved = false;
      if (anyElevated) {
        try {
          const status = await sudoService.status();
          useSaved = !!status.hasSavedPassword;
        } catch {
          useSaved = false;
        }
      }
      const n = await systemService.forceKillAllSshuttle(useSaved);
      toast.success(
        n === 1
          ? "Killed 1 sshuttle process"
          : `Killed ${n} sshuttle processes`,
      );
      // Re-scan to confirm; if anything stuck, leave the banner up.
      const remaining = await systemService.listOrphanSshuttle().catch(() => []);
      setOrphans(remaining);
      if (remaining.length === 0) dismiss();
      setKillConfirmOpen(false);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card border border-amber-500/40 bg-amber-500/5">
      <div className="flex flex-wrap items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-400" />
        <div className="flex-1 space-y-2">
          <h3 className="text-sm font-semibold text-amber-100 light:text-amber-900">
            Found {orphans.length} sshuttle process
            {orphans.length === 1 ? "" : "es"} running outside this app
          </h3>
          <p className="text-xs text-amber-200/80 light:text-amber-800">
            Looks like a previous session didn't shut down cleanly.
            These tunnels keep changing your routing/firewall in the
            background. Reap them now or carry on (you can also do this
            from{" "}
            <span className="font-mono">Settings → Privileges</span>).
          </p>
          {hints.length > 0 && (
            <p className="text-xs text-amber-300/90 light:text-amber-700">
              Looks related to saved profile
              {hints.length === 1 ? "" : "s"}:{" "}
              <span className="font-medium">{hints.join(", ")}</span>
              {" — "}
              reconnect from the app after killing if you want tracked logs.
            </p>
          )}
          <ul className="space-y-1 font-mono text-[11px] text-amber-200/80 light:text-amber-800">
            {orphans.slice(0, 4).map((p) => (
              <li key={p.pid} className="truncate">
                <span className="text-amber-300/90">[{p.pid}]</span>{" "}
                {p.elevated && (
                  <span className="rounded bg-amber-500/20 px-1 text-[10px] uppercase tracking-wide text-amber-300">
                    sudo
                  </span>
                )}{" "}
                {p.command}
              </li>
            ))}
            {orphans.length > 4 && (
              <li className="text-amber-200/60">
                …and {orphans.length - 4} more
              </li>
            )}
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              className="btn-danger inline-flex items-center gap-2"
              disabled={busy}
              onClick={() => setKillConfirmOpen(true)}
            >
              <Skull className="size-4" />
              {busy ? "Killing…" : "Force kill all"}
            </button>
            <button
              type="button"
              className="btn-ghost inline-flex items-center gap-1 text-amber-200 hover:text-amber-100"
              disabled={busy}
              onClick={dismiss}
            >
              <X className="size-4" />
              Dismiss
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={killConfirmOpen}
        title="Force kill every sshuttle process?"
        description={
          <>
            Sends TERM then KILL to all sshuttle processes on this machine,
            including ones started outside this app. Elevated{" "}
            <span className="font-mono">sudo</span> children may require your
            saved sudo password (Settings → Privileges).
          </>
        }
        confirmLabel="Force kill all"
        variant="danger"
        busy={busy}
        onCancel={() => setKillConfirmOpen(false)}
        onConfirm={() => void killAll()}
      />
    </div>
  );
}
