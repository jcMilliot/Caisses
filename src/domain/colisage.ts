import type { Article, CaisseCalculee, CaisseColisage, CartonConso } from "./types";
import { volumeUnitaireM3 } from "./calculs";

// Onglet Colisage de Simulations (2026-10-14). `article.colis` = `pack_tag` de l'intranet :
// un chiffre = un colis (carton choisi dans Consommable › Cartons conso), une lettre = pièces
// mises directement dans une caisse (pas de carton).

export function estColisChiffre(tag: string): boolean {
  return /^\d+$/.test(tag);
}

export interface GroupeColis {
  tag: string;
  estColis: boolean;
  articles: Article[];
  // Somme des volumes unitaires × quantité (m³).
  volumePiecesM3: number;
  poidsPiecesKg: number;
}

export interface ControleColis {
  // Volume extérieur du carton (décision du 2026-10-14 : comparé aux dimensions extérieures).
  volumeCartonM3: number;
  depasseVolume: boolean;
  // Pièces qui ne rentrent pas dans le carton, quelle que soit leur orientation (hors acceptées).
  piecesTropGrandes: Article[];
  // Pièces qui ne rentrent pas sur les 3 axes mais acceptées pour ce carton (en diagonale).
  piecesAcceptees: Article[];
  // Lignes dont le volume (unitaire × quantité) dépasse à lui seul celui du carton : souvent des
  // dimensions de boîte saisies dans l'intranet à la place de celles de la pièce (2026-10-27).
  // Hors lignes acceptées pour ce carton (pièce en sachet : dimensions du sachet, pièce + air).
  lignesTropVolumineuses: Article[];
  // Lignes acceptées : seule leur alerte disparaît, leur volume compte toujours dans le colis.
  lignesVolumeAcceptees: Article[];
}

// Groupes des articles colisés : lettres d'abord (A, B, C…), puis colis par numéro (1, 2, 10…).
export function grouperColis(articles: Article[]): GroupeColis[] {
  const parTag = new Map<string, Article[]>();
  for (const a of articles) {
    const tag = a.colis.trim();
    if (tag === "") continue;
    parTag.set(tag, [...(parTag.get(tag) ?? []), a]);
  }
  const groupes = [...parTag.entries()].map(([tag, arts]) => ({
    tag,
    estColis: estColisChiffre(tag),
    articles: arts,
    volumePiecesM3: arts.reduce((s, a) => s + volumeUnitaireM3(a) * a.quantite, 0),
    poidsPiecesKg: arts.reduce((s, a) => s + a.poids_unitaire_kg * a.quantite, 0),
  }));
  return groupes.sort((a, b) => {
    if (a.estColis !== b.estColis) return a.estColis ? 1 : -1;
    if (a.estColis) return Number(a.tag) - Number(b.tag);
    return a.tag.localeCompare(b.tag);
  });
}

function volumePieces(articles: Article[]): number {
  return articles.reduce((s, a) => s + volumeUnitaireM3(a) * a.quantite, 0);
}

function poidsPieces(articles: Article[]): number {
  return articles.reduce((s, a) => s + a.poids_unitaire_kg * a.quantite, 0);
}

function dimsTriees(d1: number, d2: number, d3: number): number[] {
  return [d1, d2, d3].sort((a, b) => b - a);
}

// Une pièce rentre si, dimensions triées de part et d'autre, chacune tient dans celle du carton
// (rotation libre, décision du 2026-10-14). Comparée à l'intérieur du carton : une pièce doit
// tenir dedans. Cote égale acceptée, sans tolérance au-delà (décision du 2026-10-27).
export function pieceRentre(a: Pick<Article, "dim1_mm" | "dim2_mm" | "dim3_mm">, carton: CartonConso): boolean {
  const p = dimsTriees(a.dim1_mm, a.dim2_mm, a.dim3_mm);
  const c = dimsTriees(carton.longueur_mm, carton.largeur_mm, carton.hauteur_mm);
  return p.every((d, i) => d <= c[i]);
}

// Clé du carton d'un colis, pour les pièces acceptées : une acceptation ne vaut que pour le carton
// choisi au moment du clic (2026-10-15).
export function cleCarton(c: CartonConso): string {
  return c.id === 0 ? `libre:${c.ext_longueur_mm}x${c.ext_largeur_mm}x${c.ext_hauteur_mm}` : `conso:${c.id}`;
}

// `acceptees` / `accepteesVolume` : article → clé du carton pour lequel l'alerte de dimensions /
// de volume de la pièce a été acceptée.
export function controlerColis(
  groupe: GroupeColis,
  carton: CartonConso,
  acceptees: Map<number, string> = new Map(),
  accepteesVolume: Map<number, string> = new Map(),
): ControleColis {
  const volumeCartonM3 = (carton.ext_longueur_mm * carton.ext_largeur_mm * carton.ext_hauteur_mm) / 1e9;
  const cle = cleCarton(carton);
  const horsDimensions = groupe.articles.filter((a) => !pieceRentre(a, carton));
  const tropVolumineuses = groupe.articles.filter((a) => volumeUnitaireM3(a) * a.quantite > volumeCartonM3);
  return {
    volumeCartonM3,
    depasseVolume: groupe.volumePiecesM3 > volumeCartonM3,
    piecesTropGrandes: horsDimensions.filter((a) => acceptees.get(a.id) !== cle),
    piecesAcceptees: horsDimensions.filter((a) => acceptees.get(a.id) === cle),
    lignesTropVolumineuses: tropVolumineuses.filter((a) => accepteesVolume.get(a.id) !== cle),
    lignesVolumeAcceptees: tropVolumineuses.filter((a) => accepteesVolume.get(a.id) === cle),
  };
}

