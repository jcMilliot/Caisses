import { call } from "./client";
import type { CaisseStock, NewCaisseStock } from "../domain/types";

export const caisseStockApi = {
  list: () => call<CaisseStock[]>("list_caisses_stock"),
  create: (caisse: NewCaisseStock, trigramme: string) =>
    call<CaisseStock>("create_caisse_stock", { caisse, trigramme }),
  update: (id: number, caisse: NewCaisseStock, trigramme: string) =>
    call<void>("update_caisse_stock", { id, caisse, trigramme }),
  delete: (id: number, trigramme: string) => call<void>("delete_caisse_stock", { id, trigramme }),
  // Lignes de Gestion des caisses non livrées qui utilisent cette caisse (reprendront ses
  // dimensions et son type d'ouverture si on la modifie).
  countLignesLiees: (id: number) => call<number>("count_caisse_stock_lignes_liees", { id }),
  transfer: (caisseStockId: number, demandeCibleId: number, trigramme: string) =>
    call<void>("transfer_caisse_stock", { caisseStockId, demandeCibleId, trigramme }),
  setValidee: (id: number, validee: boolean, trigramme: string) =>
    call<void>("set_caisse_stock_validee", { id, validee, trigramme }),
};
