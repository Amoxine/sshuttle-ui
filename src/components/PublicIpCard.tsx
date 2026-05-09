import { Globe2, Loader2, MapPin } from "lucide-react";
import { useEffect, useState } from "react";

import { networkService } from "@/services/network";
import type { PublicIpInfo } from "@/types";

/** Shows egress IP + coarse geo — handy sanity check that traffic exits where you think. */
export function PublicIpCard() {
  const [data, setData] = useState<PublicIpInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setData(await networkService.lookupPublicIp());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="label flex items-center gap-2">
          <Globe2 className="size-4 text-sky-400" />
          Public IP
        </div>
        <button
          type="button"
          className="btn-ghost text-xs"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? <Loader2 className="size-3 animate-spin" /> : "Refresh"}
        </button>
      </div>
      {data?.error ? (
        <p className="text-sm text-amber-400">{data.error}</p>
      ) : (
        <>
          <p className="font-mono text-lg text-brand-200 light:text-brand-700">
            {data?.ip ?? "—"}
          </p>
          <div className="flex items-start gap-2 text-sm text-ink-400">
            <MapPin className="mt-0.5 size-4 shrink-0 text-ink-500" />
            <span>
              {[data?.city, data?.country].filter(Boolean).join(", ") ||
                "Location unknown"}
              {data?.isp ? ` · ${data.isp}` : ""}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
