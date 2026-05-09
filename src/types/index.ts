export type SshAuth = "agent" | "key" | "password";

export interface SshuttleConfig {
  username: string;
  host: string;
  port: number | null;
  auth: SshAuth;
  identityFile: string | null;
  jumpHosts: string[];
  extraSshOptions: string[];
  subnets: string[];
  excludeSubnets: string[];
  dns: boolean;
  nsHosts: string[];
  ipv6: boolean;
  autoHosts: boolean;
  autoNets: boolean;
  latencyControl: boolean;
  compression: boolean;
  remotePython: string | null;
  verbosity: number;
  listen: string | null;
  preConnectScript: string | null;
  postDisconnectScript: string | null;
}

export interface Profile {
  id: string;
  name: string;
  tags: string[];
  favorite: boolean;
  config: SshuttleConfig;
  created_at: string;
  updated_at: string;
}

export interface NewProfile {
  name: string;
  tags?: string[];
  favorite?: boolean;
  config: SshuttleConfig;
}

export type ProfileUpdate = Partial<Omit<NewProfile, "config">> & {
  config?: SshuttleConfig;
};

export type ConnectionPhase =
  | "idle"
  | "starting"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "stopping"
  | "failed"
  | "disconnected";

export interface ConnectionState {
  phase: ConnectionPhase;
  profile_id: string | null;
  profile_name: string | null;
  command_preview: string | null;
  started_at: string | null;
  message: string | null;
  history_id: number | null;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogLine {
  level: LogLevel;
  line: string;
  timestamp: string;
}

export type NetworkChangeReason = "wake" | "default_route";

export type RuntimeEvent =
  | {
      type: "phase";
      phase: ConnectionPhase;
      profile_id: string | null;
      profile_name: string | null;
      message: string | null;
      timestamp: string;
    }
  | {
      type: "log";
      level: LogLevel;
      line: string;
      timestamp: string;
    }
  | {
      type: "stats";
      bytes_in: number;
      bytes_out: number;
      latency_ms: number | null;
      timestamp: string;
    }
  | {
      type: "network_changed";
      reason: NetworkChangeReason;
      timestamp: string;
    };

/** Mirrors `storage::settings::AppSettings` JSON (snake_case). */
export interface AppSettings {
  theme: string;
  start_minimized: boolean;
  launch_at_login: boolean;
  auto_reconnect: boolean;
  reconnect_delay_seconds: number;
  max_reconnect_attempts: number;
  reconnect_on_network_change: boolean;
  kill_switch: boolean;
  minimize_to_tray: boolean;
  notifications: boolean;
  debug_logging: boolean;
  default_profile_id: string | null;
  log_buffer_lines: number;
}

export interface HistoryEntry {
  id: number;
  profile_id: string | null;
  started_at: string;
  ended_at: string | null;
  status: string;
  bytes_in: number;
  bytes_out: number;
  error: string | null;
}

export interface SshHostEntry {
  host: string;
  hostname: string | null;
  user: string | null;
  port: number | null;
  identity_file: string | null;
  proxy_jump: string | null;
  proxy_command: string | null;
  extra: Record<string, string>;
}

export interface SshKeyInfo {
  path: string;
  kind: string | null;
  comment: string | null;
  permissions_ok: boolean;
  has_passphrase: boolean | null;
}

export interface NetInterface {
  name: string;
  addresses: string[];
  status: string | null;
}

export interface RouteSample {
  default_gateway: string | null;
  default_interface: string | null;
  captured_at: string;
}

export interface PingResult {
  host: string;
  success: boolean;
  elapsed_ms: number;
  output: string;
}

export interface DnsDiagnostics {
  host: string;
  addresses: string[];
  elapsed_ms: number;
  error: string | null;
}

export interface EnvironmentReport {
  sshuttle_path: string | null;
  sshuttle_version: string | null;
  os: string;
  arch: string;
  data_dir: string;
}

export interface DiagnosticsBundle {
  default_route: RouteSample | null;
  ping_8888: PingResult | null;
  ping_cloudflare: PingResult | null;
  recent_history_count: number;
}

export const DEFAULT_CONFIG: SshuttleConfig = {
  username: "",
  host: "",
  port: null,
  auth: "agent",
  identityFile: null,
  jumpHosts: [],
  extraSshOptions: [],
  subnets: ["0/0"],
  excludeSubnets: [],
  dns: true,
  nsHosts: [],
  ipv6: false,
  autoHosts: false,
  autoNets: false,
  latencyControl: true,
  compression: false,
  remotePython: null,
  verbosity: 0,
  listen: null,
  preConnectScript: null,
  postDisconnectScript: null,
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: "system",
  start_minimized: false,
  launch_at_login: false,
  auto_reconnect: true,
  reconnect_delay_seconds: 5,
  max_reconnect_attempts: 10,
  reconnect_on_network_change: true,
  kill_switch: false,
  minimize_to_tray: true,
  notifications: true,
  debug_logging: false,
  default_profile_id: null,
  log_buffer_lines: 5000,
};
