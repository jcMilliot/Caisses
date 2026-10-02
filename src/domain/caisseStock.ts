import type { CaisseStock } from "./types";

// Convention à garder synchronisée avec src-tauri/src/commands/caisse_stock.rs::est_ar_caiss.
export function estArCaiss(nom: string): boolean {
  return nom.trim().toUpperCase().startsWith("AR_CAISS");
}

// Libellé d'une caisse en stock dans les menus Stock : nom, plus la quantité restante pour une
// AR_CAISS_ (gérée ou non — une non gérée est une caisse qu'on écoule, décision 2026-10-02).
export function libelleCaisseStock(c: CaisseStock): string {
  return estArCaiss(c.nom) ? `${c.nom} — ${c.quantite} en stock` : c.nom;
}

// Caisse AR_CAISS_ gérée dont le stock a atteint son seuil d'alerte (décision 2026-10-01 :
// quantité <= seuil, réglé par caisse dans Admin › Caisses) — alerte « … à commander » sur
// Caisses en stock, l'accueil et la barre des tâches.
export function estStockACommander(c: CaisseStock): boolean {
  return estArCaiss(c.nom) && c.gere && c.quantite <= c.seuil_alerte;
}

export function caissesStockACommander(caisses: CaisseStock[]): CaisseStock[] {
  return caisses.filter(estStockACommander);
}
