import { useState } from "react";
import FillRateBadge from "./FillRateBadge";
import { PALETTE_CAISSES } from "../domain/palette";
import { estCaisse4C } from "../domain/demandeOptions";
import { formaterVolumeM3 } from "../domain/calculs";
import type { CaisseCalculee } from "../domain/types";

interface Props {
  caisse: CaisseCalculee;
  autoEdit?: boolean;
  onUpdate: (
    nom: string,
    longueur_mm: number,
    largeur_mm: number,
    hauteur_mm: number,
    seuil_pct: number | null,
    couleur: string,
  ) => Promise<void>;
  onDelete: () => Promise<void>;
  dragActif?: boolean;
  survolee?: boolean;
  readOnly?: boolean;
  // Caisse en stock utilisée (null = caisse sur mesure).
  caisseStockNom?: string | null;
  // Ligne de Gestion des caisses liée (libellé, null = non liée) + bouton « Lier… ».
  lien?: { libelle: string | null; onLier: () => void };
  // Caisse en stock suggérée d'après les articles (cf. domain/suggestionCaisse.ts).
  suggestion?: { nom: string; longueur_mm: number; largeur_mm: number; hauteur_mm: number; onUtiliser: () => void } | null;
}

const BORDER_BY_NIVEAU: Record<CaisseCalculee["niveauAlerte"], string> = {
  ok: "var(--border)",
  attention: "var(--warn-border)",
  alerte: "var(--danger-border)",
};

const BAR_BY_NIVEAU: Record<CaisseCalculee["niveauAlerte"], string> = {
  ok: "var(--ok-text)",
  attention: "var(--warn-text)",
  alerte: "var(--danger-text)",
};

function DimensionInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [texte, setTexte] = useState(value === 0 ? "" : String(value));

  return (
    <input
      style={inputStyle}
      value={texte}
      placeholder={placeholder}
      disabled={disabled}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        setTexte(e.target.value);
        const n = Number(e.target.value.replace(",", "."));
        onChange(Number.isFinite(n) ? n : 0);
      }}
    />
  );
}

