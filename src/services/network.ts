import type { PublicIpInfo } from "@/types";
import { invoke } from "./tauri";

export const networkService = {
  lookupPublicIp: () => invoke<PublicIpInfo>("lookup_public_ip"),
};
