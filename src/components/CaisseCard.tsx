import { useState } from "react";
import FillRateBadge from "./FillRateBadge";
import { PALETTE_CAISSES } from "../domain/palette";
import { estCaisse4C } from "../domain/demandeOptions";
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
  dimensionsReadOnly?: boolean;
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

export default function CaisseCard({ caisse, autoEdit, onUpdate, onDelete, dragActif, survolee, readOnly, dimensionsReadOnly }: Props) {
  const [editing, setEditing] = useState(!!autoEdit && !readOnly);
  // Les dimensions sont saisies/affichées en mètres dans l'UI, mais stockées en mm partout
  // ailleurs (calculs, base de données) — conversion faite uniquement aux frontières de ce
  // composant.
  const [form, setForm] = useState({
    nom: caisse.nom,
    l: caisse.longueur_mm / 1000,
    w: caisse.largeur_mm / 1000,
    h: caisse.hauteur_mm / 1000,
    seuil: caisse.seuil_pct,
    couleur: caisse.couleur,
  });

  async function save() {
    await onUpdate(form.nom, form.l * 1000, form.w * 1000, form.h * 1000, form.seuil, form.couleur);
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
          <input
            style={inputStyle}
            value={form.nom}
            autoFocus
            onFocus={(e) => e.target.select()}
            onChange={(e) => setForm({ ...form, nom: e.target.value })}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <DimensionInput value={form.l} placeholder="L (m)" onChange={(v) => setForm({ ...form, l: v })} disabled={dimensionsReadOnly} />
            <DimensionInput value={form.w} placeholder="l (m)" onChange={(v) => setForm({ ...form, w: v })} disabled={dimensionsReadOnly} />
            <DimensionInput value={form.h} placeholder="H (m)" onChange={(v) => setForm({ ...form, h: v })} disabled={dimensionsReadOnly} />
          </div>
          {dimensionsReadOnly && (
            <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: 0 }}>
              Dimensions héritées d'une caisse en stock — non modifiables ici.
            </p>
          )}
          <input
            type="number"
            style={inputStyle}
            value={form.seuil ?? ""}
            placeholder="Seuil % (vide = hérite de l'affaire)"
            onFocus={(e) => e.target.select()}
            onChange={(e) => setForm({ ...form, seuil: e.target.value === "" ? null : Number(e.target.value) })}
          />
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

          <div style={{ marginTop: 12, fontSize: 12.5, display: "flex", flexDirection: "column", gap: 4 }}>
            <Row label="Volume interne" value={`${caisse.volumeInterneM3.toFixed(4)} m³`} />
            <Row label="Volume occupé" value={`${caisse.volumeOccupeM3.toFixed(4)} m³`} />
            {estCaisse4C(caisse.type_envoi_caisse) && (
              <Row label="Volume disponible" value={`${caisse.volumeDisponibleM3.toFixed(4)} m³`} />
            )}
            <Row label="Poids total" value={`${caisse.poidsTotalKg.toFixed(1)} kg`} />
            <Row label="Seuil d'alerte" value={`${caisse.seuilEffectif}%${caisse.seuil_pct === null ? " (défaut)" : ""}`} />
          </div>

          {!readOnly && (
            <div style={{ marginTop: 14, display: "flex", gap: 6 }}>
              <button className="btn btn-sm" onClick={() => setEditing(true)}>
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

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 9px",
  border: "1px solid var(--border-strong)",
  borderRadius: 6,
};
