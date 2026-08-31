// Valeurs prédéfinies proposées dans les champs de la section Demandes. Chaque liste inclut
// une option "Autre" en saisie libre côté UI (pas ici — voir SelectOuAutre).

import type { Demande, DemandeCaisse } from "./types";

export const TYPES_ENVOI_CAISSE = ["STANDARD", "STANDARD (4B)", "STANDARD (4C)"];

export const TYPES_OUVERTURE = ["Par dessus", "Par dessus et par devant", "Par devant"];

export const VALEURS_STOCK = ["AR_CAISS_00001", "AR_CAISS_00002", "AR_CAISS_00005", "AR_CAISS_00006", "CAISSE RECUP"];

export const MOTEURS = Array.from({ length: 10 }, (_, i) => `${i + 1} MOTEUR${i > 0 ? "S" : ""}`);

export const TERMINAUX = Array.from({ length: 10 }, (_, i) => `${i + 1} ${i === 0 ? "TERMINAL" : "TERMINAUX"}`);

export const TRAITEMENTS = ["NIMP15"];

// Module Linéaire : liste à définir plus tard, saisie libre pour l'instant.
export const MODULES_LINEAIRES: string[] = [];

// Une caisse "4B"/"4C" (renforcée) impose systématiquement le traitement NIMP15 ; le "4C"
// contient en plus de la mousse de calage qui réduit le volume utile.
export function estCaisse4B(typeEnvoiCaisse: string): boolean {
  return /4B/i.test(typeEnvoiCaisse);
}

export function estCaisse4C(typeEnvoiCaisse: string): boolean {
  return /4C/i.test(typeEnvoiCaisse);
}

export function necessiteNimp15(typeEnvoiCaisse: string): boolean {
  return estCaisse4B(typeEnvoiCaisse) || estCaisse4C(typeEnvoiCaisse);
}

export const AVERTISSEMENT_MOUSSE_4C =
  "Attention, mousse présente, prévoir 5cm de plus sur les côtés et sur la hauteur.";

// Mesures max pour une caisse 4C : 2.22 × 0.80 × 0.80 m. La longueur (2.22 m) est une limite
// informative — dépassable si besoin — contrairement à largeur/hauteur qui restent des maximums
// physiques stricts. Dans les deux cas on se contente d'avertir (pas de blocage de saisie).
export const MESURES_MAX_4C_MM = { longueur: 2220, largeur: 800, hauteur: 800 };

export function depassementMesuresMax4C(
  typeEnvoiCaisse: string,
  longueurMm: number,
  largeurMm: number,
  hauteurMm: number,
): string | undefined {
  if (!estCaisse4C(typeEnvoiCaisse)) return undefined;
  const depassements: string[] = [];
  if (longueurMm > MESURES_MAX_4C_MM.longueur) depassements.push("longueur");
  if (largeurMm > MESURES_MAX_4C_MM.largeur) depassements.push("largeur");
  if (hauteurMm > MESURES_MAX_4C_MM.hauteur) depassements.push("hauteur");
  if (depassements.length === 0) return undefined;
  return `Mesure(s) au-delà du maximum habituel pour une caisse 4C (2.22 × 0.80 × 0.80 m) : ${depassements.join(", ")}.`;
}

// Le contre-plaqué est systématiquement requis pour STANDARD et 4B ; le 4C (housse soudée) ne
// l'impose pas automatiquement, donc reste décoché par défaut et à la discrétion de l'utilisateur.
export function contrePlaqueParDefaut(typeEnvoiCaisse: string): boolean {
  return !estCaisse4C(typeEnvoiCaisse);
}

// Une demande est considérée validée soit via la colonne `validee` (case "Valider" cochée et
// enregistrée), soit via une observation historique "livrée"/"rapatriée" saisie avant que cette
// colonne n'existe (données Excel importées, ou saisies manuelles anciennes) — les deux signaux
// doivent rester équivalents partout où l'app décide qu'une demande est "terminée".
export function estDemandeValidee(d: Demande): boolean {
  const obs = d.observations.trim().toLowerCase();
  return d.validee || obs.includes("livrée") || obs.includes("livree") || obs.includes("rapatriée") || obs.includes("rapatriee");
}

// Une sous-caisse (demande_caisse) n'a pas sa propre colonne `validee` — elle est considérée
// validée soit par sa propre observation (même convention que la demande mère), soit parce que
// la demande mère qui la porte a été validée (cascade : valider la mère vide aussi les affiches
// des filles, cf. DemandesList.handleValiderCascade).
export function estDemandeCaisseValidee(c: DemandeCaisse, demandeMere: Demande | undefined): boolean {
  const obs = c.observations.trim().toLowerCase();
  const obsValidee = obs.includes("livrée") || obs.includes("livree") || obs.includes("rapatriée") || obs.includes("rapatriee");
  return obsValidee || (demandeMere ? estDemandeValidee(demandeMere) : false);
}
