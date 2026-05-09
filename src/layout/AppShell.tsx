import { useEffect } from "react";
import { Outlet } from "react-router-dom";

import { CommandPalette } from "@/components/CommandPalette";
import { Sidebar } from "@/components/Sidebar";
import { useBoot } from "@/hooks/useBoot";
import { useReconnectSupervisor } from "@/hooks/useReconnectSupervisor";
import { useThemeClass } from "@/hooks/useThemeClass";
import { useTraySync } from "@/hooks/useTraySync";
import { useAppStore } from "@/store/appStore";

export function AppShell() {
  useBoot();
  useThemeClass();
  useReconnectSupervisor();
  useTraySync();

  const paletteOpen = useAppStore((s) => s.paletteOpen);
  const togglePalette = useAppStore((s) => s.togglePalette);
  const setPaletteOpen = useAppStore((s) => s.setPaletteOpen);

  // Global ⌘K / Ctrl+K toggle for the command palette.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        togglePalette();
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePalette, setPaletteOpen]);

  return (
    <div className="flex h-full min-h-0 bg-ink-950 light:bg-ink-50">
      <Sidebar />
      <main className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <Outlet />
        </div>
      </main>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
  );
}
