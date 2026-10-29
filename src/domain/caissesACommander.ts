import type { Demande, DemandeAlerte, DemandeCaisse } from "./types";
import { estDemandeCaisseValidee, estDemandeValidee } from "./demandeOptions";

export interface AffaireACommander {
  demande: Demande;
  // Envoi en partiel (2026-10-29) : sous-caisse à commander / rapatrier à part de sa mère.
  sousCaisse?: DemandeCaisse;
  // Date de référence (date anticipée si saisie, sinon picking), AAAA-MM-JJ.
  datePickingAffichage: string;
  // Vrai si datePickingAffichage est la date anticipée de la page Alertes.
  anticipee: boolean;
  // En alerte « à Commander » (estACommanderUrgent) : affichée en tête, fond rouge pastel.
  urgent: boolean;
}

// --- Date anticipée (page « Alertes », 2026-10-19) -------------------------------------------
// Id de ligne mère → date d'expédition anticipée (AAAA-MM-JJ). Quand une ligne en a une, elle
// remplace la date de picking pour l'alerte « À commander » et les blocs « à commander / à
// rapatrier cette semaine ». La date de picking elle-même n'est jamais modifiée.
export type DatesAnticipees = ReadonlyMap<number, string>;

export function datesAnticipees(alertes: DemandeAlerte[]): Map<number, string> {
  return new Map(alertes.filter((a) => a.date_anticipee.trim() !== "").map((a) => [a.demande_id, a.date_anticipee.trim()]));
}

export function dateReference(d: Demande, anticipees: DatesAnticipees = new Map()): string {
  return anticipees.get(d.id) ?? d.date_picking;
}

// « Repoussée » si la date saisie dans Alertes est après le picking initial, sinon « Anticipée »
// (2026-10-20). Dates AAAA-MM-JJ : la comparaison de chaînes suit l'ordre chronologique.
export function libelleDateModifiee(datePicking: string, dateSaisie: string): "Anticipée" | "Repoussée" {
  return datePicking !== "" && dateSaisie > datePicking ? "Repoussée" : "Anticipée";
}

// --- Sous-caisses (envoi en partiel, 2026-10-29) --------------------------------------------
// Une sous-caisse a sa propre date de picking, sa propre case « OK pour être commandée » et sa
// propre livraison. Tant qu'elle a la date de sa mère, elle suit aussi la date modifiée dans
// Alertes (qui n'existe que pour les lignes mères).
export function dateReferenceSousCaisse(sc: DemandeCaisse, mere: Demande, anticipees: DatesAnticipees = new Map()): string {
  return sc.date_picking === mere.date_picking ? dateReference(mere, anticipees) : sc.date_picking;
}

// Ligne de Gestion des caisses (mère ou sous-caisse) vue par les alertes.
interface LigneAlerte {
  mere: Demande;
  sousCaisse?: DemandeCaisse;
  date: string;
  anticipee: boolean;
  ok: boolean;
  livree: boolean;
  enStock: boolean;
}

function ligneMere(d: Demande, anticipees: DatesAnticipees): LigneAlerte {
  return {
    mere: d,
    date: dateReference(d, anticipees),
    anticipee: anticipees.has(d.id),
    ok: d.ok_pour_passer_cde,
    livree: estDemandeValidee(d),
    enStock: estCaisseEnStock(d),
  };
}

function ligneSousCaisse(sc: DemandeCaisse, mere: Demande, anticipees: DatesAnticipees): LigneAlerte {
  return {
    mere,
    sousCaisse: sc,
    date: dateReferenceSousCaisse(sc, mere, anticipees),
    anticipee: sc.date_picking === mere.date_picking && anticipees.has(mere.id),
    ok: sc.ok_pour_passer_cde,
    livree: estDemandeCaisseValidee(sc),
    enStock: estCaisseEnStock(sc),
  };
}

// Sous-caisse dans le même cas que sa mère (pas encore commandée, non livrée, même date, même
// caisse en stock ou non) : la ligne de la mère la représente déjà, pas de ligne en double.
function couverteParLaMere(l: LigneAlerte, mere: LigneAlerte): boolean {
  return !mere.ok && !mere.livree && !l.ok && !l.livree && mere.date === l.date && mere.enStock === l.enStock;
}

// Lignes mères + sous-caisses qui ne sont pas couvertes par leur mère (ACHSTOCK exclues).
function lignesAlerte(demandes: Demande[], sousCaisses: DemandeCaisse[], anticipees: DatesAnticipees): LigneAlerte[] {
  const lignes: LigneAlerte[] = [];
  for (const d of demandes) {
    if (estAchstock(d)) continue;
    const mere = ligneMere(d, anticipees);
    lignes.push(mere);
    for (const sc of sousCaisses) {
      if (sc.demande_id !== d.id) continue;
      const l = ligneSousCaisse(sc, d, anticipees);
      if (!couverteParLaMere(l, mere)) lignes.push(l);
    }
  }
  return lignes;
}

function versAffaire(l: LigneAlerte, urgent: boolean): AffaireACommander {
  return { demande: l.mere, sousCaisse: l.sousCaisse, datePickingAffichage: l.date, anticipee: l.anticipee, urgent };
}

function cleLigne(l: LigneAlerte): string {
  return l.sousCaisse ? `c:${l.sousCaisse.id}` : `d:${l.mere.id}`;
}

function parseIso(iso: string): Date | null {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, aaaa, mm, jj] = m;
  return new Date(Number(aaaa), Number(mm) - 1, Number(jj));
}

// Lundi = 0 ... dimanche = 6
function jourSemaine(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function lundiDeLaSemaine(d: Date): Date {
  const r = new Date(d);
  r.setDate(r.getDate() - jourSemaine(d));
  r.setHours(0, 0, 0, 0);
  return r;
}

function ajouterJours(d: Date, jours: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + jours);
  return r;
}

