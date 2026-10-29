import { estDemandeCaisseValidee, estDemandeValidee } from "./demandeOptions";
import type { GroupeRange } from "./colisage";
import type { Article, Caisse, CaisseColisage, Demande, DemandeCaisse, LivraisonLigne } from "./types";

// Envoi en partiel (2026-10-29) : dans Colisage en cours, une affaire à plusieurs caisses dont au
// moins une est livrée est découpée en envois — un onglet par livraison (caisses livrées le même
// jour), puis un onglet pour ce qui reste (caisses non livrées, colis / lettres non rangés). Ce
// qui est parti dans une caisse livrée est figé : plus de changement de caisse, de carton…

export interface EtatLivraison {
  livree: boolean;
  // AAAA-MM-JJ HH:MM:SS, null si la ligne a été livrée avant l'enregistrement des dates.
  date: string | null;
}

// Clé « demande:id » / « demande_caisse:id » → date de livraison.
export function datesLivraison(livraisons: LivraisonLigne[]): Map<string, string> {
  return new Map(livraisons.map((l) => [`${l.table_ligne}:${l.ligne_id}`, l.livree_le]));
}

// Caisse du Picking : livrée si la ligne de Gestion des caisses à laquelle elle est liée
// explicitement (sous-caisse, sinon ligne mère) est livrée. Une caisse non liée n'est jamais livrée.
export function etatLivraisonCaisse(
  c: Pick<Caisse, "demande_id" | "demande_caisse_id">,
  demandes: Demande[],
  demandeCaisses: DemandeCaisse[],
  dates: Map<string, string>,
): EtatLivraison {
  if (c.demande_caisse_id !== null) {
    const sc = demandeCaisses.find((s) => s.id === c.demande_caisse_id);
    return sc && estDemandeCaisseValidee(sc)
      ? { livree: true, date: dates.get(`demande_caisse:${sc.id}`) ?? null }
      : { livree: false, date: null };
  }
  if (c.demande_id !== null) {
    const d = demandes.find((x) => x.id === c.demande_id);
    return d && estDemandeValidee(d) ? { livree: true, date: dates.get(`demande:${d.id}`) ?? null } : { livree: false, date: null };
  }
  return { livree: false, date: null };
}

export interface Envoi {
  cle: string;
  numero: number;
  libelle: string;
  livre: boolean;
  // Jour de livraison AAAA-MM-JJ (null : livré avant l'enregistrement des dates, ou envoi restant).
  jour: string | null;
  // Caisses colisage de l'envoi.
  caisseIds: Set<number>;
}

export const CLE_ENVOI_RESTANT = "restant";

function libelleNumero(n: number): string {
  return n === 1 ? "1er envoi" : `${n}ème envoi`;
}

// Envois d'une affaire, dans l'ordre : livraisons de la plus ancienne à la plus récente (date
// inconnue en premier — livrée avant l'enregistrement des dates), puis ce qui reste. Null s'il n'y
// a pas lieu de découper (moins de deux caisses colisage, ou aucune livrée).
export function construireEnvois(
  caissesColisage: CaisseColisage[],
  etatParCaissePicking: Map<number, EtatLivraison>,
): Envoi[] | null {
  const etat = (c: CaisseColisage): EtatLivraison =>
    (c.source_caisse_id !== null ? etatParCaissePicking.get(c.source_caisse_id) : undefined) ?? { livree: false, date: null };
  if (caissesColisage.length < 2 || !caissesColisage.some((c) => etat(c).livree)) return null;

  const parJour = new Map<string, Set<number>>();
  const restant = new Set<number>();
  for (const c of caissesColisage) {
    const e = etat(c);
    if (!e.livree) {
      restant.add(c.id);
      continue;
    }
    const jour = e.date ? e.date.slice(0, 10) : "";
    if (!parJour.has(jour)) parJour.set(jour, new Set());
    parJour.get(jour)!.add(c.id);
  }
  const jours = [...parJour.keys()].sort();
  const envois: Envoi[] = jours.map((jour, i) => ({
    cle: `livre:${jour}`,
    numero: i + 1,
    libelle: libelleNumero(i + 1),
    livre: true,
    jour: jour || null,
    caisseIds: parJour.get(jour)!,
  }));
  envois.push({
    cle: CLE_ENVOI_RESTANT,
    numero: envois.length + 1,
    libelle: libelleNumero(envois.length + 1),
    livre: false,
    jour: null,
    caisseIds: restant,
  });
  return envois;
}

// Envoi d'un colis / d'une lettre : celui de sa caisse colisage, sinon (non rangé) ce qui reste.
export function envoiDuGroupe(g: Pick<GroupeRange, "caisseId">, envois: Envoi[]): Envoi {
  return envois.find((e) => g.caisseId !== null && e.caisseIds.has(g.caisseId)) ?? envois[envois.length - 1];
}

// Articles figés (partis dans une caisse livrée) : assignés dans le Picking à une caisse livrée,
// ou colisés dans un colis / une lettre rangé(e) dans une caisse colisage livrée. Article → motif.
export function articlesFiges(
  articles: Article[],
  etatParCaissePicking: Map<number, EtatLivraison>,
  groupes: Pick<GroupeRange, "caisseId" | "articles">[],
  caissesColisageLivrees: Set<number>,
): Map<number, string> {
  const figes = new Map<number, string>();
  for (const a of articles) {
    if (a.caisse_id !== null && etatParCaissePicking.get(a.caisse_id)?.livree) figes.set(a.id, "Dans une caisse livrée");
  }
  for (const g of groupes) {
    if (g.caisseId === null || !caissesColisageLivrees.has(g.caisseId)) continue;
    for (const a of g.articles) figes.set(a.id, "Colisé dans une caisse livrée");
  }
  return figes;
}
