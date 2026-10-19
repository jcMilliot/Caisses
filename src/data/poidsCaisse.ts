import { call } from "./client";
import type { CaissePesee, NewCaissePesee } from "../domain/poidsCaisse";

// Caisses pesées (Consommable › Poids, verrou de la page) et réglages de l'estimation du poids
// des caisses (Admin › Caisses › Poids, session admin requise côté Rust).
export const poidsCaisseApi = {
  listPesees: () => call<CaissePesee[]>("list_caisses_pesees"),
  createPesee: (caisse: NewCaissePesee, trigramme: string) => call<void>("create_caisse_pesee", { caisse, trigramme }),
  updatePesee: (id: number, caisse: NewCaissePesee, trigramme: string) => call<void>("update_caisse_pesee", { id, caisse, trigramme }),
  deletePesee: (id: number, trigramme: string) => call<void>("delete_caisse_pesee", { id, trigramme }),
  // JSON des réglages (null = jamais réglés → valeurs par défaut, cf. lireReglagesPoids).
  getReglages: () => call<string | null>("get_reglages_poids_caisse"),
  setReglages: (reglages: string) => call<void>("set_reglages_poids_caisse", { reglages }),
};