function memeSemaine(a: Date, b: Date): boolean {
  return lundiDeLaSemaine(a).getTime() === lundiDeLaSemaine(b).getTime();
}

export function estAchstock(demande: Demande): boolean {
  return demande.affaire.trim().toUpperCase().includes("ACHSTOCK");
}

// Caisse en stock choisie dans le menu Stock (`caisse_stock_id`), ou nom écrit dans l'ancienne
// colonne texte `stock` (lignes reprises de l'Excel, que l'app n'écrit plus).
function estCaisseEnStock(demande: Pick<Demande, "caisse_stock_id" | "stock">): boolean {
  return demande.caisse_stock_id != null || demande.stock.trim() !== "";
}

// "À commander" : semaine avant la semaine du picking (on ferme le week-end, donc la commande
// doit partir la semaine calendaire précédant celle du picking). Les lignes en alerte
// « à Commander » y sont ajoutées (si besoin) et placées en tête.
export function caissesACommanderCetteSemaine(
  demandes: Demande[],
  anticipees: DatesAnticipees = new Map(),
  aujourdHui: Date = new Date(),
  sousCaisses: DemandeCaisse[] = [],
): AffaireACommander[] {
  const lignes = lignesAlerte(demandes, sousCaisses, anticipees);
  const cetteSemaine = lignes
    .filter((l) => !l.enStock && !l.livree)
    .filter((l) => {
      const picking = parseIso(l.date);
      if (!picking) return false;
      const semaineCommandeAttendue = ajouterJours(lundiDeLaSemaine(picking), -7);
      return memeSemaine(semaineCommandeAttendue, aujourdHui);
    });
  const urgentes = lignes.filter((l) => ligneUrgente(l, aujourdHui)).sort((a, b) => a.date.localeCompare(b.date));
  const clesUrgentes = new Set(urgentes.map(cleLigne));
  return [
    ...urgentes.map((l) => versAffaire(l, true)),
    ...cetteSemaine.filter((l) => !clesUrgentes.has(cleLigne(l))).map((l) => versAffaire(l, false)),
  ];
}

// "À rapatrier" (caisses déjà en stock) : si le picking tombe un lundi, il faut la semaine
// d'avant (le lundi lui-même est trop tard, fermé le week-end précédent) ; sinon la semaine
// du picking elle-même suffit.
export function caissesARapatrierCetteSemaine(
  demandes: Demande[],
  anticipees: DatesAnticipees = new Map(),
  aujourdHui: Date = new Date(),
  sousCaisses: DemandeCaisse[] = [],
): AffaireACommander[] {
  return lignesAlerte(demandes, sousCaisses, anticipees)
    .filter((l) => l.enStock && !l.livree)
    .filter((l) => {
      const picking = parseIso(l.date);
      if (!picking) return false;
      const estLundi = jourSemaine(picking) === 0;
      const semaineRapatriementAttendue = estLundi
        ? ajouterJours(lundiDeLaSemaine(picking), -7)
        : lundiDeLaSemaine(picking);
      return memeSemaine(semaineRapatriementAttendue, aujourdHui);
    })
    .map((l) => versAffaire(l, false));
}

// --- Alerte « à Commander » (décision 2026-09-30) -------------------------------------------
// Ligne à commander (ni caisse en stock à rapatrier, ni ACHSTOCK), pas encore cochée « OK pour
// être commandée », non livrée, dont le picking est dans 7 jours calendaires ou moins — ou déjà
// passé. Disparaît dès que la case est cochée, revient si on la décoche. Signalée par une
// pastille sur l'icône de la barre des tâches et en rouge sur l'accueil. Vaut aussi pour une
// sous-caisse qui n'est pas couverte par sa mère (envoi en partiel, 2026-10-29).
export const JOURS_ALERTE_COMMANDE = 7;
export const MESSAGE_ALERTE_COMMANDE = "Picking (ou expédition anticipée) dans 7 jours ou moins et pas encore traité.";

function ligneUrgente(l: LigneAlerte, aujourdHui: Date): boolean {
  if (l.ok || l.livree || l.enStock || estAchstock(l.mere)) return false;
  const picking = parseIso(l.date);
  if (!picking) return false;
  const jour = new Date(aujourdHui);
  jour.setHours(0, 0, 0, 0);
  const joursAvantPicking = Math.round((picking.getTime() - jour.getTime()) / 86_400_000);
  return joursAvantPicking <= JOURS_ALERTE_COMMANDE;
}

export function estACommanderUrgent(d: Demande, anticipees: DatesAnticipees = new Map(), aujourdHui: Date = new Date()): boolean {
  return ligneUrgente(ligneMere(d, anticipees), aujourdHui);
}

export function estSousCaisseACommanderUrgente(
  sc: DemandeCaisse,
  mere: Demande,
  anticipees: DatesAnticipees = new Map(),
  aujourdHui: Date = new Date(),
): boolean {
  const l = ligneSousCaisse(sc, mere, anticipees);
  if (couverteParLaMere(l, ligneMere(mere, anticipees))) return false;
  return ligneUrgente(l, aujourdHui);
}

// Vrai si au moins une ligne (mère ou sous-caisse) est en alerte « à Commander ».
export function alerteACommander(
  demandes: Demande[],
  sousCaisses: DemandeCaisse[],
  anticipees: DatesAnticipees = new Map(),
  aujourdHui: Date = new Date(),
): boolean {
  return lignesAlerte(demandes, sousCaisses, anticipees).some((l) => ligneUrgente(l, aujourdHui));
}
