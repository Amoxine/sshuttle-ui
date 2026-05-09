import { useState } from "react";
import toast from "react-hot-toast";
import { Globe, RefreshCw } from "lucide-react";

import { systemService } from "@/services/system";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { toastError } from "@/utils/toastError";

export function DnsPage() {
  const [host, setHost] = useState("example.com");
  const [loading, setLoading] = useState(false);
  const [flushMsg, setFlushMsg] = useState<string | null>(null);
  const [flushConfirmOpen, setFlushConfirmOpen] = useState(false);
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof systemService.dnsResolve>
  > | null>(null);

  const resolve = async () => {
    setLoading(true);
    try {
      const r = await systemService.dnsResolve(host.trim() || "example.com");
      setResult(r);
    } catch (e) {
      toastError(e);
    } finally {
      setLoading(false);
    }
  };

  const flush = async () => {
    try {
      const msg = await systemService.dnsFlush();
      setFlushMsg(msg);
      toast.success("DNS cache flush attempted");
      setFlushConfirmOpen(false);
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="animate-fade-in space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-100 light:text-ink-900">
          DNS tools
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-400">
          Resolve names through the OS resolver (helpful before/after tunnels).
          Full DNS routing follows your sshuttle{" "}
          <code className="font-mono text-brand-300">--dns</code> settings per
          profile.
        </p>
      </header>

      <section className="card space-y-4">
        <div className="label flex items-center gap-2">
          <Globe className="size-4" />
          Resolver check
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            className="input max-w-md flex-1 font-mono text-sm"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="hostname"
          />
          <button
            type="button"
            className="btn-primary"
            disabled={loading}
            onClick={() => void resolve()}
          >
            Resolve
          </button>
        </div>
        {result && (
          <div className="rounded-lg border border-ink-800 bg-ink-950/60 p-4 text-sm light:border-ink-200 light:bg-ink-50">
            <p className="font-mono text-brand-300">{result.host}</p>
            <p className="mt-2 text-ink-400">
              {result.error ? (
                <span className="text-red-400">{result.error}</span>
              ) : (
                <>
                  {result.addresses.join(", ") || "No addresses"}
                  <span className="ml-2 text-ink-500">
                    ({result.elapsed_ms} ms)
                  </span>
                </>
              )}
            </p>
          </div>
        )}
      </section>

      <section className="card space-y-3">
        <div className="label flex items-center gap-2">
          <RefreshCw className="size-4" />
          Cache flush
        </div>
        <p className="text-sm text-ink-500">
          Platform-specific best-effort flush (macOS dscacheutil + mDNS, Linux
          systemd/resolvectl, Windows ipconfig).
        </p>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setFlushConfirmOpen(true)}
        >
          Flush local DNS cache
        </button>
        {flushMsg && (
          <p className="text-sm text-ink-400">{flushMsg}</p>
        )}
      </section>

      <ConfirmDialog
        open={flushConfirmOpen}
        title="Flush local DNS cache?"
        description="Runs platform-specific commands (e.g. dscacheutil, systemd-resolve). Brief resolver churn can occur."
        confirmLabel="Flush cache"
        variant="danger"
        onCancel={() => setFlushConfirmOpen(false)}
        onConfirm={() => void flush()}
      />
    </div>
  );
}
