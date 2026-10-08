// Estimation du poids d'une caisse vide (+ mousse et bâche) à partir de ses dimensions
// intérieures (2026-10-08, d'après le fichier « Suivi dim et poids des caisses » de
// l'utilisateur, formules corrigées). Sert à l'alerte de charge de Simulations, qui compte
// désormais le poids de la caisse, et au tableau des caisses pesées (Admin › Caisses › Poids)
// qui permet de caler les masses volumiques.
//
// Modèle (m, kg/m³) — Li, li, Hi intérieures, e épaisseur de panneau, E = Li + 2e, F = li + 2e :
// - panneaux : couvercle + fond E × F, grands côtés E × Hi, bouts li × Hi (× 2 chacun, × e) ;
// - pieds : nb × section × F (en travers de la caisse) ;
// - tasseaux sous le fond (caisses en bois) : nb × section × Li ;
// - renforts : (nb sur la longueur × E + nb sur la largeur × li) × section ;
// - mousse : fond + 4 côtés (pas sur le dessus) ; bâche : 6 faces (elle dépasse pour être soudée).
// La tare du fabricant est à vide : sans mousse ni bâche.

import { estCaisse4C } from "./demandeOptions";
import type { Caisse, CaisseStock, PoidsCaisseCalcule } from "./types";

export type MatiereCaisse = "Contreplaqué" | "Bois";
export const MATIERES_ESTIMATION: MatiereCaisse[] = ["Contreplaqué", "Bois"];

export interface ReglagesPoidsCaisse {
  // Caisses en contreplaqué (STANDARD, 4B) — pieds en couches de bois reconstitué + contreplaqué.
  cp_masse_volumique: number;
  cp_epaisseur_mm: number;
  cp_pied_largeur_mm: number;
  cp_pied_hauteur_mm: number;
  cp_pied_masse_volumique: number;
  // Caisses en bois (4C) — panneaux de bois reconstitué, pieds en bois massif.
  bois_masse_volumique: number;
  bois_epaisseur_mm: number;
  bois_pied_largeur_mm: number;
  bois_pied_hauteur_mm: number;
  // Bois massif : pieds des caisses en bois, renforts, tasseaux.
  massif_masse_volumique: number;
  renfort_largeur_mm: number;
  renfort_epaisseur_mm: number;
  tasseau_largeur_mm: number;
  tasseau_hauteur_mm: number;
  mousse_masse_volumique: number;
  mousse_epaisseur_mm: number;
  bache_masse_volumique: number;
  bache_epaisseur_mm: number;
  // Au-delà de cette longueur extérieure : 3 pieds, sinon 2.
  seuil_3_pieds_mm: number;
  // Caisses de Simulations : tasseaux sous le fond (caisses en bois) comptés par défaut — réglé
  // seulement dans l'Admin (2026-10-08). Pas de renforts : ils ne sont saisis que sur les caisses
  // pesées.
  sim_tasseaux: number;
}

export const REGLAGES_POIDS_DEFAUT: ReglagesPoidsCaisse = {
  cp_masse_volumique: 560,
  cp_epaisseur_mm: 18,
  cp_pied_largeur_mm: 100,
  cp_pied_hauteur_mm: 110,
  cp_pied_masse_volumique: 750,
  // Calé sur la caisse en bois pesée le 2026-10-08 (140 kg), à affiner avec d'autres pesées.
  bois_masse_volumique: 916,
  bois_epaisseur_mm: 12,
  bois_pied_largeur_mm: 100,
  bois_pied_hauteur_mm: 100,
  // Tasseau pesé : 1110 × 90 × 72 mm pour 2,918 kg.
  massif_masse_volumique: 406,
  renfort_largeur_mm: 100,
  renfort_epaisseur_mm: 25,
  tasseau_largeur_mm: 55,
  tasseau_hauteur_mm: 75,
  mousse_masse_volumique: 22.5,
  mousse_epaisseur_mm: 20,
  bache_masse_volumique: 342,
  bache_epaisseur_mm: 1,
  seuil_3_pieds_mm: 2200,
  sim_tasseaux: 3,
};

// Réglages enregistrés (JSON partiel possible) complétés par les valeurs par défaut.
export function lireReglagesPoids(json: string | null): ReglagesPoidsCaisse {
  if (!json) return { ...REGLAGES_POIDS_DEFAUT };
  try {
    const lu = JSON.parse(json) as Partial<ReglagesPoidsCaisse>;
    const r = { ...REGLAGES_POIDS_DEFAUT };
    for (const k of Object.keys(r) as (keyof ReglagesPoidsCaisse)[]) {
      const v = lu[k];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) r[k] = v;
    }
    return r;
  } catch {
    return { ...REGLAGES_POIDS_DEFAUT };
  }
}

