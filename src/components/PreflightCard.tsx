import { Loader2, Stethoscope } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { profilesService } from "@/services/profiles";
import type { PreflightReport } from "@/types";

export function PreflightCard(props: { profileId: string }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<PreflightReport | null>(null);

  const run = async () => {
    if (!props.profileId) {
      toast.error("Pick a profile first.");
      return;
    }
    setBusy(true);
    try {
      setReport(await profilesService.preflight(props.profileId));
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  const ok =
    report &&
    report.sshuttlePath &&
    report.hostResolved &&
    (report.skippedSshProbe || report.sshBatchProbeOk);

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="label flex items-center gap-2">
          <Stethoscope className="size-4 text-amber-400" />
          Connection check
        </div>
        <button
          type="button"
          className="btn-secondary text-xs"
          disabled={busy || !props.profileId}
          onClick={() => void run()}
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : "Run checks"}
        </button>
      </div>
      <p className="text-xs text-ink-500">
        DNS resolution + non-interactive SSH handshake (skipped for password
        profiles without a saved password).
      </p>
      {report && (
        <ul className="space-y-1 font-mono text-xs text-ink-300 light:text-ink-700">
          <li>
            sshuttle:{" "}
            {report.sshuttlePath ?? (
              <span className="text-red-400">not found</span>
            )}
          </li>
          <li>
            DNS ({report.dnsElapsedMs} ms):{" "}
            {report.hostResolved
              ? report.resolvedAddresses.join(", ")
              : "failed"}
          </li>
          <li>
            SSH batch probe:{" "}
            {report.skippedSshProbe ? (
              <span className="text-amber-300">{report.skippedReason}</span>
            ) : report.sshBatchProbeOk ? (
              <span className="text-emerald-400">ok</span>
            ) : (
              <span className="text-red-400">
                {report.sshBatchProbeDetail ?? "failed"}
              </span>
            )}
          </li>
          <li className={ok ? "text-emerald-400" : "text-ink-500"}>
            {ok ? "Looks good to connect." : "Fix issues above before connecting."}
          </li>
        </ul>
      )}
    </section>
  );
}
