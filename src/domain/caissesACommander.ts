import type { Demande } from "./types";
import { estDemandeValidee } from "./demandeOptions";

export interface AffaireACommander {
  demande: Demande;
  datePickingAffichage: string;
  // En alerte « à Commander » (estACommanderUrgent) : affichée en tête, fond rouge pastel.
  urgent: boolean;
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

function estAchstock(demande: Demande): boolean {
  return demande.affaire.trim().toUpperCase().includes("ACHSTOCK");
}

// "À commander" : semaine avant la semaine du picking (on ferme le week-end, donc la commande
// doit partir la semaine calendaire précédant celle du picking). Les affaires en alerte
// « à Commander » y sont ajoutées (si besoin) et placées en tête.
export function caissesACommanderCetteSemaine(demandes: Demande[], aujourdHui: Date = new Date()): AffaireACommander[] {
  const cetteSemaine = demandes
    .filter((d) => !estAchstock(d) && !d.stock.trim() && !estDemandeValidee(d))
    .filter((d) => {
      const picking = parseIso(d.date_picking);
      if (!picking) return false;
      const semaineCommandeAttendue = ajouterJours(lundiDeLaSemaine(picking), -7);
      return memeSemaine(semaineCommandeAttendue, aujourdHui);
    });
  const urgentes = affairesACommanderUrgentes(demandes, aujourdHui).sort((a, b) => a.date_picking.localeCompare(b.date_picking));
  const idsUrgents = new Set(urgentes.map((d) => d.id));
  return [
    ...urgentes.map((d) => ({ demande: d, datePickingAffichage: d.date_picking, urgent: true })),
    ...cetteSemaine
      .filter((d) => !idsUrgents.has(d.id))
      .map((d) => ({ demande: d, datePickingAffichage: d.date_picking, urgent: false })),
  ];
}

// "À rapatrier" (caisses déjà en stock) : si le picking tombe un lundi, il faut la semaine
// d'avant (le lundi lui-même est trop tard, fermé le week-end précédent) ; sinon la semaine
// du picking elle-même suffit.
export function caissesARapatrierCetteSemaine(demandes: Demande[], aujourdHui: Date = new Date()): AffaireACommander[] {
  return demandes
    .filter((d) => !estAchstock(d) && d.stock.trim() && !estDemandeValidee(d))
    .filter((d) => {
      const picking = parseIso(d.date_picking);
      if (!picking) return false;
      const estLundi = jourSemaine(picking) === 0;
      const semaineRapatriementAttendue = estLundi
        ? ajouterJours(lundiDeLaSemaine(picking), -7)
        : lundiDeLaSemaine(picking);
      return memeSemaine(semaineRapatriementAttendue, aujourdHui);
    })
    .map((d) => ({ demande: d, datePickingAffichage: d.date_picking, urgent: false }));
}

// --- Alerte « à Commander » (décision 2026-09-30) -------------------------------------------
// Affaire à commander (ni caisse en stock à rapatrier, ni ACHSTOCK), pas encore cochée « OK pour
// être commandée », non livrée, dont le picking est dans 7 jours calendaires ou moins — ou déjà
// passé. Disparaît dès que la case est cochée, revient si on la décoche. Signalée par une
// pastille sur l'icône de la barre des tâches et en rouge sur l'accueil.
export const JOURS_ALERTE_COMMANDE = 7;
export const MESSAGE_ALERTE_COMMANDE = "Picking dans 7 jours ou moins et pas encore traité.";

export function estACommanderUrgent(d: Demande, aujourdHui: Date = new Date()): boolean {
  if (d.ok_pour_passer_cde || estDemandeValidee(d) || estAchstock(d)) return false;
  if (d.caisse_stock_id != null || d.stock.trim()) return false;
  const picking = parseIso(d.date_picking);
  if (!picking) return false;
  const jour = new Date(aujourdHui);
  jour.setHours(0, 0, 0, 0);
  const joursAvantPicking = Math.round((picking.getTime() - jour.getTime()) / 86_400_000);
  return joursAvantPicking <= JOURS_ALERTE_COMMANDE;
}

export function affairesACommanderUrgentes(demandes: Demande[], aujourdHui: Date = new Date()): Demande[] {
  return demandes.filter((d) => estACommanderUrgent(d, aujourdHui));
}
