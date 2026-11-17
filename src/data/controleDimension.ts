import { call } from "./client";
import type { ControleDimension, ReglagesControle } from "../domain/types";
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
  /** Chemin du fichier écrit, `null` si l'enregistrement est annulé. */
  exporterXlsx: (feuille: FeuilleExportControle, nomFichier: string) =>
    call<string | null>("exporter_controle_xlsx", { feuille, nomFichier }),
};
