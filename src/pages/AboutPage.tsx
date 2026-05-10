import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

import type { EnvironmentReport } from "@/types";
import { aboutService } from "@/services/about";
import { systemService } from "@/services/system";
import { toastError } from "@/utils/toastError";

export function AboutPage() {
  const [env, setEnv] = useState<EnvironmentReport | null>(null);
  const [versionBusy, setVersionBusy] = useState(true);
  const [version, setVersion] = useState<Awaited<
    ReturnType<typeof aboutService.versionInfo>
  > | null>(null);

  const [updateBusy, setUpdateBusy] = useState(false);
  const [installBusy, setInstallBusy] = useState(false);
  const [updateResult, setUpdateResult] = useState<Awaited<
    ReturnType<typeof aboutService.checkForUpdate>
  > | null>(null);

  const [supportBusy, setSupportBusy] = useState(false);

  const loadVersion = useCallback(async () => {
    setVersionBusy(true);
    try {
      const [v, e] = await Promise.all([
        aboutService.versionInfo(),
        systemService.environment(),
      ]);
      setVersion(v);
      setEnv(e);
    } catch (err) {
      toastError(err);
    } finally {
      setVersionBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadVersion();
  }, [loadVersion]);

  const checkUpdates = async () => {
    setUpdateBusy(true);
    try {
      const r = await aboutService.checkForUpdate();
      setUpdateResult(r);
    } catch (err) {
      toastError(err);
    } finally {
      setUpdateBusy(false);
    }
  };

  const installUpdate = async () => {
    setInstallBusy(true);
    try {
      await aboutService.installUpdate();
      toast.success("Update installed. Restart the app when you are ready.");
      await checkUpdates();
    } catch (err) {
      toastError(err);
    } finally {
      setInstallBusy(false);
    }
  };

  const copySupportBundle = async () => {
    setSupportBusy(true);
    try {
      const bundle = await aboutService.generateSupportBundle();
      const text = JSON.stringify(bundle, null, 2);
      await navigator.clipboard.writeText(text);
      toast.success("Support bundle copied to the clipboard.");
    } catch (err) {
      toastError(err);
    } finally {
      setSupportBusy(false);
    }
  };

  const downloadSupportBundle = async () => {
    setSupportBusy(true);
    try {
      const bundle = await aboutService.generateSupportBundle();
      const text = JSON.stringify(bundle, null, 2);
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sshuttle-ui-support-${bundle.generatedAt.slice(0, 19).replace(/:/g, "-")}.json`;
      a.rel = "noopener";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Support bundle downloaded.");
    } catch (err) {
      toastError(err);
    } finally {
      setSupportBusy(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-100 light:text-ink-900">
          About
        </h1>
        <p className="mt-1 text-sm text-ink-400">
          Version details, optional in-app updates, and support bundle export.
        </p>
      </header>

      <section className="card space-y-4 text-sm">
        <h2 className="text-sm font-semibold text-ink-200">sshuttle UI</h2>
        {versionBusy && (
          <p className="text-ink-500">Loading version information…</p>
        )}
        {!versionBusy && version && (
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-ink-500">App version</dt>
              <dd className="font-mono text-ink-100">{version.version}</dd>
            </div>
            <div>
              <dt className="text-ink-500">Commit</dt>
              <dd className="font-mono text-ink-100">
                {version.commitHash ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">Build</dt>
              <dd className="font-mono text-ink-100">
                {version.buildProfile}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">Tauri</dt>
              <dd className="font-mono text-ink-100">
                {version.tauriVersion}
              </dd>
            </div>
            {env && (
              <>
                <div>
                  <dt className="text-ink-500">OS / arch</dt>
                  <dd className="font-mono text-ink-100">
                    {env.os} / {env.arch}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-ink-500">sshuttle</dt>
                  <dd className="break-all font-mono text-ink-100">
                    {env.sshuttle_path ?? "not found"}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-ink-500">sshuttle version</dt>
                  <dd className="font-mono text-ink-100">
                    {env.sshuttle_version ?? "—"}
                  </dd>
                </div>
              </>
            )}
          </dl>
        )}
        <p className="text-xs text-ink-500">
          In-app updates are off by default until release endpoints and signing
          keys are configured in production builds.
        </p>
      </section>

      <section className="card space-y-4">
        <h2 className="text-sm font-semibold text-ink-200">Updates</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={updateBusy}
            onClick={() => void checkUpdates()}
          >
            {updateBusy ? "Checking…" : "Check for updates"}
          </button>
          {updateResult?.available && (
            <button
              type="button"
              className="btn-secondary"
              disabled={installBusy}
              onClick={() => void installUpdate()}
            >
              {installBusy ? "Installing…" : "Install update"}
            </button>
          )}
        </div>
        {updateResult?.disabledReason && (
          <p className="text-xs text-ink-500">
            Updates are disabled in this build. {updateResult.disabledReason}
          </p>
        )}
        {updateResult && !updateResult.disabledReason && !updateResult.available && (
          <p className="text-sm text-ink-300">You&apos;re up to date.</p>
        )}
        {updateResult?.available && updateResult.newVersion && (
          <div className="space-y-1 text-sm text-ink-200">
            <p>
              Version {updateResult.newVersion} is available
              {updateResult.notes ? "." : ""}
            </p>
            {updateResult.notes && (
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-ink-900/80 p-3 text-xs text-ink-300 light:bg-ink-100">
                {updateResult.notes}
              </pre>
            )}
          </div>
        )}
      </section>

      <section className="card space-y-4">
        <h2 className="text-sm font-semibold text-ink-200">Support</h2>
        <p className="text-sm text-ink-400">
          Generate a JSON support bundle (environment, version, recent logs, and
          profile names only — no hosts or keys) for bug reports.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={supportBusy}
            onClick={() => void copySupportBundle()}
          >
            {supportBusy ? "Working…" : "Generate support bundle"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={supportBusy}
            onClick={() => void downloadSupportBundle()}
          >
            Download JSON
          </button>
        </div>
      </section>

      <section className="card space-y-2 text-sm">
        <h2 className="text-sm font-semibold text-ink-200">Source</h2>
        <p className="text-ink-400">
          <a
            className="text-brand-400 underline hover:text-brand-300"
            href="https://github.com/OWNER/REPO"
            target="_blank"
            rel="noopener noreferrer"
          >
            Project repository on GitHub
          </a>
        </p>
      </section>
    </div>
  );
}
