// Contrôle dimensionnel (2026-11-16, ADR 0004) — logique pure : répartition des AR du référentiel
// entre « à contrôler », « validés » et « dimensions corrigées », d'après le seuil et la durée de
// validité réglés dans l'Admin.
import type { ControleDimension, ReglagesControle } from "./types";

export type EtatControle =
  | "nouveau" // jamais contrôlé
  | "recontrole" // contrôle expiré
  | "valide" // contrôle encore valable
  | "corrige_attente"; // mesures corrigées, pas encore reportées dans l'ERP

/** Horodatage UTC « AAAA-MM-JJ HH:MM:SS » → Date. */
function versDate(horodatage: string): Date {
  return new Date(horodatage.replace(" ", "T") + "Z");
}

/** 2 dimensions sur 3 (valeurs de l'ERP) au moins égales au seuil (≥, retour du 2026-11-16). */
export function depasseSeuil(c: Pick<ControleDimension, "dim1_mm" | "dim2_mm" | "dim3_mm">, seuilMm: number): boolean {
  return [c.dim1_mm, c.dim2_mm, c.dim3_mm].filter((d) => d >= seuilMm).length >= 2;
}

/** Début de validité du dernier contrôle : sa date, ou celle du report dans l'ERP s'il a corrigé. */
export function debutValidite(c: ControleDimension): string | null {
  return c.corrige ? c.erp_valide_le : c.controle_le;
}

/** Date du prochain contrôle (même jour, N mois calendaires plus tard), à minuit locale. */
export function prochainControle(c: ControleDimension, dureeMois: number): Date | null {
  const debut = debutValidite(c);
  if (!debut) return null;
  const d = versDate(debut);
  const jour = d.getDate();
  const e = new Date(d.getFullYear(), d.getMonth() + dureeMois, 1);
  // 31 janvier + 1 mois → dernier jour de février, pas 3 mars.
  const dernierJour = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate();
  e.setDate(Math.min(jour, dernierJour));
  return e;
}

export function etatControle(c: ControleDimension, dureeMois: number, maintenant: Date = new Date()): EtatControle {
  if (c.corrige && !c.erp_valide_le) return "corrige_attente";
  const echeance = prochainControle(c, dureeMois);
  if (!echeance) return "nouveau";
  return maintenant >= echeance ? "recontrole" : "valide";
}

export interface ListesControle {
  aControler: ControleDimension[];
  valides: ControleDimension[];
  /** Toutes les lignes dont le dernier contrôle a corrigé les mesures, quel que soit le seuil. */
  corriges: ControleDimension[];
}

export function repartirControles(
  lignes: ControleDimension[],
  reglages: ReglagesControle,
  maintenant: Date = new Date(),
): ListesControle {
  const r: ListesControle = { aControler: [], valides: [], corriges: [] };
  for (const c of lignes) {
    if (c.corrige) r.corriges.push(c);
    if (!depasseSeuil(c, reglages.seuil_mm)) continue;
    const etat = etatControle(c, reglages.duree_mois, maintenant);
    if (etat === "nouveau" || etat === "recontrole") r.aControler.push(c);
    else if (etat === "valide") r.valides.push(c);
  }
  return r;
}

/** Nombre d'articles à contrôler (carte de l'accueil). */
export function nbAControler(lignes: ControleDimension[], reglages: ReglagesControle, maintenant: Date = new Date()): number {
  return repartirControles(lignes, reglages, maintenant).aControler.length;
}

// --- Lecture du picking en direct (2026-11-17) ----------------------------------------------
// À l'ouverture de la page (et par « Actualiser »), le picking de l'intranet de chaque affaire de
// Simulations pas entièrement expédiée est lu en direct (décision de l'utilisateur : on n'ouvre pas
// toutes les affaires de Simulations pour mettre à jour leur picking). Il sert à :
//   - faire entrer les nouveaux AR et rafraîchir les valeurs de l'ERP (référentiel) ;
//   - calculer « Affaires » (pièce présente, pas colisée) et « Dispo pour ctrl » (en stock ou
//     mouvementée). Pour une affaire dont le picking n'est pas lisible, on garde le calcul de la
//     base (articles de Simulations).

/** Affaires d'après la base (texte « A, B, C »). */
export function affairesDe(c: Pick<ControleDimension, "affaires">): string[] {
  return c.affaires
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a !== "");
}

/** Ligne du picking utile ici. */
export interface LigneStockPicking {
  ar: string;
  quantite: number | null;
  colis: string;
  qte_stock: number;
  qte_mouvementee: number;
  dim1_mm: number;
  dim2_mm: number;
  dim3_mm: number;
  poids_unitaire_kg: number;
}

/** Valeurs de l'ERP d'un AR, pour le référentiel. */
export interface ArticleErp {
  ar: string;
  dim1_mm: number;
  dim2_mm: number;
  dim3_mm: number;
  poids_kg: number;
}

export interface PickingLu {
  /** AR présents et pas colisés (AR en majuscules). */
  presents: Set<string>;
  /** Parmi eux, en stock ou mouvementés. */
  dispos: Set<string>;
  /** Lignes « AR… » non supprimées, pour le référentiel. */
  erp: ArticleErp[];
}

