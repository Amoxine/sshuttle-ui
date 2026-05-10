import {
  Children,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  isValidElement,
  useCallback,
  useRef,
} from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/utils/cn";

export interface TabsProps {
  value: string;
  onValueChange: (next: string) => void;
  tabs: { id: string; label: string; icon?: LucideIcon }[];
  children: ReactNode;
  className?: string;
}

export interface TabPanelProps {
  id: string;
  children: ReactNode;
}

export function TabPanel(props: TabPanelProps): ReactElement {
  const { children } = props;
  return <>{children}</>;
}
TabPanel.displayName = "TabPanel";

export function Tabs({
  value,
  onValueChange,
  tabs,
  children,
  className,
}: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const tabIds = tabs.map((t) => t.id);

  const activateIndex = useCallback(
    (idx: number) => {
      const id = tabIds[idx];
      if (id) onValueChange(id);
    },
    [onValueChange, tabIds],
  );

  const focusTabIndex = useCallback((idx: number) => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(
      `#tab-${tabIds[idx]}`,
    );
    el?.focus();
  }, [tabIds]);

  const onTabKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const len = tabIds.length;
        const next = (idx + dir + len) % len;
        focusTabIndex(next);
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        focusTabIndex(0);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        focusTabIndex(tabIds.length - 1);
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activateIndex(idx);
      }
    },
    [activateIndex, focusTabIndex, tabIds.length],
  );

  const panels = Children.toArray(children).filter(
    (child): child is ReactElement<TabPanelProps> =>
      isValidElement(child) && child.type === TabPanel,
  );
  const activePanel = panels.find((p) => p.props.id === value);

  return (
    <div className={cn("space-y-6", className)}>
      <div
        ref={listRef}
        role="tablist"
        aria-orientation="horizontal"
        className="-mx-1 flex gap-1 overflow-x-auto border-b border-ink-800 px-1 pb-px light:border-ink-200"
      >
        {tabs.map((t, idx) => {
          const Icon = t.icon;
          const selected = value === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
                selected
                  ? "border-b-2 border-brand-500 text-brand-200 light:text-brand-700"
                  : "border-b-2 border-transparent text-ink-400 hover:text-ink-200 light:hover:text-ink-700",
              )}
              onClick={() => onValueChange(t.id)}
              onKeyDown={(e) => onTabKeyDown(e, idx)}
            >
              {Icon ? <Icon className="size-4 opacity-80" /> : null}
              {t.label}
            </button>
          );
        })}
      </div>
      {activePanel ? (
        <div
          role="tabpanel"
          id={`panel-${value}`}
          aria-labelledby={`tab-${value}`}
          tabIndex={0}
        >
          {activePanel.props.children}
        </div>
      ) : null}
    </div>
  );
}
