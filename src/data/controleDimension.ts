import { call } from "./client";
import type { ControleDimension, ReglagesControle } from "../domain/types";

/** Feuille Excel exportée : nombre ou texte par cellule ("" = case vide à remplir à la main). */
export interface FeuilleExportControle {
  nom: string;
  entetes: string[];
  lignes: (string | number)[][];
}

export const controleDimensionApi = {
  list: () => call<ControleDimension[]>("list_controle_dimension"),
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
