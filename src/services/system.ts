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
import { invoke } from "./tauri";

export const systemService = {
  environment: () => invoke<EnvironmentReport>("environment"),
  interfaces: () => invoke<NetInterface[]>("list_network_interfaces"),
  defaultRoute: () => invoke<RouteSample>("current_default_route"),
  diagnostics: () => invoke<DiagnosticsBundle>("run_diagnostics"),

  sshKeys: () => invoke<SshKeyInfo[]>("list_ssh_keys"),
  sshHosts: () => invoke<SshHostEntry[]>("list_ssh_hosts"),

  dnsResolve: (host: string) => invoke<DnsDiagnostics>("dns_resolve", { host }),
  dnsFlush: () => invoke<string>("dns_flush"),

  secretSet: (key: string, value: string) =>
    invoke<{ key: string; has_value: boolean }>("secret_set", { key, value }),
  secretDelete: (key: string) => invoke<void>("secret_delete", { key }),
  secretPresence: (key: string) =>
    invoke<{ key: string; has_value: boolean }>("secret_presence", { key }),

  /**
   * Find sshuttle processes running outside our app's manager. Useful
   * for cleaning up after a crash.
   */
  listOrphanSshuttle: () =>
    invoke<SshuttleProcess[]>("list_orphan_sshuttle_processes"),

  /**
   * Panic button. Sends TERM (then KILL) to every sshuttle on the host.
   * If `useSavedSudoPassword` is true and one is in the keychain, we
   * use it to elevate the kill on privileged children.
   */
  forceKillAllSshuttle: (useSavedSudoPassword: boolean) =>
    invoke<number>("force_kill_all_sshuttle", {
      args: { useSavedSudoPassword },
    }),
};
