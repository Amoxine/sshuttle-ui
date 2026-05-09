import { useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Copy,
  Link2,
  Pencil,
  Plus,
  Star,
  Trash2,
  Upload,
} from "lucide-react";

import { connectionService } from "@/services/connection";
import { profilesService } from "@/services/profiles";
import { useAppStore } from "@/store/appStore";
import type { NewProfile, Profile } from "@/types";
import { DEFAULT_CONFIG } from "@/types";

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

export function ProfilesPage() {
  const profiles = useAppStore((s) => s.profiles);
  const loadProfiles = useAppStore((s) => s.loadProfiles);
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);

  const destroy = async (p: Profile) => {
    if (!confirm(`Delete profile “${p.name}”?`)) return;
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
    try {
      await connectionService.startByProfile(id, false);
      toast.success("Connecting…");
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <div className="animate-fade-in space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100 light:text-ink-900">
            Profiles
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            Saved sshuttle endpoints, routing, and SSH options.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
        {profiles.length === 0 && (
          <div className="card text-center text-sm text-ink-500">
            No profiles yet.{" "}
            <Link to="/profiles/new" className="text-brand-400 hover:underline">
              Create one
            </Link>
            .
          </div>
        )}
        {profiles.map((p) => (
          <article
            key={p.id}
            className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
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
              <button
                type="button"
                className="btn-primary"
                onClick={() => void quickConnect(p.id)}
              >
                <Link2 className="size-4" />
                Connect
              </button>
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
                className="btn-ghost text-red-400 hover:bg-red-500/10"
                onClick={() => void destroy(p)}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
