import { call } from "./client";

export interface UserStatus {
  configured: boolean;
  trigramme: string | null;
}

export const userApi = {
  getUserStatus: () => call<UserStatus>("get_user_status"),
  // motDePasse requis pour un trigramme protégé (AJC) — créé au premier choix s'il n'existe pas.
  setTrigramme: (trigramme: string, motDePasse?: string) =>
    call<void>("set_trigramme", { trigramme, motDePasse: motDePasse ?? null }),
};
