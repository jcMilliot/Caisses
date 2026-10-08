import { call } from "./client";

// Rôles (décision 2026-09-30) : lecteur = lecture seule partout ; admin = page Admin. Depuis le
// 2026-10-08, identification par le compte intranet (plus de mot de passe propre à Caisses) ;
// garde réelle côté Rust : session admin ouverte à la connexion intranet.
export type Role = "utilisateur" | "lecteur" | "admin";

// Administrateur permanent : son rôle n'est pas modifiable (garde aussi côté Rust).
export const ADMIN_PERMANENT = "AJC";

export const LIBELLE_ROLE: Record<Role, string> = {
  utilisateur: "Utilisateur",
  lecteur: "Lecteur (lecture seule)",
  admin: "Administrateur",
};

export interface Utilisateur {
  trigramme: string;
  premiere_connexion: string; // UTC, datetime('now')
  derniere_connexion: string;
  role: Role;
}

export const adminApi = {
  // Rouvre la session admin après « Verrouiller » : mot de passe intranet du compte du poste.
  unlock: (motDePasse: string) => call<void>("admin_unlock_intranet", { password: motDePasse }),
  sessionActive: () => call<boolean>("admin_session_active"),
  lock: () => call<void>("admin_lock"),
  enregistrerConnexion: (trigramme: string) => call<void>("enregistrer_connexion", { trigramme }),
  listUtilisateurs: () => call<Utilisateur[]>("list_utilisateurs"),
  getRole: (trigramme: string) => call<Role>("get_role", { trigramme }),
  setRole: (trigramme: string, role: Role) => call<void>("set_role_utilisateur", { trigramme, role }),
  ajouterUtilisateur: (trigramme: string, role: Role) => call<void>("ajouter_utilisateur", { trigramme, role }),
};
