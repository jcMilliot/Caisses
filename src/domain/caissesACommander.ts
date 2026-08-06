import type { Demande } from "./types";
import { estDemandeValidee } from "./demandeOptions";

export interface AffaireACommander {
  demande: Demande;
  datePickingAffichage: string;
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
// doit partir la semaine calendaire précédant celle du picking).
export function caissesACommanderCetteSemaine(demandes: Demande[], aujourdHui: Date = new Date()): AffaireACommander[] {
  return demandes
    .filter((d) => !estAchstock(d) && !d.stock.trim() && !estDemandeValidee(d))
    .filter((d) => {
      const picking = parseIso(d.date_picking);
      if (!picking) return false;
      const semaineCommandeAttendue = ajouterJours(lundiDeLaSemaine(picking), -7);
      return memeSemaine(semaineCommandeAttendue, aujourdHui);
    })
    .map((d) => ({ demande: d, datePickingAffichage: d.date_picking }));
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
    .map((d) => ({ demande: d, datePickingAffichage: d.date_picking }));
}
