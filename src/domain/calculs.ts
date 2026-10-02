import type { Article, ArticleTropGrand, Caisse, CaisseCalculee } from "./types";
import { estCaisse4C } from "./demandeOptions";

const MM3_TO_M3 = 1_000_000_000;
const EPAISSEUR_MOUSSE_M = 0.025;

// Charge maximale au sol d'une caisse : poids des articles / surface du fond (L × l). Décidé avec
// l'utilisateur le 2026-10-02 : 320 kg/m² par défaut, réglable dans Admin › Paramètres
// (`poids_max_kg_m2`), alerte dès que la valeur est atteinte (≥). Le poids de la caisse elle-même
// (bois) n'est pas calculé : il est couvert par la marge prise sur ce seuil.
export const POIDS_MAX_KG_M2_DEFAUT = 320;

export function volumeUnitaireM3(article: Pick<Article, "dim1_mm" | "dim2_mm" | "dim3_mm">): number {
  return (article.dim1_mm * article.dim2_mm * article.dim3_mm) / MM3_TO_M3;
}

// Champs de l'article considérés comme "donnée manquante" pour le bouton "Manque
// d'informations" — distinct de l'alerte "article > caisse" (qui suppose des dimensions déjà
// renseignées). Une valeur à 0 ou négative est traitée comme manquante : aucune pièce réelle n'a
// une dimension ou un poids nul.
export type ChampArticleManquant = "dim1_mm" | "dim2_mm" | "dim3_mm" | "poids_unitaire_kg";

export function champsManquants(
  article: Pick<Article, "dim1_mm" | "dim2_mm" | "dim3_mm" | "poids_unitaire_kg">,
): ChampArticleManquant[] {
  const champs: ChampArticleManquant[] = [];
  if (article.dim1_mm <= 0) champs.push("dim1_mm");
  if (article.dim2_mm <= 0) champs.push("dim2_mm");
  if (article.dim3_mm <= 0) champs.push("dim3_mm");
  if (article.poids_unitaire_kg <= 0) champs.push("poids_unitaire_kg");
  return champs;
}

// Affichage d'un volume en m³, arrondi par excès (jamais sous-estimé visuellement) et avec une
// précision adaptée : 3 décimales pour les volumes usuels, mais élargie automatiquement pour les
// petites pièces (vis, joints...) dont le volume réel est non nul mais s'arrondirait à "0.000" en
// 3 décimales — on cherche le nombre de décimales qui donne au moins 2 chiffres significatifs,
// pas juste une valeur non nulle (sinon toutes les petites pièces afficheraient le même 0.001).
export function formaterVolumeM3(volumeM3: number): string {
  if (volumeM3 <= 0) return (0).toFixed(3);
  for (let decimales = 3; decimales <= 9; decimales++) {
    const echelle = 10 ** decimales;
    const arrondi = Math.ceil(volumeM3 * echelle) / echelle;
    if (arrondi >= 10 / echelle || decimales === 9) return arrondi.toFixed(decimales);
  }
  return volumeM3.toFixed(9);
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
  poidsMaxKgM2: number = POIDS_MAX_KG_M2_DEFAUT,
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

  // Articles qui ne rentrent pas : comparaison stricte des axes (dim1↔longueur, dim2↔largeur,
  // dim3↔hauteur). Tolérance de 0,5 mm pour absorber les arrondis. Ignoré si la caisse n'a pas
  // encore de dimensions (0) — sinon tout article dépasserait.
  const articlesTropGrands: ArticleTropGrand[] = [];
  if (caisse.longueur_mm > 0 || caisse.largeur_mm > 0 || caisse.hauteur_mm > 0) {
    for (const a of articlesDeLaCaisse) {
      const depassements: ArticleTropGrand["depassements"] = [];
      if (a.dim1_mm - caisse.longueur_mm > 0.5)
        depassements.push({ axe: "longueur", article: a.dim1_mm, caisse: caisse.longueur_mm });
      if (a.dim2_mm - caisse.largeur_mm > 0.5)
        depassements.push({ axe: "largeur", article: a.dim2_mm, caisse: caisse.largeur_mm });
      if (a.dim3_mm - caisse.hauteur_mm > 0.5)
        depassements.push({ axe: "hauteur", article: a.dim3_mm, caisse: caisse.hauteur_mm });
      if (depassements.length > 0) articlesTropGrands.push({ article: a, depassements });
    }
  }

  const surfaceFondM2 = (caisse.longueur_mm * caisse.largeur_mm) / 1_000_000;
  const poidsParM2 = surfaceFondM2 > 0 ? poidsTotal / surfaceFondM2 : 0;
  const poidsTropLourd = surfaceFondM2 > 0 && poidsParM2 >= poidsMaxKgM2;

  let niveauAlerte: CaisseCalculee["niveauAlerte"] = "ok";
  if (estSurcharge || articlesTropGrands.length > 0 || poidsTropLourd) {
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
    dim1MaxMm: articlesDeLaCaisse.reduce((max, a) => Math.max(max, a.dim1_mm), 0),
    dim2MaxMm: articlesDeLaCaisse.reduce((max, a) => Math.max(max, a.dim2_mm), 0),
    dim3MaxMm: articlesDeLaCaisse.reduce((max, a) => Math.max(max, a.dim3_mm), 0),
    articlesTropGrands,
    surfaceFondM2,
    poidsParM2,
    poidsTropLourd,
    poidsMaxKgM2,
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

export interface CapaciteAffaire {
  // Volume cumulé de tous les articles de l'affaire (assignés + non assignés).
  volumeArticlesM3: number;
  // Capacité utile cumulée des caisses = Σ (volume interne, mousse déduite pour les 4C) × seuil.
  capaciteUtileM3: number;
  // true si au moins une caisse existe et a des dimensions, et que le volume des articles
  // dépasse la capacité utile. false si aucune caisse, ou si une caisse n'a pas de dimensions.
  depasse: boolean;
}

export function calculerCapaciteAffaire(
  articles: Article[],
  caisses: Caisse[],
  seuilDefautAffaire: number,
): CapaciteAffaire {
  const volumeArticlesM3 = articles.reduce((sum, a) => sum + volumeUnitaireM3(a) * a.quantite, 0);

  const caisseSansDimensions = caisses.some(
    (c) => c.longueur_mm <= 0 || c.largeur_mm <= 0 || c.hauteur_mm <= 0,
  );

  const capaciteUtileM3 = caisses.reduce((sum, c) => {
    const seuil = (c.seuil_pct ?? seuilDefautAffaire) / 100;
    return sum + volumeDisponibleM3(c) * seuil;
  }, 0);

  const depasse =
    caisses.length > 0 &&
    !caisseSansDimensions &&
    volumeArticlesM3 > capaciteUtileM3;

  return { volumeArticlesM3, capaciteUtileM3, depasse };
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
