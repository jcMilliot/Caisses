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
    trigramme: string,
  ) =>
    call<Caisse>("create_caisse", {
      affaireId: affaire_id,
      nom,
      longueurMm: longueur_mm,
      largeurMm: largeur_mm,
      hauteurMm: hauteur_mm,
      seuilPct: seuil_pct,
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
      trigramme,
    }),
  delete: (id: number, trigramme: string) => call<void>("delete_caisse", { id, trigramme }),
};
