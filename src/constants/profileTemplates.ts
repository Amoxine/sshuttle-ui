import type { SshuttleConfig } from "@/types";
import { DEFAULT_CONFIG } from "@/types";

export interface ProfileTemplate {
  id: string;
  title: string;
  description: string;
  config: Partial<SshuttleConfig>;
}

/** Quick-start presets for the profile editor / dashboard chips. */
export const PROFILE_TEMPLATES: ProfileTemplate[] = [
  {
    id: "full-tunnel",
    title: "Full VPN",
    description: "All IPv4 traffic via tunnel + DNS",
    config: {
      subnets: ["0/0"],
      dns: true,
      excludeSubnets: [],
    },
  },
  {
    id: "corp-split",
    title: "Split — corp RFC1918",
    description: "Only private ranges through tunnel",
    config: {
      subnets: ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"],
      dns: false,
    },
  },
  {
    id: "compressed",
    title: "Compressed link",
    description: "SSH compression on slow networks",
    config: {
      compression: true,
    },
  },
];

export function applyTemplate(
  base: SshuttleConfig,
  template: ProfileTemplate,
): SshuttleConfig {
  return {
    ...DEFAULT_CONFIG,
    ...base,
    ...template.config,
    subnets:
      template.config.subnets != null
        ? [...template.config.subnets]
        : [...(base.subnets?.length ? base.subnets : DEFAULT_CONFIG.subnets)],
    excludeSubnets:
      template.config.excludeSubnets != null
        ? [...template.config.excludeSubnets]
        : [...(base.excludeSubnets ?? [])],
    jumpHosts:
      template.config.jumpHosts != null
        ? [...template.config.jumpHosts]
        : [...(base.jumpHosts ?? [])],
  };
}
