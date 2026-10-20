import { call } from "./client";
import type { DemandeAlerte } from "../domain/types";

export const demandeAlertesApi = {
  list: () => call<DemandeAlerte[]>("list_demande_alertes"),
  set: (demandeId: number, dateAnticipee: string, commentaire: string, trigramme: string) =>
    call<void>("set_demande_alerte", { demandeId, dateAnticipee, commentaire, trigramme }),
};
