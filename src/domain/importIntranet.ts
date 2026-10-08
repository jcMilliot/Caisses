import type { Article } from "./types";

// Ligne du picking de l'intranet, telle que lue par le backend (`commands/intranet.rs`).
export interface LignePicking {
  normm: number | null;
  ar: string;
  reference: string;
  designation: string;
  dim1_mm: number;
  dim2_mm: number;
  dim3_mm: number;
  poids_unitaire_kg: number;
  // QTARF — null = ligne supprimée dans l'intranet.
  quantite: number | null;
  qte_initiale: number | null;
}

export interface ArticleIntranet {
  normm: number;
  ar: string;
  reference: string;
  designation: string;
  dim1_mm: number;
  dim2_mm: number;
  dim3_mm: number;
  poids_unitaire_kg: number;
  quantite: number;
  qte_initiale: number | null;
  supprime_intranet: boolean;
}

export interface PlanImport {
  supprimer_ids: number[];
  ajouts: ArticleIntranet[];
  modifs: (ArticleIntranet & { id: number })[];
  anomalies: string[];
}

export interface Modification {
  avant: Article;
  apres: ArticleIntranet;
  // Libellés lisibles : « Qté 2 → 1 », « Désignation modifiée »…
  changements: string[];
}

export interface ResultatImport {
  plan: PlanImport;
  // Articles collés depuis Excel remplacés (premier import).
  remplaces: Article[];
  ajoutes: ArticleIntranet[];
  modifies: Modification[];
  supprimes: Article[];
  revenus: Article[];
}

// Seules les lignes AR sont importées : « ZR » = pièces à assembler par un autre service, et les
// autres préfixes ne sont pas des articles à caser (décisions du 2026-10-07).
export function estLigneAR(ar: string): boolean {
  return /^AR/i.test(ar.trim());
}

/**
 * Référence fournisseur reçue de l'intranet, mise en forme (décision du 2026-10-07) :
 * - un préfixe suivi de « / » est retiré (« FOURN/PLAKORM01M1GMP084A » → « PLAKORM01M1GMP084A ») ;
 * - une référence « PL… » est découpée en PL - 8 caractères - 4 - 3 - le reste
 *   (« PL-AKORM01M-1GMP-084-A »). Déjà découpée (contient « - ») ou trop courte : laissée telle quelle.
 */
export function formaterReferenceFournisseur(reference: string): string {
  let r = reference.trim();
  const slash = r.indexOf("/");
  if (slash > 0) r = r.slice(slash + 1).trim();
  if (/^PL/i.test(r) && !r.includes("-") && r.length >= 17) {
    r = [r.slice(0, 2), r.slice(2, 10), r.slice(10, 14), r.slice(14, 17), r.slice(17)].filter((p) => p !== "").join("-");
  }
  return r;
}

type LigneAvecBesoin = LignePicking & { normm: number };

const CHAMPS: { cle: keyof ArticleIntranet & keyof Article; libelle: string; texte?: boolean }[] = [
  { cle: "ar", libelle: "AR", texte: true },
  { cle: "reference", libelle: "Référence", texte: true },
  { cle: "designation", libelle: "Désignation", texte: true },
  { cle: "dim1_mm", libelle: "Dim1" },
  { cle: "dim2_mm", libelle: "Dim2" },
  { cle: "dim3_mm", libelle: "Dim3" },
  { cle: "poids_unitaire_kg", libelle: "Poids" },
  { cle: "quantite", libelle: "Qté" },
];

function egal(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-6;
  return a === b;
}

function versArticle(l: LigneAvecBesoin, quantite: number, supprime: boolean): ArticleIntranet {
  return {
    normm: l.normm,
    ar: l.ar,
    reference: formaterReferenceFournisseur(l.reference),
    designation: l.designation,
    dim1_mm: l.dim1_mm,
    dim2_mm: l.dim2_mm,
    dim3_mm: l.dim3_mm,
    poids_unitaire_kg: l.poids_unitaire_kg,
    quantite,
    qte_initiale: l.qte_initiale,
    supprime_intranet: supprime,
  };
}

