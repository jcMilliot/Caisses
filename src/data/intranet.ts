import { call } from "./client";
import type { ColisCaisse, LignePicking, PlanImport } from "../domain/importIntranet";

export interface ImportIntranetInfo {
  importe_le: string;
  // AR des lignes écartées faute de numéro de besoin.
  anomalies: string[];
}

// Erreurs renvoyées par le backend quand il faut (re)demander les identifiants intranet.
export const ERR_IDENTIFIANTS_REQUIS = "IDENTIFIANTS_REQUIS";
export const ERR_IDENTIFIANTS_REFUSES = "IDENTIFIANTS_REFUSES";

export const intranetApi = {
  getIdentifiant: () => call<string | null>("get_intranet_identifiant"),
  fetchPicking: (business: string) => call<LignePicking[]>("fetch_picking_intranet", { business }),
  // Liste de colisage : caisse (lettre) de chaque colis (2026-10-28).
  fetchPacking: (business: string) => call<ColisCaisse[]>("fetch_packing_intranet", { business }),
  listColisCaisse: (affaireId: number) => call<ColisCaisse[]>("list_colis_caisse_intranet", { affaireId }),
  getImport: (affaireId: number) => call<ImportIntranetInfo | null>("get_import_intranet", { affaireId }),
  appliquerImport: (affaireId: number, plan: PlanImport, trigramme: string) =>
    call<void>("appliquer_import_intranet", { affaireId, plan, trigramme }),
  getUrl: () => call<string>("get_intranet_url"),
  setUrl: (url: string) => call<void>("set_intranet_url", { url }),
  getCollageExcelVisible: () => call<boolean>("get_collage_excel_visible"),
  setCollageExcelVisible: (visible: boolean) => call<void>("set_collage_excel_visible", { visible }),
};
