import { memeNomAffaire } from "./demandeOptions";
import type { Demande, DemandeCaisse } from "./types";

// Taux de remplissage des affaires de Simulations, affiché dans la liste des affaires et dans la
// colonne « Taux de remplissage » de Gestion des caisses (2026-10-02). Une seule caisse remplie →
// « 72% » ; plusieurs → « Caisse 1 : 72% / Caisse 2 : 40% » (noms des caisses de la simulation).

export interface RemplissageCaisse {
  affaire_id: number;
  affaire_nom: string;
  caisse_id: number;
  caisse_nom: string;
  volume_occupe_m3: number;
  volume_interne_m3: number;
  demande_id: number | null;
  demande_caisse_id: number | null;
}

export interface TauxCaisse {
  nom: string;
  taux: number; // 0..∞ (> 1 = volume dépassé)
}

export function tauxParAffaire(lignes: RemplissageCaisse[]): Map<number, TauxCaisse[]> {
  const map = new Map<number, TauxCaisse[]>();
  for (const l of lignes) {
    if (l.volume_interne_m3 <= 0) continue;
    const liste = map.get(l.affaire_id) ?? [];
    liste.push({ nom: l.caisse_nom, taux: l.volume_occupe_m3 / l.volume_interne_m3 });
    map.set(l.affaire_id, liste);
  }
  return map;
}

const versTaux = (l: RemplissageCaisse): TauxCaisse => ({ nom: l.caisse_nom, taux: l.volume_occupe_m3 / l.volume_interne_m3 });

// Gestion des caisses, ligne mère : la caisse de Simulations liée à cette ligne (`demande_id`) ;
// à défaut, celles de l'affaire du même nom liées à aucune ligne — même ciblage que la synchro
// des dimensions (AffaireDetail::ligneLiee). Les caisses liées à une sous-caisse n'y sont pas.
export function tauxPourDemande(lignes: RemplissageCaisse[], d: Demande): TauxCaisse[] {
  const valides = lignes.filter((l) => l.volume_interne_m3 > 0 && memeNomAffaire(l.affaire_nom, d.affaire));
  const liees = valides.filter((l) => l.demande_id === d.id);
  if (liees.length > 0) return liees.map(versTaux);
  return valides.filter((l) => l.demande_id === null && l.demande_caisse_id === null).map(versTaux);
}

// Gestion des caisses, sous-caisse : la caisse de Simulations liée (`demande_caisse_id`).
export function tauxPourSousCaisse(lignes: RemplissageCaisse[], sc: DemandeCaisse): TauxCaisse[] {
  return lignes.filter((l) => l.volume_interne_m3 > 0 && l.demande_caisse_id === sc.id).map(versTaux);
}

// Couleur selon le seuil d'alerte (mêmes niveaux que les cartes de caisse).
export function couleurTaux(taux: number, seuilPct: number): string {
  if (taux > 1) return "var(--danger-text)";
  if (taux * 100 >= seuilPct) return "var(--warn-text)";
  return "var(--ok-text)";
}
