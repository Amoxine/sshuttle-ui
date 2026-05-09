import { useEffect } from "react";

import { onRuntimeEvent } from "@/services/tauri";
import { useAppStore } from "@/store/appStore";

/** Initial data load + subscribe to sshuttle runtime events. */
export function useBoot(): void {
  const loadProfiles = useAppStore((s) => s.loadProfiles);
  const loadSettings = useAppStore((s) => s.loadSettings);
  const refreshConnection = useAppStore((s) => s.refreshConnection);
  const applyRuntimeEvent = useAppStore((s) => s.applyRuntimeEvent);

  useEffect(() => {
    void loadProfiles();
    void loadSettings();
    void refreshConnection();
  }, [loadProfiles, loadSettings, refreshConnection]);

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
