import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { KeyRound, ShieldCheck, ShieldOff } from "lucide-react";

import { connectionService } from "@/services/connection";
import { profilesService } from "@/services/profiles";
import { systemService } from "@/services/system";
import { PROFILE_TEMPLATES, applyTemplate } from "@/constants/profileTemplates";
import type { NewProfile, Profile, SshuttleConfig } from "@/types";
import { DEFAULT_CONFIG } from "@/types";

function linesToList(s: string): string[] {
  return s
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function listToLines(list: string[]): string {
  return list.join("\n");
}

function tagsToStr(tags: string[]): string {
  return tags.join(", ");
}

function strToTags(s: string): string[] {
  return s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

interface ProfileFormProps {
  mode: "create" | "edit";
  initial?: Profile | null;
  onSubmit: (payload: NewProfile) => Promise<void>;
  onCancel: () => void;
}

export function ProfileForm({
  mode,
  initial,
  onSubmit,
  onCancel,
}: ProfileFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [tagsStr, setTagsStr] = useState(tagsToStr(initial?.tags ?? []));
  const [favorite, setFavorite] = useState(initial?.favorite ?? false);
  const [cfg, setCfg] = useState<SshuttleConfig>(
    initial?.config ?? { ...DEFAULT_CONFIG },
  );
  const [preview, setPreview] = useState<string>("");
  const [keys, setKeys] = useState<Awaited<
    ReturnType<typeof systemService.sshKeys>
  >>([]);
  const [saving, setSaving] = useState(false);

  // Password keychain state — only meaningful for existing profiles.
  const profileId = initial?.id ?? null;
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    void systemService
      .sshKeys()
      .then(setKeys)
      .catch(() => setKeys([]));
  }, []);

  useEffect(() => {
    if (!profileId) {
      setPasswordSaved(false);
      return;
    }
    void profilesService
      .passwordStatus(profileId)
      .then((s) => setPasswordSaved(s.has_value))
      .catch(() => setPasswordSaved(false));
  }, [profileId]);

  const savePassword = async () => {
    if (!profileId) {
      toast.error("Save the profile first, then add a password.");
      return;
    }
    if (!passwordDraft) return;
    setPasswordBusy(true);
    try {
      const s = await profilesService.setPassword(profileId, passwordDraft);
      setPasswordSaved(s.has_value);
      setPasswordDraft("");
      toast.success("Password saved to keychain");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setPasswordBusy(false);
    }
  };

  const clearPassword = async () => {
    if (!profileId) return;
    setPasswordBusy(true);
    try {
      await profilesService.clearPassword(profileId);
      setPasswordSaved(false);
      toast.success("Password removed from keychain");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setPasswordBusy(false);
    }
  };

  const updateCfg = useCallback((patch: Partial<SshuttleConfig>) => {
    setCfg((c) => ({ ...c, ...patch }));
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void connectionService
        .preview(cfg)
        .then((o) => setPreview(o.command))
        .catch(() => setPreview("(fix validation errors to preview)"));
    }, 320);
    return () => window.clearTimeout(t);
  }, [cfg]);

  const save = async () => {
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        tags: strToTags(tagsStr),
        favorite,
        config: cfg,
      });
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-10 pb-16">
      <section className="card space-y-4">
        <h2 className="text-sm font-semibold text-ink-200">Identity</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="label">Profile name</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Work VPN"
            />
          </label>
          <label className="block space-y-1">
            <span className="label">Tags (comma-separated)</span>
            <input
              className="input"
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="corp, aws"
            />
          </label>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-300">
          <input
            type="checkbox"
            checked={favorite}
            onChange={(e) => setFavorite(e.target.checked)}
            className="rounded border-ink-600 text-brand-500"
          />
          Favorite (sorted to top)
        </label>
      </section>

      {mode === "create" && (
        <section className="card space-y-3">
          <h2 className="text-sm font-semibold text-ink-200">
            Quick templates
          </h2>
          <p className="text-xs text-ink-500">
            Routing presets — tweak host and subnets after applying.
          </p>
          <div className="flex flex-wrap gap-2">
            {PROFILE_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                className="btn-secondary text-xs"
                title={t.description}
                onClick={() => setCfg(applyTemplate(cfg, t))}
              >
                {t.title}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="card space-y-4">
        <h2 className="text-sm font-semibold text-ink-200">SSH endpoint</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="label">Host</span>
            <input
              className="input font-mono text-sm"
              value={cfg.host}
              onChange={(e) => updateCfg({ host: e.target.value })}
              placeholder="vpn.example.com"
            />
          </label>
          <label className="block space-y-1">
            <span className="label">Port (optional)</span>
            <input
              className="input font-mono text-sm"
              value={cfg.port ?? ""}
              onChange={(e) => {
                const v = e.target.value.trim();
                updateCfg({
                  port: v === "" ? null : Number.parseInt(v, 10) || null,
                });
              }}
              placeholder="22"
            />
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className="label">Username (optional)</span>
            <input
              className="input font-mono text-sm"
              value={cfg.username}
              onChange={(e) => updateCfg({ username: e.target.value })}
              placeholder="defaults to your OS user when empty"
            />
          </label>
        </div>

        <div className="space-y-2">
          <span className="label">Authentication</span>
          <div className="flex flex-wrap gap-4 text-sm">
            {(
              [
                ["agent", "SSH agent"],
                ["key", "Private key file"],
                ["password", "Password (interactive)"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="auth"
                  checked={cfg.auth === value}
                  onChange={() => updateCfg({ auth: value })}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        {cfg.auth === "key" && (
          <label className="block space-y-1">
            <span className="label">Private key path</span>
            <input
              className="input font-mono text-sm"
              list="ssh-key-paths"
              value={cfg.identityFile ?? ""}
              onChange={(e) =>
                updateCfg({
                  identityFile: e.target.value.trim() || null,
                })
              }
              placeholder="/Users/you/.ssh/id_ed25519"
            />
            <datalist id="ssh-key-paths">
              {keys.map((k) => (
                <option key={k.path} value={k.path}>
                  {k.kind ?? "key"} {k.comment ?? ""}
                </option>
              ))}
            </datalist>
            {!keys.length && (
              <p className="text-xs text-ink-500">
                No keys auto-discovered in ~/.ssh — enter a path manually.
              </p>
            )}
          </label>
        )}

        {cfg.auth === "password" && (
          <div className="space-y-3 rounded-lg border border-ink-800 bg-ink-950/40 p-4 light:border-ink-200 light:bg-ink-50">
            <div className="flex items-center gap-2">
              <KeyRound className="size-4 text-brand-300" />
              <span className="label">Saved password (keychain)</span>
              {profileId &&
                (passwordSaved ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-emerald-500/30">
                    <ShieldCheck className="size-3" />
                    Saved
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300 ring-1 ring-amber-500/30">
                    <ShieldOff className="size-3" />
                    Not saved
                  </span>
                ))}
            </div>

            {!profileId ? (
              <p className="text-xs text-ink-500">
                Create the profile first — the password is stored in the OS
                keychain and tied to the profile id.
              </p>
            ) : (
              <>
                <p className="text-xs text-ink-500">
                  Stored in the platform keychain (macOS Keychain, Linux Secret
                  Service, Windows Credential Manager). The app uses{" "}
                  <code className="font-mono text-brand-300">sshpass</code> to
                  feed it to ssh non-interactively.
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="password"
                    autoComplete="new-password"
                    className="input flex-1 font-mono text-sm"
                    placeholder={passwordSaved ? "Enter to replace…" : "Enter password"}
                    value={passwordDraft}
                    onChange={(e) => setPasswordDraft(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={passwordBusy || !passwordDraft}
                    onClick={() => void savePassword()}
                  >
                    {passwordSaved ? "Replace" : "Save"}
                  </button>
                  {passwordSaved && (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={passwordBusy}
                      onClick={() => void clearPassword()}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-ink-500">
                  Requires{" "}
                  <code className="font-mono text-brand-300">sshpass</code>{" "}
                  installed on this machine. macOS:{" "}
                  <code className="font-mono">
                    brew install hudochenkov/sshpass/sshpass
                  </code>
                  . Debian/Ubuntu:{" "}
                  <code className="font-mono">apt install sshpass</code>.
                </p>
              </>
            )}
          </div>
        )}
      </section>

      <section className="card space-y-4">
        <h2 className="text-sm font-semibold text-ink-200">
          Jump hosts & SSH options
        </h2>
        <label className="block space-y-1">
          <span className="label">
            ProxyJump hosts (one per line, bastion@host:port)
          </span>
          <textarea
            className="input min-h-[88px] font-mono text-xs"
            value={listToLines(cfg.jumpHosts)}
            onChange={(e) =>
              updateCfg({ jumpHosts: linesToList(e.target.value) })
            }
          />
        </label>
        <label className="block space-y-1">
          <span className="label">
            Extra SSH config options (one per line, passed as{" "}
            <code className="text-brand-300">-o key=value</code>)
          </span>
          <textarea
            className="input min-h-[88px] font-mono text-xs"
            placeholder={"ServerAliveInterval=30\nStrictHostKeyChecking=accept-new"}
            value={listToLines(cfg.extraSshOptions)}
            onChange={(e) =>
              updateCfg({ extraSshOptions: linesToList(e.target.value) })
            }
          />
        </label>
      </section>

      <section className="card space-y-4">
        <h2 className="text-sm font-semibold text-ink-200">Routing</h2>
        <p className="text-xs text-ink-500">
          Include subnets (CIDR or sshuttle notation). Use{" "}
          <code className="font-mono text-brand-300">0/0</code> for a full
          tunnel. Excludes use <code className="font-mono text-brand-300">-x</code>{" "}
          under the hood (LAN bypass, split tunneling).
        </p>
        <label className="block space-y-1">
          <span className="label">Include routes (one per line)</span>
          <textarea
            className="input min-h-[100px] font-mono text-xs"
            value={listToLines(cfg.subnets)}
            onChange={(e) =>
              updateCfg({ subnets: linesToList(e.target.value) })
            }
          />
        </label>
        <label className="block space-y-1">
          <span className="label">Exclude routes (one per line)</span>
          <textarea
            className="input min-h-[80px] font-mono text-xs"
            value={listToLines(cfg.excludeSubnets)}
            onChange={(e) =>
              updateCfg({ excludeSubnets: linesToList(e.target.value) })
            }
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-ink-300">
            <input
              type="checkbox"
              checked={cfg.autoHosts}
              onChange={(e) => updateCfg({ autoHosts: e.target.checked })}
            />
            Auto hosts
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-300">
            <input
              type="checkbox"
              checked={cfg.autoNets}
              onChange={(e) => updateCfg({ autoNets: e.target.checked })}
            />
            Auto nets
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-300">
            <input
              type="checkbox"
              checked={cfg.ipv6}
              onChange={(e) => updateCfg({ ipv6: e.target.checked })}
            />
            IPv6
          </label>
          <label
            className="flex items-center gap-2 text-sm text-ink-300"
            title="Sshuttle's latency control is on by default. Uncheck to add --no-latency-control (sacrifices latency for higher throughput on synthetic benchmarks)."
          >
            <input
              type="checkbox"
              checked={cfg.latencyControl}
              onChange={(e) =>
                updateCfg({ latencyControl: e.target.checked })
              }
            />
            Latency control (recommended)
          </label>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-sm font-semibold text-ink-200">DNS</h2>
        <label className="flex items-center gap-2 text-sm text-ink-300">
          <input
            type="checkbox"
            checked={cfg.dns}
            onChange={(e) => updateCfg({ dns: e.target.checked })}
          />
          Tunnel DNS (<code className="font-mono text-brand-300">--dns</code>)
        </label>
        <label className="block space-y-1">
          <span className="label">NS hosts (optional, one per line)</span>
          <textarea
            className="input min-h-[72px] font-mono text-xs"
            value={listToLines(cfg.nsHosts)}
            onChange={(e) =>
              updateCfg({ nsHosts: linesToList(e.target.value) })
            }
          />
        </label>
      </section>

      <section className="card space-y-4">
        <h2 className="text-sm font-semibold text-ink-200">Advanced</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-ink-300">
            <input
              type="checkbox"
              checked={cfg.compression}
              onChange={(e) => updateCfg({ compression: e.target.checked })}
            />
            SSH compression (<code className="font-mono">-C</code>)
          </label>
          <label className="block space-y-1">
            <span className="label">Verbosity (0–3 × -v)</span>
            <select
              className="input"
              value={cfg.verbosity}
              onChange={(e) =>
                updateCfg({ verbosity: Number(e.target.value) as 0 | 1 | 2 | 3 })
              }
            >
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className="label">Remote Python path (optional)</span>
            <input
              className="input font-mono text-sm"
              value={cfg.remotePython ?? ""}
              onChange={(e) =>
                updateCfg({
                  remotePython: e.target.value.trim() || null,
                })
              }
              placeholder="/usr/bin/python3"
            />
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className="label">Listen address (optional)</span>
            <input
              className="input font-mono text-sm"
              value={cfg.listen ?? ""}
              onChange={(e) =>
                updateCfg({ listen: e.target.value.trim() || null })
              }
              placeholder="127.0.0.1:0"
            />
          </label>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-sm font-semibold text-ink-200">Automation hooks</h2>
        <label className="block space-y-1">
          <span className="label">Pre-connect script path</span>
          <input
            className="input font-mono text-sm"
            value={cfg.preConnectScript ?? ""}
            onChange={(e) =>
              updateCfg({
                preConnectScript: e.target.value.trim() || null,
              })
            }
          />
        </label>
        <label className="block space-y-1">
          <span className="label">Post-disconnect script path</span>
          <input
            className="input font-mono text-sm"
            value={cfg.postDisconnectScript ?? ""}
            onChange={(e) =>
              updateCfg({
                postDisconnectScript: e.target.value.trim() || null,
              })
            }
          />
        </label>
        <p className="text-xs text-ink-500">
          Scripts are not executed by this UI yet — paths are stored for future
          automation / CLI parity.
        </p>
      </section>

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold text-ink-200">Command preview</h2>
        <pre className="max-h-56 overflow-auto rounded-lg border border-ink-800 bg-ink-950 p-4 font-mono text-xs text-brand-200 light:border-ink-200 light:bg-white light:text-ink-900">
          {preview || "…"}
        </pre>
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={saving || !name.trim()}
          onClick={() => void save()}
        >
          {mode === "create" ? "Create profile" : "Save changes"}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
