import { dimsCalcul, volumeUnitaireM3 } from "../domain/calculs";
import type { Article } from "../domain/types";

// La dimension affichée reste celle de l'ERP (celle qu'on modifie). Celle qui sert aux calculs est
// rappelée en petit dessous quand elle diffère : pièce hors sachet (Petits volumes, 2026-11-23)
// et/ou dimensions remises dans l'ordre L ≥ l ≥ H (2026-11-26). Partagé par le tableau du Picking
// et les colis de Colisage en cours.
export const styleHorsSachet: React.CSSProperties = { fontSize: 11, fontWeight: 400, color: "var(--info-text)" };

/** Volume d'une pièce d'après l'ERP (affiché, trié, filtré) ; celui des calculs peut être hors sachet. */
export function volumeErp(a: Pick<Article, "dim1_mm" | "dim2_mm" | "dim3_mm">): number {
  return volumeUnitaireM3({ dim1_mm: a.dim1_mm, dim2_mm: a.dim2_mm, dim3_mm: a.dim3_mm });
}

const CHAMPS = ["dim1_mm", "dim2_mm", "dim3_mm"] as const;

/** Dimension `champ` de l'ERP, avec dessous celle des calculs si elle est différente. */
export function avecDimCalcul(
  a: Pick<Article, "dim1_mm" | "dim2_mm" | "dim3_mm" | "hors_sachet">,
  champ: (typeof CHAMPS)[number],
): React.ReactNode {
  const erp = a[champ];
  const calcul = dimsCalcul(a)[champ];
  if (!a.hors_sachet && calcul === erp) return erp;
  const libelle = a.hors_sachet ? "Hors sachet" : "Calcul";
  const aide = a.hors_sachet
    ? "Dimension de la pièce hors sachet, utilisée pour les calculs (Contrôle dimensionnel › Petits volumes). Les dimensions sont remises dans l'ordre : longueur = plus grande, hauteur = plus petite."
    : "Dimensions remises dans l'ordre pour les calculs : longueur = plus grande cote, largeur = moyenne, hauteur = plus petite (c'est ainsi que la pièce est posée dans la caisse ou le colis).";
  return (
    <>
      {erp}
      <div style={styleHorsSachet} title={aide}>
        {libelle} : {calcul} mm
      </div>
    </>
  );
}

/** « 200 × 200 × 50 mm hors sachet » (dimensions des calculs), pour les messages d'alerte. */
export function texteDimsCalcul(a: Pick<Article, "dim1_mm" | "dim2_mm" | "dim3_mm" | "hors_sachet">): string {
  const d = dimsCalcul(a);
  return `${d.dim1_mm} × ${d.dim2_mm} × ${d.dim3_mm} mm${a.hors_sachet ? " hors sachet" : ""}`;
}
