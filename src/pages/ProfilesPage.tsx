import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  CheckCircle2,
  Copy,
  Filter,
  Link2,
  Pencil,
  Plus,
  Search,
  ShieldOff,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import clsx from "clsx";

import { useConnectionStatus } from "@/hooks/useConnectionStatus";
import { connectionService } from "@/services/connection";
import { profilesService } from "@/services/profiles";
import { useAppStore } from "@/store/appStore";
import type { NewProfile, Profile } from "@/types";
import { DEFAULT_CONFIG } from "@/types";

type SortKey = "recent" | "name" | "host" | "created";

function mapExportToNewProfiles(json: string): NewProfile[] {
  const data = JSON.parse(json) as unknown;
  if (!Array.isArray(data)) {
    throw new Error("Expected a JSON array of profiles");
  }
  return data.map((raw: unknown) => {
    const p = raw as Partial<Profile>;
    if (!p?.name || !p?.config) {
      throw new Error("Each profile needs name and config");
    }
    return {
      name: p.name,
      tags: p.tags ?? [],
      favorite: p.favorite ?? false,
      config: { ...DEFAULT_CONFIG, ...p.config },
    };
  });
}

function compareProfiles(a: Profile, b: Profile, key: SortKey): number {
  switch (key) {
    case "name":
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    case "host":
      return a.config.host.localeCompare(b.config.host);
    case "created":
      return b.created_at.localeCompare(a.created_at);
    case "recent":
    default:
      return b.updated_at.localeCompare(a.updated_at);
  }
}

