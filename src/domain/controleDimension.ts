// Contrôle dimensionnel (2026-11-16, ADR 0004) — logique pure : répartition des AR du référentiel
// entre « à contrôler », « validés » et « dimensions corrigées », d'après le seuil et la durée de
// validité réglés dans l'Admin.
import type { ControleDimension, ReglagesControle } from "./types";

export type EtatControle =
  | "nouveau" // jamais contrôlé
  | "recontrole" // contrôle expiré
  | "valide" // contrôle encore valable
  | "corrige_attente"; // mesures corrigées, pas encore reportées dans l'ERP

/** Horodatage UTC « AAAA-MM-JJ HH:MM:SS » → Date. */
function versDate(horodatage: string): Date {
  return new Date(horodatage.replace(" ", "T") + "Z");
}

/** 2 dimensions sur 3 (valeurs de l'ERP) au moins égales au seuil (≥, retour du 2026-11-16). */
export function depasseSeuil(c: Pick<ControleDimension, "dim1_mm" | "dim2_mm" | "dim3_mm">, seuilMm: number): boolean {
  return [c.dim1_mm, c.dim2_mm, c.dim3_mm].filter((d) => d >= seuilMm).length >= 2;
}

/** Début de validité du dernier contrôle : sa date, ou celle du report dans l'ERP s'il a corrigé. */
export function debutValidite(c: ControleDimension): string | null {
  return c.corrige ? c.erp_valide_le : c.controle_le;
}

/** Date du prochain contrôle (même jour, N mois calendaires plus tard), à minuit locale. */
export function prochainControle(c: ControleDimension, dureeMois: number): Date | null {
  const debut = debutValidite(c);
  if (!debut) return null;
  const d = versDate(debut);
  const jour = d.getDate();
  const e = new Date(d.getFullYear(), d.getMonth() + dureeMois, 1);
  // 31 janvier + 1 mois → dernier jour de février, pas 3 mars.
  const dernierJour = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate();
  e.setDate(Math.min(jour, dernierJour));
  return e;
}

export function etatControle(c: ControleDimension, dureeMois: number, maintenant: Date = new Date()): EtatControle {
  if (c.corrige && !c.erp_valide_le) return "corrige_attente";
  const echeance = prochainControle(c, dureeMois);
  if (!echeance) return "nouveau";
  return maintenant >= echeance ? "recontrole" : "valide";
}

export interface ListesControle {
  aControler: ControleDimension[];
  valides: ControleDimension[];
  /** Toutes les lignes dont le dernier contrôle a corrigé les mesures, quel que soit le seuil. */
  corriges: ControleDimension[];
}

export function repartirControles(
  lignes: ControleDimension[],
  reglages: ReglagesControle,
  maintenant: Date = new Date(),
): ListesControle {
  const r: ListesControle = { aControler: [], valides: [], corriges: [] };
  for (const c of lignes) {
    if (c.corrige) r.corriges.push(c);
    if (!depasseSeuil(c, reglages.seuil_mm)) continue;
    const etat = etatControle(c, reglages.duree_mois, maintenant);
    if (etat === "nouveau" || etat === "recontrole") r.aControler.push(c);
    else if (etat === "valide") r.valides.push(c);
  }
  return r;
}

/** Nombre d'articles à contrôler (carte de l'accueil). */
export function nbAControler(lignes: ControleDimension[], reglages: ReglagesControle, maintenant: Date = new Date()): number {
  return repartirControles(lignes, reglages, maintenant).aControler.length;
}
