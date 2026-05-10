import { useEffect } from "react";
import toast from "react-hot-toast";

import * as bindings from "@/bindings";
import type { DeepLinkAction } from "@/bindings";
import { connectionService } from "@/services/connection";
import { isTauri } from "@/services/tauri";
import { appNavigate } from "@/utils/appNavigate";

async function dispatch(action: DeepLinkAction): Promise<void> {
  switch (action.kind) {
    case "show":
      appNavigate("/");
      break;

    case "disconnect": {
      try {
        await connectionService.stop();
        toast.success("Disconnected via deep link");
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Failed to disconnect via deep link",
        );
      }
      break;
    }

    case "connect": {
      // Jump to the dashboard so the user can see what's happening,
      // then kick the connection. We intentionally do *not* prompt for
      // sudo here — the deep link itself encodes that policy.
      appNavigate("/");
      try {
        await connectionService.startByProfile(action.profile_id, action.sudo === true);
        toast.success(`Connecting via deep link`);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : `Could not start ${action.profile_id}`,
        );
      }
      break;
    }

    case "edit":
      appNavigate(`/profiles/${action.profile_id}/edit`);
      break;

    case "unknown":
      toast.error(`Unknown sshuttle-ui URL: ${action.url}`);
      break;
  }
}

/** Subscribe once: route `sshuttle-ui://…` deep links to in-app actions. */
export function useDeepLinkRouter(): void {
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | undefined;
    let active = true;

    void bindings.events.deepLinkAction
      .listen((e) => {
        if (!active) return;
        void dispatch(e.payload as DeepLinkAction);
      })
      .then((u) => {
        unlisten = u;
      });

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);
}