// ——— Carton libre (2026-10-15) ———
// Carton de récup, non géré dans Consommable : seules les dimensions extérieures sont saisies,
// l'intérieur vaut 2 mm de moins sur chaque axe (épaisseur du carton, décision de l'utilisateur).
// Représenté comme un CartonConso d'id 0 pour réutiliser les mêmes calculs.
export const ID_CARTON_LIBRE = 0;
export const EPAISSEUR_CARTON_LIBRE_MM = 2;

export function estCartonLibre(c: CartonConso): boolean {
  return c.id === ID_CARTON_LIBRE;
}

export function cartonLibre(ext: [number, number, number], poidsKg: number): CartonConso {
  const int = (d: number) => Math.max(0, d - EPAISSEUR_CARTON_LIBRE_MM);
  return {
    id: ID_CARTON_LIBRE,
    nom: "Carton libre",
    longueur_mm: int(ext[0]),
    largeur_mm: int(ext[1]),
    hauteur_mm: int(ext[2]),
    ext_longueur_mm: ext[0],
    ext_largeur_mm: ext[1],
    ext_hauteur_mm: ext[2],
    poids_kg: poidsKg,
    ordre: 0,
  };
}

// ——— Caisses colisage et comparatif (2026-10-14) ———

// Rang proposé d'une lettre : A → 1re caisse colisage, B → 2e… (lettre seule A-Z, sinon aucun).
export function rangPropose(tag: string): number | null {
  return /^[A-Z]$/i.test(tag) ? tag.toUpperCase().charCodeAt(0) - 65 : null;
}

// Lettre d'une caisse colisage d'après son rang (1re = A…), affichée devant son nom : en multi-
// caisses, elles portent souvent le même nom (2026-10-15). Au-delà de Z : numéro.
export function lettreCaisse(rang: number): string {
  return rang < 26 ? String.fromCharCode(65 + rang) : String(rang + 1);
}

export function libelleCaisseColisage(rang: number, nom: string): string {
  return `${lettreCaisse(rang)} — ${nom || "(sans nom)"}`;
}

export interface GroupeRange extends GroupeColis {
  carton: CartonConso | undefined;
  // Volume compté dans la caisse : volume extérieur du carton pour un colis qui en a un, sinon
  // celui des pièces (lettre, ou colis sans carton choisi).
  volumeM3: number;
  // Pièces + poids du carton (s'il est saisi).
  poidsKg: number;
  caisseId: number | null;
  // Caisse imposée (pas de choix à la main) et pourquoi : lettre (caisse de même rang), colis dont
  // l'intranet donne la caisse, ou colis d'une affaire à une seule caisse colisage (2026-10-28).
  imposee: "lettre" | "intranet" | "seule" | null;
  // Lettre de la caisse imposée (« A »…), même si cette caisse n'existe pas (encore) au colisage.
  lettreImposee: string | null;
}

export interface CaisseColisageCalculee {
  caisse: CaisseColisage;
  groupes: GroupeRange[];
  // Articles pas encore colisés assignés dans le Picking à la caisse copiée : comptés avec le
  // volume de leurs pièces (2026-10-30).
  nonColises: Article[];
  volumeInterneM3: number;
  volumeOccupeM3: number;
  poidsKg: number;
  taux: number;
  niveau: "ok" | "attention" | "alerte";
  // Caisse des Informations générales copiée, pour la comparaison.
  source: CaisseCalculee | undefined;
}

// Comparatif Picking / Colisage en cours (revu le 2026-10-30) : la colonne « Colisage en cours »
// part du picking — pièces non colisées au volume de leurs pièces — et chaque colis remplace ses
// pièces par le volume extérieur de son carton (une fois pour tout le colis) ; une lettre ou un
// colis sans carton garde le volume de ses pièces. Le taux s'affine ainsi au fil du colisage.
export interface TotauxColisage {
  // Colis et lettres + pièces non colisées.
  volumeColisageM3: number;
  poidsColisageKg: number;
  volumeInfosM3: number;
  poidsInfosKg: number;
  nbArticlesNonColises: number;
  nbColisSansCarton: number;
  nbNonRanges: number;
}

