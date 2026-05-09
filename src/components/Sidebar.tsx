import { NavLink } from "react-router-dom";
import {
  Activity,
  LayoutDashboard,
  ListTree,
  ScrollText,
  Settings,
  Globe,
} from "lucide-react";

import { cn } from "@/utils/cn";

const links = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/profiles", icon: ListTree, label: "Profiles" },
  { to: "/logs", icon: ScrollText, label: "Logs" },
  { to: "/dns", icon: Globe, label: "DNS" },
  { to: "/diagnostics", icon: Activity, label: "Diagnostics" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-ink-800 bg-ink-950/80 py-4 light:border-ink-200 light:bg-white">
      <div className="px-4 pb-6">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-500">
          sshuttle
        </div>
        <div className="mt-1 text-lg font-semibold text-ink-100 light:text-ink-900">
          VPN Control
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-2">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                isActive
                  ? "bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/30 light:text-brand-700"
                  : "text-ink-400 hover:bg-ink-900 hover:text-ink-100 light:text-ink-600 light:hover:bg-ink-100 light:hover:text-ink-900",
              )
            }
          >
            <Icon className="size-4 shrink-0 opacity-90" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
