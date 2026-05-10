import { Command } from "cmdk";
import { Check } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { cn } from "@/utils/cn";

export interface Option {
  id: string;
  label: string;
  sublabel?: string;
}

export interface SearchableSelectProps {
  value: string | null;
  onChange: (id: string | null) => void;
  options: Option[];
  placeholder?: string;
  allowClear?: boolean;
  label?: string;
  ariaLabel?: string;
  className?: string;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  allowClear,
  label,
  ariaLabel,
  className,
}: SearchableSelectProps) {
  const uid = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = options.find((o) => o.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      searchRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current && !rootRef.current.contains(t)) {
        setOpen(false);
        setSearch("");
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        setSearch("");
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => {
    setOpen(false);
    setSearch("");
    triggerRef.current?.focus();
  };

  const labelId = label ? `${uid}-label` : undefined;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {label ? (
        <span id={labelId} className="label mb-1 block">
          {label}
        </span>
      ) : null}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelId}
        aria-label={!label ? ariaLabel ?? placeholder : undefined}
        className="input flex w-full max-w-lg items-center justify-between gap-2 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={cn("min-w-0 flex-1 truncate", !selected && "text-ink-500")}>
          {selected ? selected.label : placeholder}
        </span>
      </button>
      {open ? (
        <div
          className="absolute left-0 top-full z-[80] mt-1 min-w-full max-w-[min(100vw-2rem,32rem)] rounded-lg border border-ink-700 bg-ink-900 p-1 shadow-xl light:border-ink-200 light:bg-white"
          role="presentation"
        >
          <Command label={ariaLabel ?? label ?? "Options"} shouldFilter>
            <div className="border-b border-ink-800 px-2 py-1.5 light:border-ink-200">
              <Command.Input
                ref={searchRef}
                value={search}
                onValueChange={setSearch}
                placeholder="Search…"
                className="w-full rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 light:border-ink-200 light:bg-white light:text-ink-900"
              />
            </div>
            <Command.List className="max-h-60 overflow-auto p-1">
              <Command.Empty className="px-2 py-3 text-center text-sm text-ink-500">
                No matches.
              </Command.Empty>
              {allowClear ? (
                <Command.Item
                  value="__clear"
                  onSelect={() => {
                    onChange(null);
                    close();
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-ink-300 aria-selected:bg-brand-500/15 light:text-ink-700"
                >
                  <span className="flex-1">Clear selection</span>
                  {value === null ? (
                    <Check className="size-4 shrink-0 text-brand-400" />
                  ) : null}
                </Command.Item>
              ) : null}
              {options.map((o) => (
                <Command.Item
                  key={o.id}
                  value={`${o.label} ${o.sublabel ?? ""}`}
                  onSelect={() => {
                    onChange(o.id);
                    close();
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-ink-200 aria-selected:bg-brand-500/15 light:text-ink-800"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{o.label}</div>
                    {o.sublabel ? (
                      <div className="truncate text-xs text-ink-500">{o.sublabel}</div>
                    ) : null}
                  </div>
                  {value === o.id ? (
                    <Check className="size-4 shrink-0 text-brand-400" />
                  ) : null}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </div>
      ) : null}
    </div>
  );
}
