import { Loader2 } from "lucide-react";

/** Minimal full-viewport placeholder while lazy route chunks load. */
export function PageLoading() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-ink-500">
      <Loader2 className="size-8 animate-spin text-brand-400" aria-hidden />
      <p className="text-sm">Loading…</p>
    </div>
  );
}
