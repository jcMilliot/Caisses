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
  // `url` : adresse de l'intranet saisie sur l'écran de connexion (première configuration ou
  // correction), enregistrée seulement si la connexion réussit avec elle.
  connexion: (username: string, password: string, url?: string) =>
    call<string>("connexion_intranet", { username, password, url: url ?? null }),
  // Identifiant intranet gardé sur le poste (pré-rempli à la reconnexion).
  identifiant: () => call<string | null>("get_intranet_identifiant"),
  // Adresse de l'intranet enregistrée (pré-remplie pour la corriger).
  urlActuelle: () => call<string>("get_intranet_url"),
};
