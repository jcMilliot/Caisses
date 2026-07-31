import { call } from "./client";
import type { Demande, NewDemande } from "../domain/types";

export const demandesApi = {
  list: () => call<Demande[]>("list_demandes"),
  create: (demande: NewDemande, trigramme: string) => call<Demande>("create_demande", { demande, trigramme }),
  bulkCreate: (demandes: NewDemande[], trigramme: string) =>
    call<Demande[]>("bulk_create_demandes", { demandes, trigramme }),
  update: (id: number, demande: NewDemande, trigramme: string) =>
    call<void>("update_demande", { id, demande, trigramme }),
  delete: (id: number, trigramme: string) => call<void>("delete_demande", { id, trigramme }),
  setValidee: (id: number, validee: boolean, trigramme: string) =>
    call<void>("set_demande_validee", { id, validee, trigramme }),
};
