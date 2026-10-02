import { call } from "./client";
import type { Caisse } from "../domain/types";

export const caissesApi = {
  list: (affaire_id: number) => call<Caisse[]>("list_caisses", { affaireId: affaire_id }),
  create: (
    affaire_id: number,
    nom: string,
    longueur_mm: number,
    largeur_mm: number,
    hauteur_mm: number,
    seuil_pct: number | null,
    caisse_stock_id: number | null,
    type_envoi_caisse: string,
    demande_caisse_id: number | null,
    trigramme: string,
  ) =>
    call<Caisse>("create_caisse", {
      affaireId: affaire_id,
      nom,
      longueurMm: longueur_mm,
      largeurMm: largeur_mm,
      hauteurMm: hauteur_mm,
      seuilPct: seuil_pct,
      caisseStockId: caisse_stock_id,
      typeEnvoiCaisse: type_envoi_caisse,
      demandeCaisseId: demande_caisse_id,
      trigramme,
    }),
  update: (
    id: number,
    nom: string,
    longueur_mm: number,
    largeur_mm: number,
    hauteur_mm: number,
    seuil_pct: number | null,
    couleur: string,
    type_envoi_caisse: string,
    trigramme: string,
  ) =>
    call<void>("update_caisse", {
      id,
      nom,
      longueurMm: longueur_mm,
      largeurMm: largeur_mm,
      hauteurMm: hauteur_mm,
      seuilPct: seuil_pct,
      couleur,
      typeEnvoiCaisse: type_envoi_caisse,
      trigramme,
    }),
  linkDemandeCaisse: (id: number, demande_caisse_id: number, trigramme: string) =>
    call<void>("link_caisse_demande_caisse", { id, demandeCaisseId: demande_caisse_id, trigramme }),
  linkDemande: (id: number, demande_id: number, trigramme: string) =>
    call<void>("link_caisse_demande", { id, demandeId: demande_id, trigramme }),
  // Lien manuel vers une ligne de Gestion des caisses : mère OU sous-caisse (les deux null = délier).
  lierLigne: (id: number, demande_id: number | null, demande_caisse_id: number | null, trigramme: string) =>
    call<void>("lier_caisse_ligne", { id, demandeId: demande_id, demandeCaisseId: demande_caisse_id, trigramme }),
  // Caisse en stock utilisée par cette caisse de Simulations (null = aucune).
  setCaisseStock: (id: number, caisse_stock_id: number | null, trigramme: string) =>
    call<void>("set_caisse_caisse_stock", { id, caisseStockId: caisse_stock_id, trigramme }),
  delete: (id: number, trigramme: string) => call<void>("delete_caisse", { id, trigramme }),
};
