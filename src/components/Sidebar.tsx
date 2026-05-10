import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Globe,
  LayoutDashboard,
  ListTree,
  ScrollText,
  Settings,
} from "lucide-react";

import { cn } from "@/utils/cn";

const STORAGE_KEY = "sshuttle-sidebar-collapsed";

const links = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/profiles", icon: ListTree, label: "Profiles" },
  { to: "/logs", icon: ScrollText, label: "Logs" },
  { to: "/dns", icon: Globe, label: "DNS" },
  { to: "/diagnostics", icon: Activity, label: "Diagnostics" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const n = !c;
      try {
        localStorage.setItem(STORAGE_KEY, n ? "1" : "0");
      } catch {
        /* ignore */
      }
      return n;
    });
  };

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-ink-800 bg-ink-950/80 py-4 transition-[width] duration-200 light:border-ink-200 light:bg-white",
        collapsed ? "w-[72px]" : "w-56",
      )}
    >
      <div className={cn("px-4 pb-4", collapsed && "px-2")}>
        <div className="flex items-center justify-between gap-1">
          {!collapsed && (
            <>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-500">
                sshuttle
              </div>
              <button
                type="button"
                onClick={toggle}
                aria-expanded={!collapsed}
                aria-controls="sidebar-nav"
                className="rounded p-1 text-ink-500 hover:bg-ink-900 hover:text-ink-200 light:hover:bg-ink-100"
                title="Collapse sidebar"
              >
                <ChevronLeft className="size-4" />
              </button>
            </>
          )}
          {collapsed && (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={!collapsed}
              aria-controls="sidebar-nav"
              className="mx-auto rounded p-1 text-ink-500 hover:bg-ink-900 hover:text-ink-200 light:hover:bg-ink-100"
              title="Expand sidebar"
            >
              <ChevronRight className="size-4" />
            </button>
          )}
        </div>
        {!collapsed && (
          <div className="mt-1 text-lg font-semibold text-ink-100 light:text-ink-900">
            VPN Control
          </div>
        )}
      </div>
      <nav
        id="sidebar-nav"
        aria-label="Primary"
        className="flex flex-1 flex-col gap-0.5 px-2"
      >
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                collapsed && "justify-center px-2",
                isActive
                  ? "bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/30 light:text-brand-700"
                  : "text-ink-400 hover:bg-ink-900 hover:text-ink-100 light:text-ink-600 light:hover:bg-ink-100 light:hover:text-ink-900",
              )
            }
          >
            <Icon className="size-4 shrink-0 opacity-90" />
            {!collapsed && label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
