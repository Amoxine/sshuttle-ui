import { commands, type ProfileUpdate as BindingsProfileUpdate } from "@/bindings";
import type { NewProfile, PreflightReport, Profile, ProfileUpdate } from "@/types";
import { unwrap } from "./tauri";

// Bindings model `Option<T>` as `T | null`; the legacy frontend
// `ProfileUpdate` is a `Partial<>` so its fields are `T | undefined`.
// They serialize identically — coerce undefined → null at the boundary.
const toBindingsPatch = (patch: ProfileUpdate): BindingsProfileUpdate => ({
  name: patch.name ?? null,
  tags: patch.tags ?? null,
  favorite: patch.favorite ?? null,
  sort_order: patch.sort_order ?? null,
  config: patch.config ?? null,
});

export interface PasswordStatus {
  key: string;
  has_value: boolean;
}

export const profilesService = {
  list: (): Promise<Profile[]> =>
    unwrap(commands.listProfiles()) as Promise<Profile[]>,
  get: (id: string): Promise<Profile> =>
    unwrap(commands.getProfile(id)) as Promise<Profile>,
  create: (profile: NewProfile): Promise<Profile> =>
    unwrap(commands.createProfile(profile)) as Promise<Profile>,
  update: (id: string, patch: ProfileUpdate): Promise<Profile> =>
    unwrap(commands.updateProfile(id, toBindingsPatch(patch))) as Promise<Profile>,
  delete: async (id: string): Promise<void> => {
    await unwrap(commands.deleteProfile(id));
  },
  duplicate: (id: string): Promise<Profile> =>
    unwrap(commands.duplicateProfile(id)) as Promise<Profile>,
  exportAll: (): Promise<string> => unwrap(commands.exportProfiles()),
  importAll: (json: string): Promise<Profile[]> =>
    unwrap(commands.importProfiles(json)) as Promise<Profile[]>,

  setPassword: (profileId: string, password: string): Promise<PasswordStatus> =>
    unwrap(commands.setProfilePassword(profileId, password)),
  clearPassword: async (profileId: string): Promise<void> => {
    await unwrap(commands.clearProfilePassword(profileId));
  },
  passwordStatus: (profileId: string): Promise<PasswordStatus> =>
    commands.profilePasswordStatus(profileId),

  reorder: async (orderedIds: string[]): Promise<void> => {
    await unwrap(commands.reorderProfiles({ orderedIds }));
  },

  /** Create profiles from ~/.ssh/config Host blocks */
  importFromSshConfig: (hostLabels?: string[]): Promise<Profile[]> =>
    unwrap(
      commands.importProfilesFromSshConfig({ hostLabels: hostLabels ?? null }),
    ) as Promise<Profile[]>,

  preflight: (profileId: string): Promise<PreflightReport> =>
    unwrap(commands.preflightProfile({ profileId })) as Promise<PreflightReport>,
};
