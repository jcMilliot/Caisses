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

// Matières d'une caisse en stock, choisies dans « Gérer les caisses » (obligatoire, 2026-10-05).
// Liste dupliquée côté Rust (`caisse_stock.rs::MATIERES`) — garder les deux alignées.
export const MATIERES_CAISSE = ["Bois", "Contreplaqué"];

// Dimensions extérieures « L × l × H m », null si aucune n'est renseignée (champs facultatifs).
export function dimensionsExterieures(c: Pick<CaisseStock, "ext_longueur_mm" | "ext_largeur_mm" | "ext_hauteur_mm">): string | null {
  if (c.ext_longueur_mm <= 0 && c.ext_largeur_mm <= 0 && c.ext_hauteur_mm <= 0) return null;
  const m = (mm: number) => (mm / 1000).toFixed(2);
  return `${m(c.ext_longueur_mm)} × ${m(c.ext_largeur_mm)} × ${m(c.ext_hauteur_mm)} m`;
}
