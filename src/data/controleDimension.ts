import { call } from "./client";
import type { Conditionnement, ControleDimension, ReglagesControle } from "../domain/types";
import type { ArticleErp } from "../domain/controleDimension";

/** Feuille Excel exportée : nombre ou texte par cellule ("" = case vide à remplir à la main). */
export interface FeuilleExportControle {
  nom: string;
  entetes: string[];
  /** Formule Excel en anglais : `{ formule: "=…" }`. */
  lignes: (string | number | { formule: string })[][];
  /** Couleur de fond par colonne (« #RRGGBB », "" = aucune). */
  fonds?: string[];
}

export const controleDimensionApi = {
  list: () => call<ControleDimension[]>("list_controle_dimension"),
  /** Affaires de Simulations pas entièrement expédiées (picking lu en direct par la page). */
  listAffaires: () => call<string[]>("list_affaires_controle"),
  /** AR lus dans les pickings en direct → référentiel ; renvoie le nombre de nouveaux AR. */
  rafraichir: (articles: ArticleErp[], trigramme: string) => call<number>("rafraichir_controle_dimension", { articles, trigramme }),
  getReglages: () => call<ReglagesControle>("get_reglages_controle"),
  setReglages: (reglages: ReglagesControle) => call<void>("set_reglages_controle", { reglages }),
  valider: (ar: string, trigramme: string) => call<void>("valider_controle_dimension", { ar, trigramme }),
  corriger: (ar: string, dim1Mm: number, dim2Mm: number, dim3Mm: number, poidsKg: number, trigramme: string) =>
    call<void>("corriger_controle_dimension", { ar, dim1Mm, dim2Mm, dim3Mm, poidsKg, trigramme }),
  validerErp: (ars: string[], trigramme: string) => call<number>("valider_erp_controle_dimension", { ars, trigramme }),
  /** Petits volumes : "" remet à traiter ; "sachet" exige les dimensions hors sachet. */
  setConditionnement: (ar: string, conditionnement: Conditionnement, hors: [number, number, number] | null, trigramme: string) =>
    call<void>("set_conditionnement_controle", {
      ar,
      conditionnement,
      hsDim1Mm: hors?.[0] ?? null,
      hsDim2Mm: hors?.[1] ?? null,
      hsDim3Mm: hors?.[2] ?? null,
      trigramme,
    }),
  /** Pièces en sachet (dimensions hors sachet) et marge sachet, pour les calculs de Simulations. */
  listHorsSachet: () =>
    call<{ marge_sachet_pct: number; pieces: { ar: string; dim1_mm: number; dim2_mm: number; dim3_mm: number }[] }>("list_hors_sachet"),
  /** Chemin du fichier écrit, `null` si l'enregistrement est annulé. */
  exporterXlsx: (feuille: FeuilleExportControle, nomFichier: string) =>
    call<string | null>("exporter_controle_xlsx", { feuille, nomFichier }),
};
