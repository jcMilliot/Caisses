import type { CaisseStock } from "./types";

// Convention à garder synchronisée avec src-tauri/src/commands/caisse_stock.rs::est_ar_caiss.
export function estArCaiss(nom: string): boolean {
  return nom.trim().toUpperCase().startsWith("AR_CAISS");
}

export function estCaisseStockDisponible(c: CaisseStock): boolean {
  return !c.validee;
}
