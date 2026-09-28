import { call } from "./client";

export interface CompteStatus {
  requiert_mot_de_passe: boolean;
  mot_de_passe_defini: boolean;
}

export interface Utilisateur {
  trigramme: string;
  premiere_connexion: string; // UTC, datetime('now')
  derniere_connexion: string;
  role: string | null; // "admin" pour un compte protégé, null sinon
}

// Trigramme administrateur : seul à voir l'entrée « Admin » du menu (garde réelle côté Rust :
// session ouverte par mot de passe).
export const TRIGRAMME_ADMIN = "AJC";

export const adminApi = {
  compteStatus: (trigramme: string) => call<CompteStatus>("get_compte_status", { trigramme }),
  unlock: (trigramme: string, motDePasse: string) => call<void>("admin_unlock", { trigramme, motDePasse }),
  sessionActive: () => call<boolean>("admin_session_active"),
  lock: () => call<void>("admin_lock"),
  changerMotDePasse: (ancien: string, nouveau: string) => call<void>("change_mot_de_passe", { ancien, nouveau }),
  enregistrerConnexion: (trigramme: string) => call<void>("enregistrer_connexion", { trigramme }),
  listUtilisateurs: () => call<Utilisateur[]>("list_utilisateurs"),
};
