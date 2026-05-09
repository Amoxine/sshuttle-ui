import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import { ProfileForm } from "@/components/ProfileForm";
import { profilesService } from "@/services/profiles";
import { useAppStore } from "@/store/appStore";
import type { NewProfile } from "@/types";

export function ProfileEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const loadProfiles = useAppStore((s) => s.loadProfiles);
  const [loading, setLoading] = useState(!!id);
  const [initial, setInitial] = useState<Awaited<
    ReturnType<typeof profilesService.get>
  > | null>(null);

  const isNew = !id;

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const p = await profilesService.get(id);
        if (!cancelled) {
          setInitial(p);
        }
      } catch (e) {
        toast.error(String(e));
        navigate("/profiles");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  const submit = async (payload: NewProfile) => {
    if (isNew) {
      await profilesService.create(payload);
      toast.success("Profile created");
    } else if (id) {
      await profilesService.update(id, payload);
      toast.success("Saved");
    }
    await loadProfiles();
    navigate("/profiles");
  };

  if (loading) {
    return (
      <div className="animate-fade-in py-20 text-center text-ink-500">
        Loading profile…
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-8">
      <header>
        <Link
          to="/profiles"
          className="text-sm text-brand-400 hover:underline"
        >
          ← Profiles
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink-100 light:text-ink-900">
          {isNew ? "New profile" : `Edit ${initial?.name ?? "profile"}`}
        </h1>
        <p className="mt-1 text-sm text-ink-400">
          All fields map to sshuttle/SSH flags — preview updates as you type.
        </p>
      </header>

      <ProfileForm
        mode={isNew ? "create" : "edit"}
        initial={initial}
        onSubmit={submit}
        onCancel={() => navigate("/profiles")}
      />
    </div>
  );
}
