// Cartons consommables (Consommable › Cartons conso).

export const PREFIXE_CARTON = "AR_RAJA__";

// Nom au format « AR_RAJA__XXXXX » (5 lettres ou chiffres), comparé en majuscules — même règle
// que `src-tauri/src/commands/carton_conso.rs::nom_valide`.
export function nomCartonValide(nom: string): boolean {
  return /^AR_RAJA__[A-Z0-9]{5}$/.test(nom.trim().toUpperCase());
}

// Dimensions des cartons en centimètres (2026-10-14), stockées en mm comme partout. Affichage
// au mm près, sans « ,0 » inutile.
export function cm(mm: number): string {
  return String(Number((mm / 10).toFixed(1)));
}

// Texte du champ de saisie (vide pour 0) ↔ mm.
export function texteCm(mm: number): string {
  return mm === 0 ? "" : cm(mm);
}

export function mmDepuisCm(texte: string): number {
  const n = Number(texte.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 10) : 0;
}
