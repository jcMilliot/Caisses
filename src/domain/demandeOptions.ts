// Valeurs prédéfinies proposées dans les champs de la section Demandes. Chaque liste inclut
// une option "Autre" en saisie libre côté UI (pas ici — voir SelectOuAutre).

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
