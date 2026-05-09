import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { AnimatePresence, motion } from "framer-motion";
import { Command } from "cmdk";
import {
  Activity,
  BookOpen,
  CheckCircle2,
  KeyRound,
  Link2,
  Monitor,
  Network,
  Search,
  Settings,
  ShieldOff,
} from "lucide-react";

import { useConnectionStatus } from "@/hooks/useConnectionStatus";
import { connectionService } from "@/services/connection";
import { useAppStore } from "@/store/appStore";
import { toastError } from "@/utils/toastError";

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  /**
   * If provided, picking a profile invokes this callback instead of the
   * default Connect action. Useful for embedding the palette inside a
   * page that wants to handle the selection itself.
   */
  onPick?: (profileId: string) => void;
}

/**
 * Spotlight-style quick action bar (Cmd+K) with profile quick-connect,
 * navigation jumps, and connection actions.
 */
export function CommandPalette({ open, onClose, onPick }: CommandPaletteProps) {
  const profiles = useAppStore((s) => s.profiles);
  const disarmReconnect = useAppStore((s) => s.disarmReconnect);
  const settings = useAppStore((s) => s.settings);
  const saveSettings = useAppStore((s) => s.saveSettings);
  const setChangelogOpen = useAppStore((s) => s.setChangelogOpen);
  const status = useConnectionStatus();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  const sortedProfiles = useMemo(() => {
    return [...profiles].sort((a, b) => {
      // Active profile first, then favorites, then alphabetical.
      const aActive = status.isProfileActive(a.id) ? 0 : 1;
      const bActive = status.isProfileActive(b.id) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }, [profiles, status]);

  const connectTo = async (id: string) => {
    if (status.isProfileActive(id)) {
      toast(
        `Already connected to "${status.activeProfileName ?? "this profile"}".`,
        { icon: "✓" },
      );
      onClose();
      return;
    }
    if (status.isActive) {
      toast.error(
        `Already connected to "${status.activeProfileName ?? "another profile"}". Disconnect first.`,
      );
      onClose();
      return;
    }
    if (onPick) {
      onPick(id);
      return;
    }
    onClose();
    try {
      await connectionService.startByProfile(id, false);
    } catch (e) {
      toastError(e);
    }
  };

  const disconnectNow = async () => {
    onClose();
    try {
      disarmReconnect();
      await connectionService.stop();
    } catch {
      /* upstream toaster */
    }
  };

  const cycleTheme = async () => {
    const order = ["system", "dark", "light"] as const;
    const idx = order.indexOf(settings.theme as (typeof order)[number]);
    const next = order[(idx < 0 ? 0 : idx + 1) % order.length];
    await saveSettings({ ...settings, theme: next });
    onClose();
  };

  const openChangelog = () => {
    setChangelogOpen(true);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <motion.div
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl light:border-ink-200 light:bg-white"
            initial={{ scale: 0.97, y: -8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.97, y: -8 }}
            onClick={(e) => e.stopPropagation()}
          >
            <Command label="Quick actions" loop>
              <div className="flex items-center gap-2 border-b border-ink-800 px-4 py-3 light:border-ink-200">
                <Search className="size-4 text-ink-500" />
                <Command.Input
                  autoFocus
                  className="flex-1 bg-transparent text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none light:text-ink-900"
                  placeholder="Search profiles, navigate, run commands…"
                  value={search}
                  onValueChange={setSearch}
                />
                <kbd className="rounded border border-ink-700 bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-ink-400 light:border-ink-200 light:bg-ink-50">
                  esc
                </kbd>
              </div>
              <Command.List className="max-h-[60vh] overflow-auto p-1">
                <Command.Empty className="px-4 py-6 text-center text-sm text-ink-500">
                  Nothing matches.
                </Command.Empty>

                {sortedProfiles.length > 0 && (
                  <Command.Group
                    heading="Profiles"
                    className="px-2 pt-2 text-xs uppercase tracking-wide text-ink-500"
                  >
                    {sortedProfiles.map((p) => {
                      const isActive = status.isProfileActive(p.id);
                      return (
                        <Command.Item
                          key={p.id}
                          value={`profile ${p.name} ${p.config.host} ${p.tags.join(" ")}`}
                          onSelect={() => void connectTo(p.id)}
                          className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-200 aria-selected:bg-brand-500/15 aria-selected:text-brand-100 light:text-ink-800"
                        >
                          {isActive ? (
                            <CheckCircle2 className="size-4 text-emerald-400" />
                          ) : (
                            <Link2 className="size-4 text-brand-400" />
                          )}
                          <div className="flex-1">
                            <div className="flex items-center gap-1">
                              {p.favorite && (
                                <span className="text-amber-400">★</span>
                              )}
                              <span>{p.name}</span>
                              {isActive && (
                                <span className="ml-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                                  Connected
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-ink-500">
                              {p.config.username
                                ? `${p.config.username}@${p.config.host}`
                                : p.config.host}
                            </div>
                          </div>
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                )}

                <Command.Group
                  heading="Actions"
                  className="px-2 pt-2 text-xs uppercase tracking-wide text-ink-500"
                >
                  {status.isActive && (
                    <Command.Item
                      value="disconnect"
                      onSelect={() => void disconnectNow()}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-red-300 aria-selected:bg-red-500/15"
                    >
                      <ShieldOff className="size-4" />
                      Disconnect
                    </Command.Item>
                  )}
                </Command.Group>

                <Command.Group
                  heading="App"
                  className="px-2 pt-2 text-xs uppercase tracking-wide text-ink-500"
                >
                  <Command.Item
                    value="theme toggle appearance dark light"
                    onSelect={() => void cycleTheme()}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-200 aria-selected:bg-brand-500/15 light:text-ink-800"
                  >
                    <Monitor className="size-4 text-ink-400" />
                    Cycle theme ({settings.theme})
                  </Command.Item>
                  <Command.Item
                    value="changelog whats new"
                    onSelect={openChangelog}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-200 aria-selected:bg-brand-500/15 light:text-ink-800"
                  >
                    <BookOpen className="size-4 text-ink-400" />
                    What’s new (changelog)
                  </Command.Item>
                </Command.Group>

                <Command.Group
                  heading="Navigate"
                  className="px-2 pt-2 text-xs uppercase tracking-wide text-ink-500"
                >
                  {[
                    {
                      to: "/",
                      label: "Dashboard",
                      icon: Activity,
                    },
                    {
                      to: "/profiles",
                      label: "Profiles",
                      icon: Link2,
                    },
                    {
                      to: "/logs",
                      label: "Logs",
                      icon: Network,
                    },
                    {
                      to: "/diagnostics",
                      label: "Diagnostics",
                      icon: KeyRound,
                    },
                    {
                      to: "/settings",
                      label: "Settings",
                      icon: Settings,
                    },
                  ].map(({ to, label, icon: Icon }) => (
                    <Command.Item
                      key={to}
                      value={`go ${label}`}
                      onSelect={() => {
                        onClose();
                        navigate(to);
                      }}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-200 aria-selected:bg-brand-500/15 light:text-ink-800"
                    >
                      <Icon className="size-4 text-ink-400" />
                      Go to {label}
                    </Command.Item>
                  ))}
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
