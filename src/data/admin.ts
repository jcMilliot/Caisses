import { call } from "./client";

export interface CompteStatus {
  requiert_mot_de_passe: boolean;
  mot_de_passe_defini: boolean;
  code_secours_defini: boolean;
}

// Rôles (décision 2026-09-30) : lecteur = lecture seule partout ; admin = page Admin, avec un
// mot de passe personnel (garde réelle côté Rust : session ouverte par mot de passe).
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
  mot_de_passe_defini: boolean; // administrateur ayant déjà créé son mot de passe
}

export const adminApi = {
  compteStatus: (trigramme: string) => call<CompteStatus>("get_compte_status", { trigramme }),
  // Renvoie le code de secours quand le mot de passe vient d'être créé (à afficher une fois).
  unlock: (trigramme: string, motDePasse: string) => call<string | null>("admin_unlock", { trigramme, motDePasse }),
  // Mot de passe oublié : renvoie le nouveau code de secours (l'ancien ne sert plus).
  reinitialiserParCode: (trigramme: string, code: string, nouveau: string) =>
    call<string>("reinitialiser_mot_de_passe_par_code", { trigramme, code, nouveau }),
  regenererCodeSecours: () => call<string>("regenerer_code_secours"),
  // Un admin efface le mot de passe d'un autre admin (recréé à sa prochaine saisie).
  reinitialiserMotDePasseAdmin: (trigramme: string) => call<void>("reinitialiser_mot_de_passe_admin", { trigramme }),
  sessionActive: () => call<boolean>("admin_session_active"),
  lock: () => call<void>("admin_lock"),
  changerMotDePasse: (ancien: string, nouveau: string) => call<void>("change_mot_de_passe", { ancien, nouveau }),
  enregistrerConnexion: (trigramme: string) => call<void>("enregistrer_connexion", { trigramme }),
  listUtilisateurs: () => call<Utilisateur[]>("list_utilisateurs"),
  getRole: (trigramme: string) => call<Role>("get_role", { trigramme }),
  setRole: (trigramme: string, role: Role) => call<void>("set_role_utilisateur", { trigramme, role }),
  ajouterUtilisateur: (trigramme: string, role: Role) => call<void>("ajouter_utilisateur", { trigramme, role }),
};
