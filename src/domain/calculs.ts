import type { Article, Caisse, CaisseCalculee } from "./types";
import { estCaisse4C } from "./demandeOptions";

const MM3_TO_M3 = 1_000_000_000;
const EPAISSEUR_MOUSSE_M = 0.025;

export function volumeUnitaireM3(article: Pick<Article, "dim1_mm" | "dim2_mm" | "dim3_mm">): number {
  return (article.dim1_mm * article.dim2_mm * article.dim3_mm) / MM3_TO_M3;
}

export function volumeInterneM3(caisse: Pick<Caisse, "longueur_mm" | "largeur_mm" | "hauteur_mm">): number {
  return (caisse.longueur_mm * caisse.largeur_mm * caisse.hauteur_mm) / MM3_TO_M3;
}

// Mousse de calage fournie par le fabricant sur les caisses 4C : 2 plaques latérales sur la
// longueur, 2 sur la largeur, 1 sur le plancher — toutes d'épaisseur 25mm.
export function volumeMousseM3(caisse: Pick<Caisse, "longueur_mm" | "largeur_mm" | "hauteur_mm">): number {
  const L = caisse.longueur_mm / 1000;
  const l = caisse.largeur_mm / 1000;
  const H = caisse.hauteur_mm / 1000;
  const plaquesLongueur = 2 * (L * EPAISSEUR_MOUSSE_M * H);
  const plaquesLargeur = 2 * (l * EPAISSEUR_MOUSSE_M * H);
  const plancher = L * l * EPAISSEUR_MOUSSE_M;
  return plaquesLongueur + plaquesLargeur + plancher;
}

export function volumeDisponibleM3(caisse: Pick<Caisse, "longueur_mm" | "largeur_mm" | "hauteur_mm" | "type_envoi_caisse">): number {
  const volInterne = volumeInterneM3(caisse);
  if (!estCaisse4C(caisse.type_envoi_caisse)) return volInterne;
  return Math.max(0, volInterne - volumeMousseM3(caisse));
}

export function calculerCaisse(
  caisse: Caisse,
  articlesDeLaCaisse: Article[],
  seuilDefautAffaire: number,
): CaisseCalculee {
  const seuilEffectif = caisse.seuil_pct ?? seuilDefautAffaire;
  const volInterne = volumeInterneM3(caisse);
  const volOccupe = articlesDeLaCaisse.reduce(
    (sum, a) => sum + volumeUnitaireM3(a) * a.quantite,
    0,
  );
  const poidsTotal = articlesDeLaCaisse.reduce(
    (sum, a) => sum + a.poids_unitaire_kg * a.quantite,
    0,
  );
  const tauxRemplissage = volInterne > 0 ? volOccupe / volInterne : 0;
  const estSurcharge = volOccupe > volInterne;

  let niveauAlerte: CaisseCalculee["niveauAlerte"] = "ok";
  if (estSurcharge) {
    niveauAlerte = "alerte";
  } else if (tauxRemplissage * 100 >= seuilEffectif) {
    niveauAlerte = "attention";
  }

  return {
    ...caisse,
    seuilEffectif,
    volumeInterneM3: volInterne,
    volumeOccupeM3: volOccupe,
    volumeDisponibleM3: volumeDisponibleM3(caisse),
    poidsTotalKg: poidsTotal,
    tauxRemplissage,
    estSurcharge,
    niveauAlerte,
  };
}

export interface RecapAffaire {
  dim1MaxMm: number;
  dim2MaxMm: number;
  dim3MaxMm: number;
  volumeTotalM3: number;
  poidsTotalKg: number;
}

export function calculerRecapAffaire(articles: Article[]): RecapAffaire {
  return {
    dim1MaxMm: articles.reduce((max, a) => Math.max(max, a.dim1_mm), 0),
    dim2MaxMm: articles.reduce((max, a) => Math.max(max, a.dim2_mm), 0),
    dim3MaxMm: articles.reduce((max, a) => Math.max(max, a.dim3_mm), 0),
    volumeTotalM3: articles.reduce((sum, a) => sum + volumeUnitaireM3(a) * a.quantite, 0),
    poidsTotalKg: articles.reduce((sum, a) => sum + a.poids_unitaire_kg * a.quantite, 0),
  };
}

export function articlesParCaisse(articles: Article[]): Map<number, Article[]> {
  const map = new Map<number, Article[]>();
  for (const a of articles) {
    if (a.caisse_id === null) continue;
    const list = map.get(a.caisse_id) ?? [];
    list.push(a);
    map.set(a.caisse_id, list);
  }
  return map;
}