export function ProfilesPage() {
  const profiles = useAppStore((s) => s.profiles);
  const loadProfiles = useAppStore((s) => s.loadProfiles);
  const setPaletteOpen = useAppStore((s) => s.setPaletteOpen);
  const disarmReconnect = useAppStore((s) => s.disarmReconnect);
  const refreshConnection = useAppStore((s) => s.refreshConnection);
  const status = useConnectionStatus();
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of profiles) for (const t of p.tags) set.add(t);
    return Array.from(set).sort();
  }, [profiles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return profiles
      .filter((p) => {
        if (activeTags.size > 0) {
          const has = p.tags.some((t) => activeTags.has(t));
          if (!has) return false;
        }
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.config.host.toLowerCase().includes(q) ||
          (p.config.username ?? "").toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
        );
      })
      .slice()
      .sort((a, b) => {
        // Favorites pinned to the top regardless of sort.
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return compareProfiles(a, b, sortKey);
      });
  }, [profiles, search, activeTags, sortKey]);

  const toggleTag = (t: string) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const destroy = async (p: Profile) => {
    if (!confirm(`Delete profile "${p.name}"?`)) return;
    try {
      await profilesService.delete(p.id);
      toast.success("Profile deleted");
      await loadProfiles();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const dup = async (id: string) => {
    try {
      await profilesService.duplicate(id);
      toast.success("Duplicated");
      await loadProfiles();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const toggleFavorite = async (p: Profile) => {
    try {
      await profilesService.update(p.id, { favorite: !p.favorite });
      await loadProfiles();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const exportAll = async () => {
    try {
      const json = await profilesService.exportAll();
      await navigator.clipboard.writeText(json);
      toast.success("Copied profiles JSON to clipboard");
    } catch (e) {
      toast.error(String(e));
    }
  };

  const importPasted = async () => {
    try {
      const news = mapExportToNewProfiles(importText);
      await profilesService.importAll(JSON.stringify(news));
      toast.success(`Imported ${news.length} profile(s)`);
      setImportText("");
      setShowImport(false);
      await loadProfiles();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const quickConnect = async (id: string) => {
    if (status.isProfileActive(id)) {
      toast(`Already connected to "${status.activeProfileName ?? "this profile"}".`, {
        icon: "✓",
      });
      return;
    }
    if (status.isActive) {
      toast.error(
        `Already connected to "${status.activeProfileName ?? "another profile"}". Disconnect first.`,
      );
      return;
    }
    try {
      await connectionService.startByProfile(id, false);
      toast.success("Connecting…");
    } catch (e) {
      toast.error(String(e));
    }
  };

  const disconnectActive = async () => {
    try {
      disarmReconnect();
      await connectionService.stop();
      toast.success("Disconnected");
      await refreshConnection();
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100 light:text-ink-900">
            Profiles
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            Saved sshuttle endpoints, routing, and SSH options. Press{" "}
            <kbd className="rounded border border-ink-700 bg-ink-900 px-1.5 py-0.5 font-mono text-[10px] light:border-ink-300 light:bg-ink-50">
              ⌘K
            </kbd>{" "}
            for quick-connect.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setPaletteOpen(true)}
          >
            <Search className="size-4" />
            Quick connect
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void exportAll()}
          >
            <Copy className="size-4" />
            Export JSON
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowImport((v) => !v)}
          >
            <Upload className="size-4" />
            Import
          </button>
          <Link to="/profiles/new" className="btn-primary">
            <Plus className="size-4" />
            New profile
          </Link>
        </div>
      </header>

      <div className="card flex flex-wrap items-end gap-4">
        <label className="relative block flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
          <input
            className="input pl-9"
            placeholder="Search by name, host, user, or tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="label">Sort by</span>
          <select
            className="input"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            <option value="recent">Recently updated</option>
            <option value="name">Name (A–Z)</option>
            <option value="host">Host (A–Z)</option>
            <option value="created">Recently created</option>
          </select>
        </label>
      </div>

      {allTags.length > 0 && (
        <div className="card flex flex-wrap items-center gap-2">
          <span className="label flex items-center gap-1">
            <Filter className="size-3" />
            Tags
          </span>
          {allTags.map((t) => {
            const on = activeTags.has(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                className={clsx(
                  "rounded-full border px-3 py-1 text-xs",
                  on
                    ? "border-brand-500/60 bg-brand-500/20 text-brand-100"
                    : "border-ink-800 bg-ink-900 text-ink-300 hover:text-ink-100 light:border-ink-200 light:bg-white light:text-ink-600",
                )}
              >
                {t}
              </button>
            );
          })}
          {activeTags.size > 0 && (
            <button
              type="button"
              className="text-xs text-ink-400 hover:text-ink-200 underline-offset-2 hover:underline"
              onClick={() => setActiveTags(new Set())}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {showImport && (
        <div className="card space-y-3">
          <p className="text-sm text-ink-400">
            Paste JSON (array of profiles). For exports from this app, fields
            like <code className="font-mono text-brand-300">id</code> are
            ignored — only{" "}
            <code className="font-mono text-brand-300">name</code> and{" "}
            <code className="font-mono text-brand-300">config</code> matter.
          </p>
          <textarea
            className="input min-h-[140px] font-mono text-xs"
            placeholder="[…]"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <button
            type="button"
            className="btn-primary"
            onClick={() => void importPasted()}
          >
            Import
          </button>
        </div>
      )}

      <div className="grid gap-4">
        {filtered.length === 0 && (
          <div className="card text-center text-sm text-ink-500">
            {profiles.length === 0 ? (
              <>
                No profiles yet.{" "}
                <Link to="/profiles/new" className="text-brand-400 hover:underline">
                  Create one
                </Link>
                .
              </>
            ) : (
              "No profiles match the current filters."
            )}
          </div>
        )}
        {filtered.map((p) => {
          const isActive = status.isProfileActive(p.id);
          const blockedByOther = !isActive && status.isActive;
          return (
            <article
              key={p.id}
              className={clsx(
                "card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
                isActive &&
                  "ring-1 ring-emerald-500/40 bg-emerald-500/5",
              )}
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    aria-label={p.favorite ? "Unfavorite" : "Favorite"}
                    className="text-amber-400 hover:text-amber-300"
                    onClick={() => void toggleFavorite(p)}
                  >
                    <Star
                      className="size-5"
                      fill={p.favorite ? "currentColor" : "none"}
                    />
                  </button>
                  <h2 className="text-lg font-semibold text-ink-100 light:text-ink-900">
                    {p.name}
                  </h2>
                  {isActive && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-300 ring-1 ring-emerald-500/40">
                      <CheckCircle2 className="size-3" />
                      Connected
                    </span>
                  )}
                  {p.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-ink-800 px-2 py-0.5 text-xs text-ink-300 light:bg-ink-100 light:text-ink-700"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <p className="font-mono text-sm text-brand-300">
                  {p.config.username
                    ? `${p.config.username}@${p.config.host}`
                    : p.config.host}
                  {p.config.port ? `:${p.config.port}` : ""}
                </p>
                <p className="text-xs text-ink-500">
                  Routes: {p.config.subnets.join(", ") || "—"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {isActive ? (
                  <button
                    type="button"
                    className="btn-danger inline-flex items-center gap-2"
                    onClick={() => void disconnectActive()}
                  >
                    <ShieldOff className="size-4" />
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-primary inline-flex items-center gap-2 disabled:opacity-60"
                    disabled={blockedByOther}
                    title={
                      blockedByOther
                        ? `Already connected to "${status.activeProfileName ?? "another profile"}"`
                        : undefined
                    }
                    onClick={() => void quickConnect(p.id)}
                  >
                    <Link2 className="size-4" />
                    Connect
                  </button>
                )}
                <Link
                  to={`/profiles/${p.id}/edit`}
                  className="btn-secondary inline-flex items-center gap-1"
                >
                  <Pencil className="size-4" />
                  Edit
                </Link>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void dup(p.id)}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className={clsx(
                    "btn-ghost text-red-400 hover:bg-red-500/10",
                    isActive && "opacity-40 pointer-events-none",
                  )}
                  disabled={isActive}
                  title={isActive ? "Disconnect before deleting" : undefined}
                  onClick={() => void destroy(p)}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </article>
          );
        })}
      </div>

    </div>
  );
}
