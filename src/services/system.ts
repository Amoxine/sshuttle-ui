import type {
  DiagnosticsBundle,
  DnsDiagnostics,
  EnvironmentReport,
  NetInterface,
  RouteSample,
  SshHostEntry,
  SshKeyInfo,
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
};
