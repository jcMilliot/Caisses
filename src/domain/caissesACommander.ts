import type { Demande, DemandeAlerte } from "./types";
import { estDemandeValidee } from "./demandeOptions";

export interface AffaireACommander {
  demande: Demande;
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

function versAffaire(d: Demande, anticipees: DatesAnticipees, urgent: boolean): AffaireACommander {
  return { demande: d, datePickingAffichage: dateReference(d, anticipees), anticipee: anticipees.has(d.id), urgent };
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
function estCaisseEnStock(demande: Demande): boolean {
  return demande.caisse_stock_id != null || demande.stock.trim() !== "";
}

// "À commander" : semaine avant la semaine du picking (on ferme le week-end, donc la commande
// doit partir la semaine calendaire précédant celle du picking). Les affaires en alerte
// « à Commander » y sont ajoutées (si besoin) et placées en tête.
export function caissesACommanderCetteSemaine(
  demandes: Demande[],
  anticipees: DatesAnticipees = new Map(),
  aujourdHui: Date = new Date(),
): AffaireACommander[] {
  const cetteSemaine = demandes
    .filter((d) => !estAchstock(d) && !estCaisseEnStock(d) && !estDemandeValidee(d))
    .filter((d) => {
      const picking = parseIso(dateReference(d, anticipees));
      if (!picking) return false;
      const semaineCommandeAttendue = ajouterJours(lundiDeLaSemaine(picking), -7);
      return memeSemaine(semaineCommandeAttendue, aujourdHui);
    });
  const urgentes = affairesACommanderUrgentes(demandes, anticipees, aujourdHui).sort((a, b) =>
    dateReference(a, anticipees).localeCompare(dateReference(b, anticipees)),
  );
  const idsUrgents = new Set(urgentes.map((d) => d.id));
  return [
    ...urgentes.map((d) => versAffaire(d, anticipees, true)),
    ...cetteSemaine.filter((d) => !idsUrgents.has(d.id)).map((d) => versAffaire(d, anticipees, false)),
  ];
}

// "À rapatrier" (caisses déjà en stock) : si le picking tombe un lundi, il faut la semaine
// d'avant (le lundi lui-même est trop tard, fermé le week-end précédent) ; sinon la semaine
// du picking elle-même suffit.
export function caissesARapatrierCetteSemaine(
  demandes: Demande[],
  anticipees: DatesAnticipees = new Map(),
  aujourdHui: Date = new Date(),
): AffaireACommander[] {
  return demandes
    .filter((d) => !estAchstock(d) && estCaisseEnStock(d) && !estDemandeValidee(d))
    .filter((d) => {
      const picking = parseIso(dateReference(d, anticipees));
      if (!picking) return false;
      const estLundi = jourSemaine(picking) === 0;
      const semaineRapatriementAttendue = estLundi
        ? ajouterJours(lundiDeLaSemaine(picking), -7)
        : lundiDeLaSemaine(picking);
      return memeSemaine(semaineRapatriementAttendue, aujourdHui);
    })
    .map((d) => versAffaire(d, anticipees, false));
}

// --- Alerte « à Commander » (décision 2026-09-30) -------------------------------------------
// Affaire à commander (ni caisse en stock à rapatrier, ni ACHSTOCK), pas encore cochée « OK pour
// être commandée », non livrée, dont le picking est dans 7 jours calendaires ou moins — ou déjà
// passé. Disparaît dès que la case est cochée, revient si on la décoche. Signalée par une
// pastille sur l'icône de la barre des tâches et en rouge sur l'accueil.
export const JOURS_ALERTE_COMMANDE = 7;
export const MESSAGE_ALERTE_COMMANDE = "Picking (ou expédition anticipée) dans 7 jours ou moins et pas encore traité.";

export function estACommanderUrgent(d: Demande, anticipees: DatesAnticipees = new Map(), aujourdHui: Date = new Date()): boolean {
  if (d.ok_pour_passer_cde || estDemandeValidee(d) || estAchstock(d)) return false;
  if (estCaisseEnStock(d)) return false;
  const picking = parseIso(dateReference(d, anticipees));
  if (!picking) return false;
  const jour = new Date(aujourdHui);
  jour.setHours(0, 0, 0, 0);
  const joursAvantPicking = Math.round((picking.getTime() - jour.getTime()) / 86_400_000);
  return joursAvantPicking <= JOURS_ALERTE_COMMANDE;
}

export function affairesACommanderUrgentes(
  demandes: Demande[],
  anticipees: DatesAnticipees = new Map(),
  aujourdHui: Date = new Date(),
): Demande[] {
  return demandes.filter((d) => estACommanderUrgent(d, anticipees, aujourdHui));
}
