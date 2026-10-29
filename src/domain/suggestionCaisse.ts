import { volumeInterneM3, volumeUnitaireM3 } from "./calculs";
import { estArCaiss } from "./caisseStock";
import { estDemandeCaisseValidee, estDemandeValidee, necessiteNimp15, stockAutorisePourEnvoi } from "./demandeOptions";
import type { Article, Caisse, CaisseStock, Demande, DemandeCaisse } from "./types";

// Suggestion de caisse en stock pour une caisse de Simulations (décisions 2026-10-01 / 2026-10-02) :
//  - seulement pour un envoi STANDARD (pas de caisse en stock en 4B / 4C), ni si la ligne de
//    Gestion des caisses demande un traitement NIMP15 (retour du 2026-10-29 : une caisse créée
//    dans Simulations n'a pas de type d'envoi, c'est sa ligne qui le porte) ;
//  - caisses candidates : AR_CAISS_ avec au moins 1 en stock (gérées ou non : une non gérée est
//    une caisse qu'on écoule, décision 2026-10-02), et caisses de récup
//    disponibles (pas livrées, pas déjà prises par une autre ligne de Gestion des caisses) ;
//  - la caisse doit contenir les plus grandes dimensions des articles (axes stricts, comme
//    l'alerte « article plus grand que la caisse » : dim1↔longueur, dim2↔largeur, dim3↔hauteur)
//    et leur volume total, seuil de remplissage compris (volume ≤ volume interne × seuil) ;
//  - une seule suggestion : la plus petite (volume interne) qui convient.

const TOLERANCE_MM = 0.5;

// Lignes de Gestion des caisses rattachées à cette caisse de Simulations : elles peuvent déjà
// utiliser la caisse de récup sans qu'elle soit « prise » par quelqu'un d'autre.
export interface LiensCaisse {
  demandeId: number | null;
  demandeCaisseId: number | null;
}

// Caisse de récup libre : pas livrée, et aucune ligne non livrée (hors celles de cette caisse)
// ne l'utilise déjà.
export function recupDisponible(
  cs: CaisseStock,
  demandes: Demande[],
  demandeCaisses: DemandeCaisse[],
  liens: LiensCaisse,
): boolean {
  if (cs.validee) return false;
  const prisParMere = demandes.some((d) => d.caisse_stock_id === cs.id && d.id !== liens.demandeId && !estDemandeValidee(d));
  const prisParSousCaisse = demandeCaisses.some(
    (sc) => sc.caisse_stock_id === cs.id && sc.id !== liens.demandeCaisseId && !estDemandeCaisseValidee(sc),
  );
  return !prisParMere && !prisParSousCaisse;
}

// Ligne de Gestion des caisses (mère ou sous-caisse) qui demande une caisse traitée NIMP15 :
// 4B / 4C, ou traitement NIMP15 saisi. Aucune caisse en stock (récup ou AR_CAISS_) n'est proposée.
export function exigeNimp15(ligne: { type_envoi_caisse: string; traitement: string }): boolean {
  return necessiteNimp15(ligne.type_envoi_caisse) || /NIMP15/i.test(ligne.traitement);
}

export function suggererCaisseStock(params: {
  caisse: Pick<Caisse, "type_envoi_caisse">;
  // Ligne de Gestion des caisses de la caisse (liée, à défaut une ligne de la même affaire).
  ligne: { type_envoi_caisse: string; traitement: string } | null;
  articles: Article[];
  seuilPct: number;
  caissesStock: CaisseStock[];
  demandes: Demande[];
  demandeCaisses: DemandeCaisse[];
  liens: LiensCaisse;
}): CaisseStock | null {
  const { caisse, ligne, articles, seuilPct, caissesStock, demandes, demandeCaisses, liens } = params;
  if (!stockAutorisePourEnvoi(caisse.type_envoi_caisse)) return null;
  if (ligne && exigeNimp15(ligne)) return null;
  const volume = articles.reduce((s, a) => s + volumeUnitaireM3(a) * a.quantite, 0);
  if (volume <= 0) return null;
  const dim1 = Math.max(...articles.map((a) => a.dim1_mm));
  const dim2 = Math.max(...articles.map((a) => a.dim2_mm));
  const dim3 = Math.max(...articles.map((a) => a.dim3_mm));

  const candidates = caissesStock.filter((cs) => {
    const disponible = estArCaiss(cs.nom) ? cs.quantite > 0 : recupDisponible(cs, demandes, demandeCaisses, liens);
    if (!disponible) return false;
    if (dim1 - cs.longueur_mm > TOLERANCE_MM || dim2 - cs.largeur_mm > TOLERANCE_MM || dim3 - cs.hauteur_mm > TOLERANCE_MM) return false;
    return volume <= volumeInterneM3(cs) * (seuilPct / 100);
  });
  if (candidates.length === 0) return null;
  return candidates.reduce((meilleure, cs) => (volumeInterneM3(cs) < volumeInterneM3(meilleure) ? cs : meilleure));
}
