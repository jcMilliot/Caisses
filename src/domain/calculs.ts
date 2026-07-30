import type { Article, Caisse, CaisseCalculee } from "./types";

const MM3_TO_M3 = 1_000_000_000;

export function volumeUnitaireM3(article: Pick<Article, "dim1_mm" | "dim2_mm" | "dim3_mm">): number {
  return (article.dim1_mm * article.dim2_mm * article.dim3_mm) / MM3_TO_M3;
}

export function volumeInterneM3(caisse: Pick<Caisse, "longueur_mm" | "largeur_mm" | "hauteur_mm">): number {
  return (caisse.longueur_mm * caisse.largeur_mm * caisse.hauteur_mm) / MM3_TO_M3;
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
    poidsTotalKg: poidsTotal,
    tauxRemplissage,
    estSurcharge,
    niveauAlerte,
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
