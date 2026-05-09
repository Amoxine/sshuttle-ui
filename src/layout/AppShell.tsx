import { Outlet } from "react-router-dom";

import { Sidebar } from "@/components/Sidebar";
import { useBoot } from "@/hooks/useBoot";
import { useReconnectSupervisor } from "@/hooks/useReconnectSupervisor";
import { useThemeClass } from "@/hooks/useThemeClass";

export function AppShell() {
  useBoot();
  useThemeClass();
  useReconnectSupervisor();

  return (
    <div className="flex h-full min-h-0 bg-ink-950 light:bg-ink-50">
      <Sidebar />
      <main className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
