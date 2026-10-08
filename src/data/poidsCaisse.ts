import { call } from "./client";
import type { CaissePesee, NewCaissePesee } from "../domain/poidsCaisse";

// Caisses pesées et réglages de l'estimation du poids des caisses (Admin › Caisses › Poids).
// Écriture réservée à la session admin (garde côté Rust).
export const poidsCaisseApi = {
  listPesees: () => call<CaissePesee[]>("list_caisses_pesees"),
  createPesee: (caisse: NewCaissePesee) => call<void>("create_caisse_pesee", { caisse }),
  updatePesee: (id: number, caisse: NewCaissePesee) => call<void>("update_caisse_pesee", { id, caisse }),
  deletePesee: (id: number) => call<void>("delete_caisse_pesee", { id }),
  // JSON des réglages (null = jamais réglés → valeurs par défaut, cf. lireReglagesPoids).
  getReglages: () => call<string | null>("get_reglages_poids_caisse"),
  setReglages: (reglages: string) => call<void>("set_reglages_poids_caisse", { reglages }),
};
