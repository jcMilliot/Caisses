import { call } from "./client";
import type { CaisseStock, NewCaisseStock } from "../domain/types";

export const caisseStockApi = {
  list: () => call<CaisseStock[]>("list_caisses_stock"),
  create: (caisse: NewCaisseStock, trigramme: string) =>
    call<CaisseStock>("create_caisse_stock", { caisse, trigramme }),
  update: (id: number, caisse: NewCaisseStock, trigramme: string) =>
    call<void>("update_caisse_stock", { id, caisse, trigramme }),
  delete: (id: number, trigramme: string) => call<void>("delete_caisse_stock", { id, trigramme }),
};
