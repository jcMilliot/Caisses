import { call } from "./client";
import type { LivraisonLigne, TableLigne } from "../domain/types";

// Date de livraison des lignes de Gestion des caisses (envoi en partiel, 2026-10-29).
export const livraisonsApi = {
  list: () => call<LivraisonLigne[]>("list_livraisons"),
  set: (tableLigne: TableLigne, ligneId: number, livreeLe: string | null, trigramme: string) =>
    call<void>("set_livraison", { tableLigne, ligneId, livreeLe, trigramme }),
};