export function calculerColisage(params: {
  groupes: GroupeColis[];
  cartonParTag: Map<string, CartonConso>;
  // Rangements choisis à la main (tag → caisse colisage, null = non rangé).
  rangements: Map<string, number | null>;
  // Caisse (lettre) de chaque colis d'après l'intranet (tag → lettre).
  caissesIntranet: Map<string, string>;
  caisses: CaisseColisage[];
  seuilPct: number;
  caissesInfos: CaisseCalculee[];
  // Articles de l'affaire (hors supprimés dans l'intranet), base du total des Informations générales.
  articles: Article[];
}): { groupes: GroupeRange[]; caisses: CaisseColisageCalculee[]; totaux: TotauxColisage } {
  const { cartonParTag, rangements, caissesIntranet, caisses, seuilPct, caissesInfos, articles } = params;
  const idsCaisses = new Set(caisses.map((c) => c.id));

  const groupes: GroupeRange[] = params.groupes.map((g) => {
    const carton = g.estColis ? cartonParTag.get(g.tag) : undefined;
    const volumeCarton = carton ? (carton.ext_longueur_mm * carton.ext_largeur_mm * carton.ext_hauteur_mm) / 1e9 : 0;
    let caisseId: number | null = null;
    let imposee: GroupeRange["imposee"] = null;
    let lettreImposee: string | null = null;
    // Caisse imposée par une lettre : celle de même rang (A → 1re caisse colisage…).
    const imposer = (lettre: string, motif: "lettre" | "intranet") => {
      imposee = motif;
      lettreImposee = lettre.toUpperCase();
      const rang = rangPropose(lettre);
      if (rang !== null && rang < caisses.length) caisseId = caisses[rang].id;
    };
    const lettreIntranet = g.estColis ? caissesIntranet.get(g.tag) : undefined;
    if (!g.estColis) {
      // Lettre : non modifiable (2026-10-15) — un rangement enregistré auparavant est ignoré.
      imposer(g.tag, "lettre");
    } else if (lettreIntranet) {
      // Colis rangé dans une caisse dans l'intranet : imposé, prioritaire sur le choix à la main.
      imposer(lettreIntranet, "intranet");
    } else if (caisses.length === 1) {
      // Une seule caisse colisage : le colis y va d'office.
      caisseId = caisses[0].id;
      imposee = "seule";
      lettreImposee = lettreCaisse(0);
    } else if (rangements.has(g.tag)) {
      const choisi = rangements.get(g.tag)!;
      caisseId = choisi !== null && idsCaisses.has(choisi) ? choisi : null;
    }
    return {
      ...g,
      carton,
      volumeM3: carton ? volumeCarton : g.volumePiecesM3,
      poidsKg: g.poidsPiecesKg + (carton?.poids_kg ?? 0),
      caisseId,
      imposee,
      lettreImposee,
    };
  });

  const caissesCalculees = caisses.map((c): CaisseColisageCalculee => {
    const dedans = groupes.filter((g) => g.caisseId === c.id);
    // Pièce non colisée : caisse où elle est assignée dans le Picking. Une pièce colisée compte
    // dans la caisse de son colis / sa lettre ; un colis non rangé, dans le total seulement.
    const nonColises =
      c.source_caisse_id === null ? [] : articles.filter((a) => a.colis.trim() === "" && a.caisse_id === c.source_caisse_id);
    const volumeInterneM3 = (c.longueur_mm * c.largeur_mm * c.hauteur_mm) / 1e9;
    const volumeOccupeM3 = dedans.reduce((s, g) => s + g.volumeM3, 0) + volumePieces(nonColises);
    const taux = volumeInterneM3 > 0 ? volumeOccupeM3 / volumeInterneM3 : 0;
    const niveau = volumeOccupeM3 > volumeInterneM3 && volumeInterneM3 > 0 ? "alerte" : taux * 100 >= seuilPct ? "attention" : "ok";
    return {
      caisse: c,
      groupes: dedans,
      nonColises,
      volumeInterneM3,
      volumeOccupeM3,
      poidsKg: dedans.reduce((s, g) => s + g.poidsKg, 0) + poidsPieces(nonColises),
      taux,
      niveau,
      source: c.source_caisse_id !== null ? caissesInfos.find((ci) => ci.id === c.source_caisse_id) : undefined,
    };
  });

  return { groupes, caisses: caissesCalculees, totaux: calculerTotaux(groupes, articles) };
}

// Comparatif colisage / picking sur un ensemble de colis et lettres et les articles du picking
// correspondants (toute l'affaire, ou un envoi — envoi en partiel, 2026-10-29).
export function calculerTotaux(groupes: GroupeRange[], articles: Article[]): TotauxColisage {
  const nonColises = articles.filter((a) => a.colis.trim() === "");
  return {
    volumeColisageM3: groupes.reduce((s, g) => s + g.volumeM3, 0) + volumePieces(nonColises),
    poidsColisageKg: groupes.reduce((s, g) => s + g.poidsKg, 0) + poidsPieces(nonColises),
    volumeInfosM3: volumePieces(articles),
    poidsInfosKg: poidsPieces(articles),
    nbArticlesNonColises: nonColises.length,
    nbColisSansCarton: groupes.filter((g) => g.estColis && !g.carton).length,
    nbNonRanges: groupes.filter((g) => g.caisseId === null).length,
  };
}