/**
 * Compare le picking de l'intranet aux articles de l'affaire et prépare ce qu'il faut écrire.
 * - Premier import : les articles collés depuis Excel (sans numéro de besoin) sont remplacés.
 * - Une ligne est reconnue par son numéro de besoin (`normm`), même si son AR revient plusieurs
 *   fois. Sans numéro de besoin : pas importée, listée en anomalie.
 * - QTARF null (ou ligne absente du picking) : l'article sort du tableau (supprime_intranet) et de
 *   sa caisse ; il revient s'il réapparaît avec une quantité.
 * - Les articles collés après l'import (sans numéro de besoin) ne sont pas touchés.
 */
export function comparerPicking(articles: Article[], lignes: LignePicking[], premierImport: boolean): ResultatImport {
  const lignesAR = lignes.filter((l) => estLigneAR(l.ar));
  const anomalies = lignesAR.filter((l) => l.normm === null).map((l) => l.ar);
  const parBesoin = new Map<number, LigneAvecBesoin>();
  for (const l of lignesAR) if (l.normm !== null) parBesoin.set(l.normm, l as LigneAvecBesoin);

  const remplaces = premierImport ? articles.filter((a) => a.normm === null) : [];
  const existants = new Map<number, Article>();
  for (const a of articles) if (a.normm !== null) existants.set(a.normm, a);

  const ajoutes: ArticleIntranet[] = [];
  const modifies: Modification[] = [];
  const supprimes: Article[] = [];
  const revenus: Article[] = [];

  for (const l of parBesoin.values()) {
    const avant = existants.get(l.normm);
    if (!avant) {
      if (l.quantite !== null) ajoutes.push(versArticle(l, l.quantite, false));
      continue;
    }
    const supprime = l.quantite === null;
    if (supprime && !avant.supprime_intranet) {
      supprimes.push(avant);
      continue;
    }
    if (!supprime && avant.supprime_intranet) {
      revenus.push(avant);
      continue;
    }
    // Ligne supprimée : on garde la dernière quantité connue (QTARF est vide).
    const apres = versArticle(l, l.quantite ?? avant.quantite, supprime);
    const changements = CHAMPS.filter((c) => !egal(avant[c.cle], apres[c.cle])).map((c) =>
      c.texte ? `${c.libelle} modifiée` : `${c.libelle} ${avant[c.cle] || "—"} → ${apres[c.cle] || "—"}`,
    );
    // Qté initiale seule modifiée : écrite sans être annoncée.
    if (changements.length > 0 || avant.qte_initiale !== apres.qte_initiale) modifies.push({ avant, apres, changements });
  }
  // Ligne disparue du picking : traitée comme supprimée.
  for (const a of existants.values()) {
    if (!parBesoin.has(a.normm!) && !a.supprime_intranet) supprimes.push(a);
  }

  const versModif = (a: Article, supprime: boolean): ArticleIntranet & { id: number } => {
    const l = parBesoin.get(a.normm!);
    // Ligne disparue du picking : on garde l'article tel quel (référence déjà mise en forme).
    if (!l) return { ...a, normm: a.normm!, supprime_intranet: supprime };
    return { ...versArticle(l, l.quantite ?? a.quantite, supprime), id: a.id };
  };

  const plan: PlanImport = {
    supprimer_ids: remplaces.map((a) => a.id),
    ajouts: ajoutes,
    modifs: [
      ...modifies.map((m) => ({ ...m.apres, id: m.avant.id })),
      ...supprimes.map((a) => versModif(a, true)),
      ...revenus.map((a) => versModif(a, false)),
    ],
    anomalies,
  };
  return { plan, remplaces, ajoutes, modifies: modifies.filter((m) => m.changements.length > 0), supprimes, revenus };
}

export function aucunChangement(r: ResultatImport): boolean {
  return r.remplaces.length + r.ajoutes.length + r.modifies.length + r.supprimes.length + r.revenus.length === 0;
}