export default function CaisseCard({
  caisse,
  autoEdit,
  onUpdate,
  onDelete,
  dragActif,
  survolee,
  readOnly,
  caisseStockNom,
  suggestion,
  lien,
}: Props) {
  const [editing, setEditing] = useState(!!autoEdit && !readOnly);
  // Les dimensions sont saisies/affichées en mètres dans l'UI, mais stockées en mm partout
  // ailleurs (calculs, base de données) — conversion faite uniquement aux frontières de ce
  // composant.
  const [form, setForm] = useState({
    l: caisse.longueur_mm / 1000,
    w: caisse.largeur_mm / 1000,
    h: caisse.hauteur_mm / 1000,
    couleur: caisse.couleur,
  });

  // Nom fixe (pas d'alias de caisse) et plus de seuil propre à une caisse : le seuil d'alerte
  // est celui de l'affaire, réglé dans l'Admin (décision 2026-09-30).
  async function save() {
    await onUpdate(caisse.nom, form.l * 1000, form.w * 1000, form.h * 1000, null, form.couleur);
    setEditing(false);
  }

  const pctBarre = Math.min(caisse.tauxRemplissage * 100, 100);

  return (
    <div
      data-caisse-id={caisse.id}
      className="panel"
      style={{
        borderTopColor: survolee ? "var(--accent)" : BORDER_BY_NIVEAU[caisse.niveauAlerte],
        borderRightColor: survolee ? "var(--accent)" : BORDER_BY_NIVEAU[caisse.niveauAlerte],
        borderBottomColor: survolee ? "var(--accent)" : BORDER_BY_NIVEAU[caisse.niveauAlerte],
        boxShadow: survolee ? "var(--shadow-md)" : "var(--shadow-sm)",
        padding: 18,
        minWidth: 260,
        borderLeft: `5px solid ${caisse.couleur}`,
        background: survolee ? "var(--accent-soft)" : "var(--bg-panel)",
        transition: "background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease",
        outline: dragActif && !survolee ? "1.5px dashed var(--border-strong)" : undefined,
        outlineOffset: 2,
      }}
    >
      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{caisse.nom}</div>
          <div style={{ display: "flex", gap: 6 }}>
            <DimensionInput value={form.l} placeholder="L (m)" onChange={(v) => setForm({ ...form, l: v })} />
            <DimensionInput value={form.w} placeholder="l (m)" onChange={(v) => setForm({ ...form, w: v })} />
            <DimensionInput value={form.h} placeholder="H (m)" onChange={(v) => setForm({ ...form, h: v })} />
          </div>
          {caisseStockNom && (
            <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: 0 }}>
              Dimensions de la caisse en stock « {caisseStockNom} » — modifier une dimension la désélectionne.
            </p>
          )}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.02em" }}>
              COULEUR
            </div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {PALETTE_CAISSES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, couleur: c })}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: c,
                    border: form.couleur === c ? "2.5px solid var(--accent)" : "1px solid var(--border-strong)",
                    boxShadow: form.couleur === c ? "var(--shadow-sm)" : undefined,
                    cursor: "pointer",
                    padding: 0,
                    transition: "transform 0.1s ease",
                  }}
                  aria-label={`Couleur ${c}`}
                />
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
            <button className="btn btn-sm btn-primary" onClick={save}>
              Enregistrer
            </button>
            {!autoEdit && (
              <button className="btn btn-sm" onClick={() => setEditing(false)}>
                Annuler
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15.5, letterSpacing: "-0.005em" }}>{caisse.nom}</div>
              <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>
                {(caisse.longueur_mm / 1000).toFixed(2)} × {(caisse.largeur_mm / 1000).toFixed(2)} × {(caisse.hauteur_mm / 1000).toFixed(2)} m
              </div>
              {caisseStockNom && (
                <div style={{ fontSize: 12, color: "var(--info-text)", fontWeight: 600, marginTop: 2 }}>Caisse en stock : {caisseStockNom}</div>
              )}
              {lien && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginTop: 3, color: "var(--text-muted)" }}>
                  <span title="Ligne de Gestion des caisses rattachée à cette caisse (taux de remplissage, synchro des dimensions)">
                    Gestion des caisses : {lien.libelle ?? <em>non liée</em>}
                  </span>
                  {/* « Lier… » seulement tant que la caisse n'est liée à aucune ligne (2026-10-03). */}
                  {!readOnly && lien.libelle === null && (
                    <button
                      onClick={lien.onLier}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--accent)", fontSize: 12, fontWeight: 600 }}
                    >
                      Lier…
                    </button>
                  )}
                </div>
              )}
            </div>
            <FillRateBadge caisse={caisse} />
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ height: 6, borderRadius: 999, background: "var(--bg-panel-alt)", overflow: "hidden", border: "1px solid var(--border)" }}>
              <div
                style={{
                  height: "100%",
                  width: `${pctBarre}%`,
                  background: BAR_BY_NIVEAU[caisse.niveauAlerte],
                  borderRadius: 999,
                  transition: "width 0.2s ease",
                }}
              />
            </div>
          </div>

          {suggestion && !caisseStockNom && (
            <div
              style={{
                marginTop: 10,
                padding: "7px 10px",
                background: "var(--info-bg)",
                border: "1px solid var(--info-border)",
                color: "var(--info-text)",
                borderRadius: 6,
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span title="Plus petite caisse en stock qui contient les articles, seuil de remplissage compris">
                Suggestion : <strong>{suggestion.nom}</strong>{" "}
                <span className="mono">
                  ({(suggestion.longueur_mm / 1000).toFixed(2)} × {(suggestion.largeur_mm / 1000).toFixed(2)} ×{" "}
                  {(suggestion.hauteur_mm / 1000).toFixed(2)} m)
                </span>
              </span>
              {!readOnly && (
                <button className="btn btn-sm btn-pastel-blue" onClick={suggestion.onUtiliser}>
                  Utiliser
                </button>
              )}
            </div>
          )}

          {caisse.estSurcharge && (
            <div
              style={{
                marginTop: 10,
                padding: "7px 10px",
                background: "var(--danger-bg)",
                border: "1px solid var(--danger-border)",
                color: "var(--danger-text)",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              ⚠ Volume dépassé : le contenu ne rentre pas dans cette caisse
            </div>
          )}

          {caisse.poidsTropLourd && (
            <div
              style={{
                marginTop: 10,
                padding: "7px 10px",
                background: "var(--danger-bg)",
                border: "1px solid var(--danger-border)",
                color: "var(--danger-text)",
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 700 }}>
                ⚠ Charge trop lourde : {Math.floor(caisse.poidsParM2)} kg/m² (max {caisse.poidsMaxKgM2} kg/m²)
              </div>
              <div style={{ marginTop: 2 }}>
                {caisse.poidsTotalKg.toFixed(1)} kg d'articles sur un fond de {caisse.surfaceFondM2.toFixed(2)} m² — prévoir une
                caisse plus grande ou répartir les articles.
              </div>
            </div>
          )}

          {caisse.articlesTropGrands.length > 0 && (
            <div
              style={{
                marginTop: 10,
                padding: "7px 10px",
                background: "var(--danger-bg)",
                border: "1px solid var(--danger-border)",
                color: "var(--danger-text)",
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                ⚠ {caisse.articlesTropGrands.length} article(s) plus grand(s) que la caisse
              </div>
              {caisse.articlesTropGrands.map(({ article, depassements }) => (
                <div key={article.id} style={{ marginTop: 2 }}>
                  <span style={{ fontWeight: 600 }}>{article.ar || article.reference || "?"}</span> —{" "}
                  {depassements
                    .map((d) => `${d.article} mm > ${d.axe} de la caisse (${d.caisse} mm)`)
                    .join(" ; ")}
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 12, fontSize: 12.5, display: "flex", flexDirection: "column", gap: 4 }}>
            {(caisse.dim1MaxMm > 0 || caisse.dim2MaxMm > 0 || caisse.dim3MaxMm > 0) && (
              <Row
                label="Dim. max articles (L×l×H)"
                value={`${caisse.dim1MaxMm} × ${caisse.dim2MaxMm} × ${caisse.dim3MaxMm} mm`}
              />
            )}
            <Row label="Volume interne" value={`${formaterVolumeM3(caisse.volumeInterneM3)} m³`} />
            <Row label="Volume occupé" value={`${formaterVolumeM3(caisse.volumeOccupeM3)} m³`} />
            {estCaisse4C(caisse.type_envoi_caisse) && (
              <Row label="Volume disponible" value={`${formaterVolumeM3(caisse.volumeDisponibleM3)} m³`} />
            )}
            <Row label="Poids total" value={`${caisse.poidsTotalKg.toFixed(3)} kg`} />
            {caisse.surfaceFondM2 > 0 && (
              <Row label={`Poids au m² (max ${caisse.poidsMaxKgM2})`} value={`${Math.floor(caisse.poidsParM2)} kg/m²`} />
            )}
            <Row label="Seuil d'alerte" value={`${caisse.seuilEffectif}%`} />
          </div>

          {!readOnly && (
            <div style={{ marginTop: 14, display: "flex", gap: 6 }}>
              <button
                className="btn btn-sm"
                onClick={() => {
                  // Repartir des valeurs actuelles (elles ont pu changer depuis : caisse en stock
                  // suggérée appliquée, synchro depuis Gestion des caisses…).
                  setForm({ l: caisse.longueur_mm / 1000, w: caisse.largeur_mm / 1000, h: caisse.hauteur_mm / 1000, couleur: caisse.couleur });
                  setEditing(true);
                }}
              >
                Modifier
              </button>
              <button className="btn btn-sm btn-danger" onClick={onDelete}>
                Supprimer
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="mono" style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}

// Bordure, arrondi, fond et focus : style commun des champs (index.css).
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 9px",
};
