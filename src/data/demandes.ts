import { call } from "./client";
import type { Demande, NewDemande } from "../domain/types";

export const demandesApi = {
  list: () => call<Demande[]>("list_demandes"),
  create: (demande: NewDemande) => call<Demande>("create_demande", { demande }),
  bulkCreate: (demandes: NewDemande[]) => call<Demande[]>("bulk_create_demandes", { demandes }),
  update: (id: number, demande: NewDemande) => call<void>("update_demande", { id, demande }),
  delete: (id: number) => call<void>("delete_demande", { id }),
  setValidee: (id: number, validee: boolean) => call<void>("set_demande_validee", { id, validee }),
};
