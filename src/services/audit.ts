import { commands, type AuditEvent } from "@/bindings";
import { unwrap } from "./tauri";

export const auditService = {
  list: (limit = 200) =>
    unwrap(commands.listAuditEvents(limit)) as Promise<AuditEvent[]>,
  export: () => unwrap(commands.exportAuditLog()) as Promise<string>,
  clear: async () => {
    await unwrap(commands.clearAuditLog());
  },
};
