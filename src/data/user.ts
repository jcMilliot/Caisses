import { call } from "./client";

export interface UserStatus {
  configured: boolean;
  trigramme: string | null;
}

export const userApi = {
  getUserStatus: () => call<UserStatus>("get_user_status"),
  // motDePasse requis pour un administrateur — créé au premier choix s'il n'existe pas ; le code
  // de secours est alors renvoyé (à afficher une seule fois).
  setTrigramme: (trigramme: string, motDePasse?: string) =>
    call<string | null>("set_trigramme", { trigramme, motDePasse: motDePasse ?? null }),
};
