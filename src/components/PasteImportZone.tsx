import { useState } from "react";
import type { NewArticle } from "../domain/types";

interface Props {
  onImport: (articles: NewArticle[]) => Promise<void>;
  onClose: () => void;
}

// Ordre attendu des colonnes lors du collage depuis Excel.
const COLONNES = ["AR", "Référence", "Désignation", "Dim1 (mm)", "Dim2 (mm)", "Dim3 (mm)", "Poids unit. (kg)", "Quantité"];

function parseColle(texte: string): { articles: NewArticle[]; erreurs: string[] } {
  const lignes = texte
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const articles: NewArticle[] = [];
  const erreurs: string[] = [];

  lignes.forEach((ligne, i) => {
    const colsBrutes = ligne.split("\t");
    if (colsBrutes.length > 8) {
      erreurs.push(`Ligne ${i + 1} : ${colsBrutes.length} colonne(s) trouvée(s), 8 attendues au maximum — ignorée`);
      return;
    }
    // Excel omet les tabulations des cellules vides en fin de ligne : on complète
    // les colonnes manquantes avec des valeurs vides plutôt que de rejeter la ligne.
    const cols = [...colsBrutes, ...Array(8 - colsBrutes.length).fill("")];
    const [ar, reference, designation, d1, d2, d3, poids, qte] = cols;
    const dim1_mm = parseNombre(d1);
    const dim2_mm = parseNombre(d2);
    const dim3_mm = parseNombre(d3);
    const poids_unitaire_kg = parseNombre(poids);
    const quantite = Math.round(parseNombre(qte)) || 1;

    if (!ar.trim() && !reference.trim()) {
      erreurs.push(`Ligne ${i + 1} : AR et référence manquants — ignorée`);
      return;
    }

    articles.push({
      ar: ar.trim(),
      reference: reference.trim(),
      designation: designation.trim(),
      dim1_mm,
      dim2_mm,
      dim3_mm,
      poids_unitaire_kg,
      quantite,
    });
  });

  return { articles, erreurs };
}

function parseNombre(s: string): number {
  const n = Number(s.trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default function PasteImportZone({ onImport, onClose }: Props) {
  const [texte, setTexte] = useState("");
  const [importing, setImporting] = useState(false);

  const { articles, erreurs } = parseColle(texte);

  async function handleImport() {
    if (articles.length === 0) return;
    setImporting(true);
    try {
      await onImport(articles);
      onClose();
    } finally {
      setImporting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-panel)",
          borderRadius: "var(--radius-lg)",
          width: 720,
          maxWidth: "92vw",
          maxHeight: "86vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Coller des articles depuis Excel</h2>
          <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--text-muted)" }}>
            Colonnes attendues, dans l'ordre : {COLONNES.join(" · ")}
          </p>
        </div>

        <div style={{ padding: 20, overflow: "auto", flex: 1 }}>
          <textarea
            autoFocus
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            placeholder="Sélectionnez vos lignes dans Excel, copiez (Ctrl+C), puis collez ici (Ctrl+V)…"
            style={{
              width: "100%",
              height: 160,
              padding: 10,
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius)",
              fontFamily: "var(--font-mono)",
              fontSize: 12.5,
              resize: "vertical",
            }}
          />

          {texte.trim() && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 8 }}>
                {articles.length} article(s) détecté(s){erreurs.length > 0 && `, ${erreurs.length} ligne(s) ignorée(s)`}
              </div>

              {erreurs.length > 0 && (
                <ul style={{ margin: "0 0 12px", padding: 0, listStyle: "none" }}>
                  {erreurs.map((e, i) => (
                    <li
                      key={i}
                      style={{
                        fontSize: 12,
                        color: "var(--danger-text)",
                        background: "var(--danger-bg)",
                        border: "1px solid var(--danger-border)",
                        borderRadius: 4,
                        padding: "4px 8px",
                        marginBottom: 4,
                      }}
                    >
                      {e}
                    </li>
                  ))}
                </ul>
              )}

              {articles.length > 0 && (
                <table style={{ width: "100%", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
                      {COLONNES.map((c) => (
                        <th key={c} style={{ padding: "4px 8px", borderBottom: "1px solid var(--border)" }}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {articles.slice(0, 20).map((a, i) => (
                      <tr key={i}>
                        <td style={tdStyle}>{a.ar}</td>
                        <td style={tdStyle}>{a.reference}</td>
                        <td style={tdStyle}>{a.designation}</td>
                        <td className="mono" style={tdStyle}>{a.dim1_mm}</td>
                        <td className="mono" style={tdStyle}>{a.dim2_mm}</td>
                        <td className="mono" style={tdStyle}>{a.dim3_mm}</td>
                        <td className="mono" style={tdStyle}>{a.poids_unitaire_kg}</td>
                        <td className="mono" style={tdStyle}>{a.quantite}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {articles.length > 20 && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                  … et {articles.length - 20} de plus
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" disabled={articles.length === 0 || importing} onClick={handleImport}>
            {importing ? "Import…" : `Importer ${articles.length} article(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}

const tdStyle: React.CSSProperties = {
  padding: "4px 8px",
  borderBottom: "1px solid var(--border)",
};
