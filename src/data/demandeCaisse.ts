import { call } from "./client";
import type { DemandeCaisse, NewDemandeCaisse } from "../domain/types";

export const demandeCaisseApi = {
  listAll: () => call<DemandeCaisse[]>("list_all_demande_caisses"),
  create: (caisse: NewDemandeCaisse, trigramme: string) =>
    call<DemandeCaisse>("create_demande_caisse", { caisse, trigramme }),
  update: (id: number, caisse: NewDemandeCaisse, trigramme: string) =>
    call<void>("update_demande_caisse", { id, caisse, trigramme }),
  delete: (id: number, trigramme: string) => call<void>("delete_demande_caisse", { id, trigramme }),
};
