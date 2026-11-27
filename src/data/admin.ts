import { call } from "./client";

// Rôles (décision 2026-09-30) : admin = page Admin et écriture partout. Depuis le 2026-11-25
// (ADR 0005), les droits d'un utilisateur se règlent par écran (lecture / écriture, lecture par
// défaut) ; l'ancien rôle « Lecteur » est devenu « lecture partout ». Identification par le compte
// intranet ; garde réelle côté Rust (`require_admin`, `refuser_sans_ecriture`).
export type Role = "utilisateur" | "admin";

// Administrateur permanent : son rôle n'est pas modifiable (garde aussi côté Rust).
export const ADMIN_PERMANENT = "AJC";

export const LIBELLE_ROLE: Record<Role, string> = {
  utilisateur: "Utilisateur",
  admin: "Administrateur",
};

/** Écrans dont l'écriture se règle par personne (mêmes clés que les verrous, cf. `admin.rs::ECRANS`). */
export type Ecran = "demandes" | "simulations" | "stock" | "achats" | "alertes" | "controle";

export const ECRANS: { id: Ecran; libelle: string }[] = [
  { id: "demandes", libelle: "Gestion des caisses" },
  { id: "simulations", libelle: "Simulations" },
  { id: "stock", libelle: "Consommable" },
  { id: "achats", libelle: "Demandes d'achats" },
  { id: "alertes", libelle: "Alertes" },
  { id: "controle", libelle: "Contrôle dimensionnel" },
];

export interface Utilisateur {
  trigramme: string;
  premiere_connexion: string; // UTC, datetime('now')
  derniere_connexion: string;
  role: Role;
  /** Écrans en écriture (tous pour un administrateur). */
  ecriture: Ecran[];
}

export interface Droits {
  role: Role;
  ecriture: Ecran[];
}

export const adminApi = {
  // Rouvre la session admin après « Verrouiller » : mot de passe intranet du compte du poste.
  unlock: (motDePasse: string) => call<void>("admin_unlock_intranet", { password: motDePasse }),
  sessionActive: () => call<boolean>("admin_session_active"),
  lock: () => call<void>("admin_lock"),
  enregistrerConnexion: (trigramme: string) => call<void>("enregistrer_connexion", { trigramme }),
  listUtilisateurs: () => call<Utilisateur[]>("list_utilisateurs"),
  getRole: (trigramme: string) => call<Role>("get_role", { trigramme }),
  getDroits: (trigramme: string) => call<Droits>("get_droits", { trigramme }),
  setRole: (trigramme: string, role: Role) => call<void>("set_role_utilisateur", { trigramme, role }),
  setDroit: (trigramme: string, ecran: Ecran, ecriture: boolean) =>
    call<void>("set_droit_ecran", { trigramme, ecran, ecriture }),
  ajouterUtilisateur: (trigramme: string, role: Role) => call<void>("ajouter_utilisateur", { trigramme, role }),
};