export function lirePickingControle(picking: LigneStockPicking[]): PickingLu {
  const r: PickingLu = { presents: new Set(), dispos: new Set(), erp: [] };
  for (const l of picking) {
    if (l.quantite === null) continue; // ligne supprimée dans l'intranet
    const ar = l.ar.trim().toUpperCase();
    if (!ar.startsWith("AR")) continue;
    r.erp.push({ ar, dim1_mm: l.dim1_mm, dim2_mm: l.dim2_mm, dim3_mm: l.dim3_mm, poids_kg: l.poids_unitaire_kg });
    if (l.colis.trim() !== "") continue;
    r.presents.add(ar);
    if (l.qte_stock > 0 || l.qte_mouvementee > 0) r.dispos.add(ar);
  }
  return r;
}

/** Ancien nom, gardé pour les vérifications : AR dispo d'un picking. */
export function arsDisponibles(picking: LigneStockPicking[]): Set<string> {
  return lirePickingControle(picking).dispos;
}

export type EtatPicking =
  | { etat: "chargement" }
  | ({ etat: "ok" } & PickingLu)
  | { etat: "erreur"; message: string };

export interface DispoControle {
  /** "oui" : dispo dans au moins une affaire ; "non" : nulle part (ou aucune affaire) ;
   *  "inconnu" : pas de réponse exploitable ; "chargement" : picking pas encore lu. */
  etat: "oui" | "non" | "inconnu" | "chargement";
  /** Affaires où la pièce est dispo. */
  affaires: string[];
  /** Affaires à afficher : picking lisible → pièce présente et pas colisée ; sinon d'après la base. */
  affairesAffichees: string[];
}

/** Index AR → affaires (nom d'origine) où l'AR est présent d'après un picking lisible. */
export function indexPresences(pickings: Map<string, EtatPicking>, noms: Map<string, string>): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const [cle, p] of pickings) {
    if (p.etat !== "ok") continue;
    const nom = noms.get(cle) ?? cle;
    for (const ar of p.presents) m.set(ar, [...(m.get(ar) ?? []), nom]);
  }
  return m;
}

export function dispoControle(
  c: Pick<ControleDimension, "ar" | "affaires">,
  pickings: Map<string, EtatPicking>,
  presences: Map<string, string[]> = new Map(),
): DispoControle {
  const ar = c.ar.trim().toUpperCase();
  // Candidates : affaires de la base + affaires où le picking en direct trouve la pièce.
  const candidates = new Map<string, string>();
  for (const a of [...affairesDe(c), ...(presences.get(ar) ?? [])]) candidates.set(a.toUpperCase(), a);
  const affichees: string[] = [];
  const dispo: string[] = [];
  let enCours = false;
  let erreur = false;
  for (const [cle, nom] of candidates) {
    const p = pickings.get(cle);
    if (p?.etat === "ok") {
      if (!p.presents.has(ar)) continue; // plus dans ce picking, ou colisée
      affichees.push(nom);
      if (p.dispos.has(ar)) dispo.push(nom);
    } else {
      affichees.push(nom); // pas de lecture exploitable : on garde la base
      if (!p || p.etat === "chargement") enCours = true;
      else erreur = true;
    }
  }
  affichees.sort();
  if (dispo.length > 0) return { etat: "oui", affaires: dispo, affairesAffichees: affichees };
  if (affichees.length === 0) return { etat: "non", affaires: [], affairesAffichees: [] };
  if (enCours) return { etat: "chargement", affaires: [], affairesAffichees: affichees };
  return { etat: erreur ? "inconnu" : "non", affaires: [], affairesAffichees: affichees };
}

// --- Export « À contrôler » : écart relevé − ERP (2026-11-17) --------------------------------
/** Formule Excel (en anglais, traduite par Excel) de l'écart relevé − ERP pour la ligne `ligne`
 *  (1 = en-tête). Vide tant que la mesure n'est pas saisie. La valeur ERP est écrite en texte avec
 *  un point (« 400.5 ») : relue par NUMBERVALUE(…, ".") quelle que soit la langue d'Excel ; la
 *  mesure saisie à la main peut être un nombre ou un texte avec virgule ou point. L'écart est
 *  rendu **en texte avec un point** (outil de l'utilisateur qui ne lit que le point) : arrondi à
 *  3 décimales, converti en texte (virgule dans un Excel français), virgule remplacée par un point. */
export function formuleEcart(colReleve: string, colErp: string, ligne: number): string {
  const r = `${colReleve}${ligne}`;
  const e = `${colErp}${ligne}`;
  const releve = `IF(ISNUMBER(${r}),${r},_xlfn.NUMBERVALUE(SUBSTITUTE(${r},",","."),"."))`;
  const ecart = `ROUND(${releve}-_xlfn.NUMBERVALUE(${e},"."),3)`;
  return `=IF(${r}="","",SUBSTITUTE(${ecart}&"",",","."))`;
}
