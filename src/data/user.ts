import { call } from "./client";

// Connexion à Caisses avec le compte intranet (2026-10-08, cf. commands/intranet.rs).
export interface EtatConnexion {
  // Identité du poste : trigramme de l'intranet, à défaut son identifiant (ex. « X12345 »).
  trigramme: string | null;
  // « connecte » | « hors_ligne » (intranet injoignable, dernier compte connu du poste) |
  // « a_identifier » (écran de connexion).
  statut: "connecte" | "hors_ligne" | "a_identifier";
  message: string | null;
  // Adresse de l'intranet pas encore réglée : l'écran de connexion la demande.
  url_manquante: boolean;
}

export const connexionApi = {
  // Au démarrage : reconnexion avec les identifiants gardés sur le poste.
  auto: () => call<EtatConnexion>("connexion_auto"),
  // Renvoie l'identité du poste.
  connexion: (username: string, password: string) => call<string>("connexion_intranet", { username, password }),
  // Identifiant intranet gardé sur le poste (pré-rempli à la reconnexion).
  identifiant: () => call<string | null>("get_intranet_identifiant"),
  // Première configuration (aucune adresse réglée).
  urlInitiale: (url: string) => call<void>("set_intranet_url_initiale", { url }),
};
