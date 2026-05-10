import { commands } from "@/bindings";
import type { PublicIpInfo } from "@/types";

export const networkService = {
  lookupPublicIp: (): Promise<PublicIpInfo> =>
    commands.lookupPublicIp() as Promise<PublicIpInfo>,
};