export interface CaisseAEstimer {
  longueur_mm: number;
  largeur_mm: number;
  hauteur_mm: number;
  matiere: MatiereCaisse;
  nbPieds: number;
  nbTasseaux: number;
  nbRenfortsLongueur: number;
  nbRenfortsLargeur: number;
  mousseBache: boolean;
}

export interface EstimationPoids {
  extLongueurMm: number;
  extLargeurMm: number;
  extHauteurMm: number;
  volumePanneauxM3: number;
  panneauxKg: number;
  piedsKg: number;
  tasseauxKg: number;
  renfortsKg: number;
  // Caisse vide (comparable à la tare) : panneaux + pieds + tasseaux + renforts.
  videKg: number;
  mousseKg: number;
  bacheKg: number;
  // Vide + mousse et bâche si la caisse en a.
  totalKg: number;
}

export function nbPiedsParDefaut(longueurInterieureMm: number, matiere: MatiereCaisse, r: ReglagesPoidsCaisse): number {
  const e = matiere === "Bois" ? r.bois_epaisseur_mm : r.cp_epaisseur_mm;
  return longueurInterieureMm + 2 * e > r.seuil_3_pieds_mm ? 3 : 2;
}

export function estimerPoidsCaisse(c: CaisseAEstimer, r: ReglagesPoidsCaisse): EstimationPoids {
  const bois = c.matiere === "Bois";
  const m = (mm: number) => mm / 1000;
  const e = m(bois ? r.bois_epaisseur_mm : r.cp_epaisseur_mm);
  const [Li, li, Hi] = [m(c.longueur_mm), m(c.largeur_mm), m(c.hauteur_mm)];
  const E = Li + 2 * e;
  const F = li + 2 * e;
  const piedL = m(bois ? r.bois_pied_largeur_mm : r.cp_pied_largeur_mm);
  const piedH = m(bois ? r.bois_pied_hauteur_mm : r.cp_pied_hauteur_mm);
  const tasseauH = c.nbTasseaux > 0 ? m(r.tasseau_hauteur_mm) : 0;

  const volumePanneauxM3 = (E * F + E * Hi + li * Hi) * 2 * e;
  const panneauxKg = volumePanneauxM3 * (bois ? r.bois_masse_volumique : r.cp_masse_volumique);
  const piedsKg = c.nbPieds * piedL * piedH * F * (bois ? r.massif_masse_volumique : r.cp_pied_masse_volumique);
  const tasseauxKg = c.nbTasseaux * m(r.tasseau_largeur_mm) * m(r.tasseau_hauteur_mm) * Li * r.massif_masse_volumique;
  const renfortsKg =
    (c.nbRenfortsLongueur * E + c.nbRenfortsLargeur * li) * m(r.renfort_largeur_mm) * m(r.renfort_epaisseur_mm) * r.massif_masse_volumique;
  const videKg = panneauxKg + piedsKg + tasseauxKg + renfortsKg;
  const mousseKg = c.mousseBache ? (Li * Hi * 2 + li * Hi * 2 + Li * li) * m(r.mousse_epaisseur_mm) * r.mousse_masse_volumique : 0;
  const bacheKg = c.mousseBache ? (Li * Hi * 2 + li * Hi * 2 + Li * li * 2) * m(r.bache_epaisseur_mm) * r.bache_masse_volumique : 0;

  return {
    extLongueurMm: E * 1000,
    extLargeurMm: F * 1000,
    extHauteurMm: (Hi + 2 * e + piedH + tasseauH) * 1000,
    volumePanneauxM3,
    panneauxKg,
    piedsKg,
    tasseauxKg,
    renfortsKg,
    videKg,
    mousseKg,
    bacheKg,
    totalKg: videKg + mousseKg + bacheKg,
  };
}

// Caisse pesée (Admin › Caisses › Poids).
export interface CaissePesee {
  id: number;
  affaire: string;
  longueur_mm: number;
  largeur_mm: number;
  hauteur_mm: number;
  tare_kg: number;
  nb_pieds: number;
  matiere: string;
  mousse_bache: boolean;
  nb_renforts_longueur: number;
  nb_renforts_largeur: number;
  nb_tasseaux: number;
}
export type NewCaissePesee = Omit<CaissePesee, "id">;

