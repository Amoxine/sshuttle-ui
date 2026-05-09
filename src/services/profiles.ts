import type { NewProfile, Profile, ProfileUpdate } from "@/types";
import { invoke } from "./tauri";

export interface PasswordStatus {
  key: string;
  has_value: boolean;
}

export const profilesService = {
  list: () => invoke<Profile[]>("list_profiles"),
  get: (id: string) => invoke<Profile>("get_profile", { id }),
  create: (profile: NewProfile) => invoke<Profile>("create_profile", { profile }),
  update: (id: string, patch: ProfileUpdate) =>
    invoke<Profile>("update_profile", { id, patch }),
  delete: (id: string) => invoke<void>("delete_profile", { id }),
  duplicate: (id: string) => invoke<Profile>("duplicate_profile", { id }),
  exportAll: () => invoke<string>("export_profiles"),
  importAll: (json: string) => invoke<Profile[]>("import_profiles", { json }),

  setPassword: (profileId: string, password: string) =>
    invoke<PasswordStatus>("set_profile_password", { profileId, password }),
  clearPassword: (profileId: string) =>
    invoke<void>("clear_profile_password", { profileId }),
  passwordStatus: (profileId: string) =>
    invoke<PasswordStatus>("profile_password_status", { profileId }),
};
