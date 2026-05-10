import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

import type { PolicyOverrides } from "@/bindings";
import { policyService } from "@/services/policy";

function policyHasOverrides(p: PolicyOverrides): boolean {
  return (
    p.forceKillSwitch != null ||
    p.forceDefaultProfileId != null ||
    p.lockTheme != null ||
    p.disableProfileEditing != null ||
    p.disableTelemetry != null ||
    p.allowedSubnetsRegex != null ||
    (p.sourcePath != null && p.sourcePath.length > 0)
  );
}

export function PolicyBadge() {
  const [policy, setPolicy] = useState<PolicyOverrides | null>(null);

  useEffect(() => {
    void policyService
      .get()
      .then(setPolicy)
      .catch(() => setPolicy(null));
  }, []);

  if (!policy || !policyHasOverrides(policy)) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
      <ShieldCheck className="size-3.5" />
      Settings are managed by your organization
      {policy.sourcePath ? (
        <span className="font-mono text-amber-300/80">
          · {policy.sourcePath}
        </span>
      ) : null}
    </div>
  );
}
