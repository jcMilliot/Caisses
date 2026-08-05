import { useState } from "react";
import type { Caisse } from "../domain/types";

interface Props {
  caisses: Caisse[];
  nbSelectionnes: number;
  onAssign: (caisseId: number | null) => Promise<void>;
  onCreateAndAssign: (nom: string, longueur_mm: number, largeur_mm: number, hauteur_mm: number) => Promise<void>;
  onClose: () => void;
}

const RETIRER = "retirer";

function mmToM(mm: number): number {
  return Math.round((mm / 1000) * 1000) / 1000;
}

function mToMm(m: number): number {
  return Math.round(m * 1000);
}

export default function AssignToDialog({ caisses, nbSelectionnes, onAssign, onCreateAndAssign, onClose }: Props) {
  const [mode, setMode] = useState<"existante" | "nouvelle">(caisses.length > 0 ? "existante" : "nouvelle");
  const [caisseId, setCaisseId] = useState<number | typeof RETIRER>(caisses[0]?.id ?? RETIRER);
  const [nom, setNom] = useState("");
  const [dims, setDims] = useState({ l: 0, w: 0, h: 0 });
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      if (mode === "existante") {
        await onAssign(caisseId === RETIRER ? null : caisseId);
      } else {
        if (!nom.trim()) return;
        await onCreateAndAssign(nom.trim(), dims.l, dims.w, dims.h);
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--bg-panel)", borderRadius: "var(--radius-lg)", width: 420, maxWidth: "92vw", boxShadow: "var(--shadow-lg)" }}
      >
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
            {nbSelectionnes} article{nbSelectionnes > 1 ? "s" : ""} sélectionné{nbSelectionnes > 1 ? "s" : ""} — assigner à →
          </h2>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn"
              style={mode === "existante" ? activeTabStyle : undefined}
              onClick={() => setMode("existante")}
              disabled={caisses.length === 0}
            >
              Caisse existante
            </button>
            <button className="btn" style={mode === "nouvelle" ? activeTabStyle : undefined} onClick={() => setMode("nouvelle")}>
              Nouvelle caisse
            </button>
          </div>

          {mode === "existante" ? (
            <select
              value={caisseId}
              onChange={(e) => setCaisseId(e.target.value === RETIRER ? RETIRER : Number(e.target.value))}
              style={inputStyle}
            >
              <option value={RETIRER}>— Retirer de la caisse (non assigné) —</option>
              {caisses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom} ({mmToM(c.longueur_mm)}×{mmToM(c.largeur_mm)}×{mmToM(c.hauteur_mm)} m)
                </option>
              ))}
            </select>
          ) : (
            <>
              <div>
                <label style={labelStyle}>Nom de la caisse</label>
                <input autoFocus value={nom} onChange={(e) => setNom(e.target.value)} style={inputStyle} placeholder="Ex : Caisse 1" />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <div>
                  <label style={labelStyle}>Longueur (m)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={mmToM(dims.l)}
                    onChange={(e) => setDims({ ...dims, l: mToMm(Number(e.target.value)) })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Largeur (m)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={mmToM(dims.w)}
                    onChange={(e) => setDims({ ...dims, w: mToMm(Number(e.target.value)) })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Hauteur (m)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={mmToM(dims.h)}
                    onChange={(e) => setDims({ ...dims, h: mToMm(Number(e.target.value)) })}
                    style={inputStyle}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={handleConfirm}>
            Assigner
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius)" };
const activeTabStyle: React.CSSProperties = { background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent)" };
