import { call } from "./client";
import type { CaisseColisage } from "../domain/types";

// Carton d'un colis : carton conso, ou (0044) carton libre aux dimensions extérieures saisies
// (carton_conso_id null).
export interface ColisAffaire {
  tag: string;
  carton_conso_id: number | null;
  libre_longueur_mm: number;
  libre_largeur_mm: number;
  libre_hauteur_mm: number;
  libre_poids_kg: number;
}

// Rangement choisi à la main d'un colis / d'une lettre (null = non rangé).
export interface ColisRangement {
  tag: string;
  caisse_colisage_id: number | null;
}

// Onglet Colisage d'une affaire : carton de chaque colis (pack_tag chiffré), caisses colisage
// (copies indépendantes des caisses de l'affaire) et rangement des colis / lettres dedans.
export const colisAffaireApi = {
  list: (affaireId: number) => call<ColisAffaire[]>("list_colis_affaire", { affaireId }),
  setCarton: (affaireId: number, tag: string, cartonConsoId: number | null, trigramme: string) =>
    call<void>("set_colis_carton", { affaireId, tag, cartonConsoId, trigramme }),
  // Carton libre (récup, non géré dans Consommable) : dimensions extérieures en mm.
  setCartonLibre: (affaireId: number, tag: string, dims: [number, number, number], poidsKg: number, trigramme: string) =>
    call<void>("set_colis_carton_libre", {
      affaireId,
      tag,
      longueurMm: dims[0],
      largeurMm: dims[1],
      hauteurMm: dims[2],
      poidsKg,
      trigramme,
    }),
  // Pièces acceptées malgré l'alerte de dimensions (carton = clé du carton, cf. domain/colisage.ts).
  listPiecesAcceptees: (affaireId: number) => call<{ article_id: number; carton: string }[]>("list_pieces_acceptees", { affaireId }),
  setPieceAcceptee: (articleId: number, carton: string | null, trigramme: string) =>
    call<void>("set_piece_acceptee", { articleId, carton, trigramme }),
  listCaisses: (affaireId: number) => call<CaisseColisage[]>("list_caisses_colisage", { affaireId }),
  copierCaisses: (affaireId: number, trigramme: string) => call<void>("copier_caisses_colisage", { affaireId, trigramme }),
  creerCaisse: (affaireId: number, nom: string, dims: [number, number, number], trigramme: string) =>
    call<void>("create_caisse_colisage", { affaireId, nom, longueurMm: dims[0], largeurMm: dims[1], hauteurMm: dims[2], trigramme }),
  modifierCaisse: (id: number, nom: string, dims: [number, number, number], trigramme: string) =>
    call<void>("update_caisse_colisage", { id, nom, longueurMm: dims[0], largeurMm: dims[1], hauteurMm: dims[2], trigramme }),
  supprimerCaisse: (id: number, trigramme: string) => call<void>("delete_caisse_colisage", { id, trigramme }),
  listRangements: (affaireId: number) => call<ColisRangement[]>("list_colis_rangement", { affaireId }),
  // propose = retour au rangement proposé ; sinon caisse choisie (null = non rangé).
  ranger: (affaireId: number, tag: string, propose: boolean, caisseColisageId: number | null, trigramme: string) =>
    call<void>("set_colis_rangement", { affaireId, tag, propose, caisseColisageId, trigramme }),
};
