import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { RefreshCw } from "lucide-react";

import { systemService } from "@/services/system";
import { formatBytes } from "@/utils/format";
import { logsService } from "@/services/logs";

export function DiagnosticsPage() {
  const [env, setEnv] = useState<Awaited<
    ReturnType<typeof systemService.environment>
  > | null>(null);
  const [ifaces, setIfaces] = useState<Awaited<
    ReturnType<typeof systemService.interfaces>
  > | null>(null);
  const [bundle, setBundle] = useState<Awaited<
    ReturnType<typeof systemService.diagnostics>
  > | null>(null);
  const [history, setHistory] = useState<Awaited<
    ReturnType<typeof logsService.history>
  > | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [e, i, b, h] = await Promise.all([
        systemService.environment(),
        systemService.interfaces(),
        systemService.diagnostics(),
        logsService.history(25),
      ]);
      setEnv(e);
      setIfaces(i);
      setBundle(b);
      setHistory(h);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="animate-fade-in space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100 light:text-ink-900">
            Diagnostics
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            Environment, routing snapshot, quick pings, and recent tunnel
            history.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary inline-flex items-center gap-2"
          disabled={busy}
          onClick={() => void refresh()}
        >
          <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </header>

      {env && (
        <section className="card space-y-2 text-sm">
          <h2 className="text-sm font-semibold text-ink-200">Environment</h2>
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-ink-500">sshuttle</dt>
              <dd className="font-mono text-ink-100">
                {env.sshuttle_path ?? "not found in PATH"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">Version</dt>
              <dd className="font-mono text-ink-100">
                {env.sshuttle_version ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">OS / arch</dt>
              <dd className="font-mono">
                {env.os} / {env.arch}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-ink-500">Data directory</dt>
              <dd className="break-all font-mono text-xs text-ink-300">
                {env.data_dir}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {bundle?.default_route && (
        <section className="card space-y-2 text-sm">
          <h2 className="text-sm font-semibold text-ink-200">Default route</h2>
          <p>
            Gateway{" "}
            <span className="font-mono text-brand-300">
              {bundle.default_route.default_gateway ?? "—"}
            </span>{" "}
            via{" "}
            <span className="font-mono">
              {bundle.default_route.default_interface ?? "—"}
            </span>
          </p>
          <p className="text-xs text-ink-500">
            Captured {bundle.default_route.captured_at}
          </p>
        </section>
      )}

      <section className="card grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-ink-200">Ping 8.8.8.8</h3>
          <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-ink-950 p-3 font-mono text-xs text-ink-300 light:bg-ink-50 light:text-ink-800">
            {bundle?.ping_8888
              ? `${bundle.ping_8888.success ? "ok" : "fail"} in ${bundle.ping_8888.elapsed_ms} ms\n${bundle.ping_8888.output}`
              : "—"}
          </pre>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink-200">Ping 1.1.1.1</h3>
          <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-ink-950 p-3 font-mono text-xs text-ink-300 light:bg-ink-50 light:text-ink-800">
            {bundle?.ping_cloudflare
              ? `${bundle.ping_cloudflare.success ? "ok" : "fail"} in ${bundle.ping_cloudflare.elapsed_ms} ms\n${bundle.ping_cloudflare.output}`
              : "—"}
          </pre>
        </div>
      </section>

      {ifaces && (
        <section className="card space-y-3 text-sm">
          <h2 className="text-sm font-semibold text-ink-200">
            Network interfaces
          </h2>
          <ul className="space-y-2">
            {ifaces.map((n) => (
              <li
                key={n.name}
                className="rounded-lg border border-ink-800 px-3 py-2 light:border-ink-200"
              >
                <span className="font-mono font-semibold text-brand-300">
                  {n.name}
                </span>
                <span className="ml-2 text-ink-500">{n.status}</span>
                <div className="mt-1 font-mono text-xs text-ink-400">
                  {n.addresses.join(", ") || "no addresses"}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {history && history.length > 0 && (
        <section className="card space-y-3">
          <h2 className="text-sm font-semibold text-ink-200">
            Recent sessions ({bundle?.recent_history_count ?? history.length}{" "}
            in DB sample)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-ink-500">
                <tr>
                  <th className="py-2 pr-4">Started</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">In</th>
                  <th className="py-2 pr-4">Out</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800 light:divide-ink-100">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="py-2 pr-4 font-mono text-xs text-ink-400">
                      {h.started_at}
                    </td>
                    <td className="py-2 pr-4">{h.status}</td>
                    <td className="py-2 pr-4 font-mono">
                      {formatBytes(h.bytes_in)}
                    </td>
                    <td className="py-2 pr-4 font-mono">
                      {formatBytes(h.bytes_out)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
