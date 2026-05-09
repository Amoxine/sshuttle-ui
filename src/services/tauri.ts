import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type { RuntimeEvent } from "@/types";

/**
 * Detect whether the page is loaded inside a Tauri webview. When running
 * the React app in a plain browser (e.g. `npm run dev` without Tauri) we
 * gracefully degrade and return safe defaults instead of throwing.
 */
export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function invoke<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauri()) {
    throw new Error(
      `Tauri not available — cannot call '${cmd}'. Launch with \`npm run app:dev\`.`,
    );
  }
  return tauriInvoke<T>(cmd, args);
}

export async function safeInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
  fallback?: T,
): Promise<T | undefined> {
  if (!isTauri()) return fallback;
  try {
    return await tauriInvoke<T>(cmd, args);
  } catch (e) {
    console.warn(`safeInvoke('${cmd}') failed:`, e);
    return fallback;
  }
}

export async function onRuntimeEvent(
  handler: (event: RuntimeEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return () => {};
  }
  return listen<RuntimeEvent>("sshuttle:event", (e) => handler(e.payload));
}

export async function onTauri<T = unknown>(
  name: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  return listen<T>(name, (e) => handler(e.payload));
}
