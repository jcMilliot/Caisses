import { dimsCalcul, volumeUnitaireM3 } from "../domain/calculs";
import type { Article } from "../domain/types";

// Petits volumes (2026-11-23) : la dimension affichée reste celle de l'ERP (celle qu'on modifie) ;
// celle de la pièce hors sachet, utilisée par les calculs, est rappelée en petit dessous. Partagé
// par le tableau du Picking et les colis de Colisage en cours.
export const styleHorsSachet: React.CSSProperties = { fontSize: 11, fontWeight: 400, color: "var(--info-text)" };

/** Volume d'une pièce d'après l'ERP (affiché, trié, filtré) ; celui des calculs peut être hors sachet. */
export function volumeErp(a: Pick<Article, "dim1_mm" | "dim2_mm" | "dim3_mm">): number {
  return volumeUnitaireM3({ dim1_mm: a.dim1_mm, dim2_mm: a.dim2_mm, dim3_mm: a.dim3_mm });
}

export function avecHorsSachet(erp: number, horsSachet: number | undefined): React.ReactNode {
  if (horsSachet === undefined) return erp;
  return (
    <>
      {erp}
      <div style={styleHorsSachet} title="Dimension de la pièce hors sachet, utilisée pour les calculs (Contrôle dimensionnel › Petits volumes)">
        Hors sachet : {horsSachet} mm
      </div>
    </>
  );
}

/** « 200 × 200 × 50 mm hors sachet » (dimensions des calculs), pour les messages d'alerte. */
export function texteDimsCalcul(a: Pick<Article, "dim1_mm" | "dim2_mm" | "dim3_mm" | "hors_sachet">): string {
  const d = dimsCalcul(a);
  return `${d.dim1_mm} × ${d.dim2_mm} × ${d.dim3_mm} mm${a.hors_sachet ? " hors sachet" : ""}`;
}
