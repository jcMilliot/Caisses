import { call } from "./client";
import type { CaisseStock, NewCaisseStock } from "../domain/types";

export const caisseStockApi = {
  list: () => call<CaisseStock[]>("list_caisses_stock"),
  create: (caisse: NewCaisseStock) => call<CaisseStock>("create_caisse_stock", { caisse }),
  update: (id: number, caisse: NewCaisseStock) => call<void>("update_caisse_stock", { id, caisse }),
  delete: (id: number) => call<void>("delete_caisse_stock", { id }),
};
