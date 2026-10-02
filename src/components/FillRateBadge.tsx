import type { CaisseCalculee } from "../domain/types";

const STYLES: Record<CaisseCalculee["niveauAlerte"], { bg: string; border: string; text: string }> = {
  ok: { bg: "var(--ok-bg)", border: "var(--ok-border)", text: "var(--ok-text)" },
  attention: { bg: "var(--warn-bg)", border: "var(--warn-border)", text: "var(--warn-text)" },
  alerte: { bg: "var(--danger-bg)", border: "var(--danger-border)", text: "var(--danger-text)" },
};

export default function FillRateBadge({ caisse }: { caisse: CaisseCalculee }) {
  const s = STYLES[caisse.niveauAlerte];
  const pct = caisse.tauxRemplissage * 100;
  const article = caisse.articlesTropGrands.length > 0;

  return (
    <div
      className="mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 11px",
        borderRadius: 999,
        background: s.bg,
        border: `1px solid ${s.border}`,
        color: s.text,
        fontWeight: 700,
        fontSize: 13,
        whiteSpace: "nowrap",
      }}
      title={
        article
          ? `${caisse.articlesTropGrands.length} article(s) plus grand(s) que la caisse (voir le détail sous la barre)`
          : caisse.poidsTropLourd
            ? `Charge trop lourde : ${Math.floor(caisse.poidsParM2)} kg/m² (voir le détail sous la barre)`
          : caisse.estSurcharge
            ? `Volume des articles supérieur au volume interne de la caisse (${pct.toFixed(0)}%)`
            : `Taux de remplissage : ${pct.toFixed(1)}%`
      }
    >
      {(caisse.estSurcharge || article || caisse.poidsTropLourd) && "⚠ "}
      {pct.toFixed(0)}%
    </div>
  );
}
