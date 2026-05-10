import { useEffect } from "react";
import { Outlet } from "react-router-dom";

import { ChangelogDrawer } from "@/components/ChangelogDrawer";
import { CloseConfirmDialog } from "@/components/CloseConfirmDialog";
import { ConsentModal } from "@/components/ConsentModal";
import { CommandPalette } from "@/components/CommandPalette";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { EulaModal } from "@/components/EulaModal";
import { KillSwitchOverlay } from "@/components/KillSwitchOverlay";
import { OnboardingModal } from "@/components/OnboardingModal";
import { ShortcutsOverlay } from "@/components/ShortcutsOverlay";
import { SkipToContent } from "@/components/SkipToContent";
import { Sidebar } from "@/components/Sidebar";
import { StatusBar } from "@/components/StatusBar";
import { useBoot } from "@/hooks/useBoot";
import { useDeepLinkRouter } from "@/hooks/useDeepLinkRouter";
import { useIdleDisconnect } from "@/hooks/useIdleDisconnect";
import { useCaptivePortalWatch } from "@/hooks/useCaptivePortal";
import { useCloseGuard } from "@/hooks/useCloseGuard";
import { useKillSwitchGuard } from "@/hooks/useKillSwitch";
import { useReconnectSupervisor } from "@/hooks/useReconnectSupervisor";
import { useThemeClass } from "@/hooks/useThemeClass";
import { useTraySync } from "@/hooks/useTraySync";
import { useAppStore } from "@/store/appStore";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function AppShell() {
  useBoot();
  useIdleDisconnect();
  useThemeClass();
  useReconnectSupervisor();
  useTraySync();
  useKillSwitchGuard();
  useCaptivePortalWatch();
  useCloseGuard();
  useDeepLinkRouter();

  const paletteOpen = useAppStore((s) => s.paletteOpen);
  const togglePalette = useAppStore((s) => s.togglePalette);
  const setPaletteOpen = useAppStore((s) => s.setPaletteOpen);
  const toggleShortcuts = useAppStore((s) => s.toggleShortcuts);

  // Global ⌘K / Ctrl+K toggle for the command palette.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        togglePalette();
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
      } else if (
        e.key === "?" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        if (isTypingTarget(document.activeElement)) return;
        e.preventDefault();
        toggleShortcuts();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePalette, setPaletteOpen, toggleShortcuts]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-ink-950 light:bg-ink-50">
      <SkipToContent />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main id="main-content" className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-6 py-8">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
      <StatusBar />
      <EulaModal />
      <KillSwitchOverlay />
      <OnboardingModal />
      <ConsentModal />
      <ShortcutsOverlay />
      <ChangelogDrawer />
      <CloseConfirmDialog />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
  );
}
