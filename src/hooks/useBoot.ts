import { useEffect } from "react";

import { systemService } from "@/services/system";
import { onRuntimeEvent } from "@/services/tauri";
import { useAppStore } from "@/store/appStore";

/** Initial data load + subscribe to sshuttle runtime events. */
export function useBoot(): void {
  const loadProfiles = useAppStore((s) => s.loadProfiles);
  const loadSettings = useAppStore((s) => s.loadSettings);
  const refreshConnection = useAppStore((s) => s.refreshConnection);
  const applyRuntimeEvent = useAppStore((s) => s.applyRuntimeEvent);
  const setOrphans = useAppStore((s) => s.setOrphans);

  useEffect(() => {
    void loadProfiles();
    void loadSettings();
    void refreshConnection();
    // Catch any orphan sshuttle processes the user might have left
    // behind by a crash/kill — backend also emits `orphans_detected`,
    // but a frontend reload (e.g. devtools refresh) misses that one.
    void systemService
      .listOrphanSshuttle()
      .then((procs) => {
        if (procs && procs.length > 0) setOrphans(procs);
      })
      .catch(() => {
        /* not fatal */
      });
  }, [loadProfiles, loadSettings, refreshConnection, setOrphans]);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    void (async () => {
      const u = await onRuntimeEvent((e) => {
        if (!active) return;
        applyRuntimeEvent(e);
      });
      unlisten = u;
    })();

    return () => {
      active = false;
      unlisten?.();
    };
  }, [applyRuntimeEvent]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshConnection();
    }, 4_000);
    return () => window.clearInterval(id);
  }, [refreshConnection]);
}
