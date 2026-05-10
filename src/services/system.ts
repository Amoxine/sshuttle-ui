import { commands } from "@/bindings";
import type {
  DiagnosticsBundle,
  DnsDiagnostics,
  EnvironmentReport,
  NetInterface,
  RouteSample,
  SshHostEntry,
  SshKeyInfo,
  SshuttleProcess,
} from "@/types";
import { unwrap } from "./tauri";

export const systemService = {
  environment: (): Promise<EnvironmentReport> =>
    unwrap(commands.environment()) as Promise<EnvironmentReport>,
  interfaces: (): Promise<NetInterface[]> =>
    unwrap(commands.listNetworkInterfaces()) as Promise<NetInterface[]>,
  defaultRoute: (): Promise<RouteSample> =>
    unwrap(commands.currentDefaultRoute()) as Promise<RouteSample>,
  diagnostics: (): Promise<DiagnosticsBundle> =>
    unwrap(commands.runDiagnostics()) as Promise<DiagnosticsBundle>,

  sshKeys: (): Promise<SshKeyInfo[]> =>
    unwrap(commands.listSshKeys()) as Promise<SshKeyInfo[]>,
  sshHosts: (): Promise<SshHostEntry[]> =>
    unwrap(commands.listSshHosts()) as Promise<SshHostEntry[]>,

  dnsResolve: (host: string): Promise<DnsDiagnostics> =>
    commands.dnsResolve(host) as Promise<DnsDiagnostics>,
  dnsFlush: (): Promise<string> => unwrap(commands.dnsFlush()),

  secretSet: (
    key: string,
    value: string,
  ): Promise<{ key: string; has_value: boolean }> =>
    unwrap(commands.secretSet(key, value)),
  secretDelete: async (key: string): Promise<void> => {
    await unwrap(commands.secretDelete(key));
  },
  secretPresence: (
    key: string,
  ): Promise<{ key: string; has_value: boolean }> =>
    commands.secretPresence(key),

  /**
   * Find sshuttle processes running outside our app's manager. Useful
   * for cleaning up after a crash.
   */
  listOrphanSshuttle: (): Promise<SshuttleProcess[]> =>
    unwrap(commands.listOrphanSshuttleProcesses()) as Promise<SshuttleProcess[]>,

  /**
   * Panic button. Sends TERM (then KILL) to every sshuttle on the host.
   * If `useSavedSudoPassword` is true and one is in the keychain, we
   * use it to elevate the kill on privileged children.
   */
  forceKillAllSshuttle: (useSavedSudoPassword: boolean): Promise<number> =>
    unwrap(commands.forceKillAllSshuttle({ useSavedSudoPassword })),
};
