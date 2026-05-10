import { commands, type PolicyOverrides } from "@/bindings";
import { unwrap } from "./tauri";

export const policyService = {
  get: () => unwrap(commands.getPolicy()) as Promise<PolicyOverrides>,
};
