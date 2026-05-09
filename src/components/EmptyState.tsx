import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState(props: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-700 bg-ink-900/30 px-8 py-16 text-center light:border-ink-300 light:bg-ink-50">
      <Icon className="size-12 text-ink-600" strokeWidth={1.25} />
      <h3 className="mt-4 text-lg font-semibold text-ink-200 light:text-ink-900">
        {props.title}
      </h3>
      <p className="mt-2 max-w-md text-sm text-ink-500">{props.description}</p>
      {props.action ? <div className="mt-6">{props.action}</div> : null}
    </div>
  );
}
