import { useEffect } from "react";
import { Outlet } from "react-router-dom";

import { ChangelogDrawer } from "@/components/ChangelogDrawer";
import { CloseConfirmDialog } from "@/components/CloseConfirmDialog";
import { CommandPalette } from "@/components/CommandPalette";
import { KillSwitchOverlay } from "@/components/KillSwitchOverlay";
import { OnboardingModal } from "@/components/OnboardingModal";
import { Sidebar } from "@/components/Sidebar";
import { StatusBar } from "@/components/StatusBar";
import { useBoot } from "@/hooks/useBoot";
import { useCaptivePortalWatch } from "@/hooks/useCaptivePortal";
import { useCloseGuard } from "@/hooks/useCloseGuard";
import { useKillSwitchGuard } from "@/hooks/useKillSwitch";
import { useReconnectSupervisor } from "@/hooks/useReconnectSupervisor";
import { useThemeClass } from "@/hooks/useThemeClass";
import { useTraySync } from "@/hooks/useTraySync";
import { useAppStore } from "@/store/appStore";

export function AppShell() {
  useBoot();
  useThemeClass();
  useReconnectSupervisor();
  useTraySync();
  useKillSwitchGuard();
  useCaptivePortalWatch();
  useCloseGuard();

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
    <div className="flex h-full min-h-0 flex-col bg-ink-950 light:bg-ink-50">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-6 py-8">
            <Outlet />
          </div>
        </main>
      </div>
      <StatusBar />
      <KillSwitchOverlay />
      <OnboardingModal />
      <ChangelogDrawer />
      <CloseConfirmDialog />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
  );
}