export function versCaisseAEstimer(c: NewCaissePesee): CaisseAEstimer {
  return {
    longueur_mm: c.longueur_mm,
    largeur_mm: c.largeur_mm,
    hauteur_mm: c.hauteur_mm,
    matiere: c.matiere === "Bois" ? "Bois" : "Contreplaqué",
    nbPieds: c.nb_pieds,
    nbTasseaux: c.nb_tasseaux,
    nbRenfortsLongueur: c.nb_renforts_longueur,
    nbRenfortsLargeur: c.nb_renforts_largeur,
    mousseBache: c.mousse_bache,
  };
}

/**
 * Masse volumique des panneaux qui fait le mieux correspondre les estimations aux tares des
 * caisses pesées de cette matière (moindres carrés : la tare moins les pieds, tasseaux et
 * renforts, rapportée au volume des panneaux). `null` s'il n'y a aucune caisse de cette matière.
 */
export function masseVolumiqueConseillee(
  caisses: NewCaissePesee[],
  matiere: MatiereCaisse,
  r: ReglagesPoidsCaisse,
): { valeur: number; nbCaisses: number } | null {
  let num = 0;
  let den = 0;
  let n = 0;
  for (const c of caisses) {
    const ce = versCaisseAEstimer(c);
    if (ce.matiere !== matiere || c.tare_kg <= 0) continue;
    const est = estimerPoidsCaisse(ce, r);
    const V = est.volumePanneauxM3;
    if (V <= 0) continue;
    const autres = est.piedsKg + est.tasseauxKg + est.renfortsKg;
    num += V * (c.tare_kg - autres);
    den += V * V;
    n++;
  }
  return n > 0 && den > 0 ? { valeur: num / den, nbCaisses: n } : null;
}

const kg1 = (kg: number) => kg.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Poids d'une caisse de Simulations (2026-10-08) : caisses 4C en bois avec mousse + bâche,
 * STANDARD et 4B en contreplaqué ; pieds selon la longueur ; tasseaux : valeur par défaut des
 * réglages (Admin) ; pas de renforts (saisis seulement sur les caisses pesées). Si elle utilise une caisse en stock dont la tare est connue : la tare (+ mousse et
 * bâche le cas échéant). `null` tant que la caisse n'a pas de dimensions.
 */
export function poidsDeLaCaisse(c: Caisse, caissesStock: CaisseStock[], r: ReglagesPoidsCaisse): PoidsCaisseCalcule | null {
  if (!(c.longueur_mm > 0 && c.largeur_mm > 0 && c.hauteur_mm > 0)) return null;
  const quatreC = estCaisse4C(c.type_envoi_caisse);
  const matiere: MatiereCaisse = quatreC ? "Bois" : "Contreplaqué";
  const nbPieds = nbPiedsParDefaut(c.longueur_mm, matiere, r);
  const est = estimerPoidsCaisse(
    {
      longueur_mm: c.longueur_mm,
      largeur_mm: c.largeur_mm,
      hauteur_mm: c.hauteur_mm,
      matiere,
      nbPieds,
      nbTasseaux: matiere === "Bois" ? r.sim_tasseaux : 0,
      nbRenfortsLongueur: 0,
      nbRenfortsLargeur: 0,
      mousseBache: quatreC,
    },
    r,
  );
  const mousseBache = est.mousseKg + est.bacheKg > 0 ? ` + mousse et bâche ${kg1(est.mousseKg + est.bacheKg)} kg` : "";
  const stock = c.caisse_stock_id !== null ? caissesStock.find((cs) => cs.id === c.caisse_stock_id) : undefined;
  if (stock && stock.tare_kg > 0) {
    return {
      kg: stock.tare_kg + est.mousseKg + est.bacheKg,
      source: "tare",
      matiere,
      detail: `Tare de la caisse en stock ${stock.nom} : ${kg1(stock.tare_kg)} kg${mousseBache}`,
    };
  }
  const elements = [
    `panneaux ${kg1(est.panneauxKg)} kg`,
    `${nbPieds} pieds ${kg1(est.piedsKg)} kg`,
    est.tasseauxKg > 0 ? `tasseaux ${kg1(est.tasseauxKg)} kg` : "",
    est.renfortsKg > 0 ? `renforts ${kg1(est.renfortsKg)} kg` : "",
  ].filter(Boolean);
  return {
    kg: est.totalKg,
    source: "estimation",
    matiere,
    detail: `Estimation (${matiere.toLowerCase()}) : ${elements.join(" + ")}${mousseBache}`,
  };
}
