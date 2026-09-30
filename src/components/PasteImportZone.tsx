import { useState } from "react";
import type { NewArticle } from "../domain/types";
import { decouperTableauTsv } from "../domain/tsv";

// Ligne écartée au collage (AR ne commençant ni par « AR » ni par « ZR »), gardée avec l'affaire.
export interface ArticleRefuse extends NewArticle {
  ligne_brute: string;
}

interface Props {
  onImport: (articles: NewArticle[]) => Promise<void>;
  // Lignes que l'utilisateur a choisi de ne pas ajouter (affichées sous le tableau d'articles).
  onRefuses?: (lignes: ArticleRefuse[]) => Promise<void>;
  onClose: () => void;
  // Texte de collage pré-rempli (ex. collage multi-cellules intercepté dans le tableau).
  texteInitial?: string;
}

// Ordre attendu des colonnes lors du collage depuis Excel.
const COLONNES = ["AR", "Référence", "Désignation", "Dim1 (mm)", "Dim2 (mm)", "Dim3 (mm)", "Poids unit. (kg)", "Quantité"];

// Un AR valide commence par « AR » ou « ZR » (majuscules ou minuscules, espaces de tête ignorés).
// Les autres lignes ne sont ajoutées qu'après confirmation (décision 2026-09-30) — une ligne sans
// AR (référence fournisseur seule) aussi.
export function arValide(ar: string): boolean {
  return /^(AR|ZR)/i.test(ar.trim());
}

function parseColle(texte: string): { articles: NewArticle[]; lignesBrutes: string[]; erreurs: string[] } {
  // Pas de trim() de la ligne : il supprimait la tabulation de tête d'une ligne sans AR et
  // décalait toutes les colonnes. Chaque champ est trimé à l'usage.
  const lignes = decouperTableauTsv(texte).filter((cols) => cols.some((c) => c.trim() !== ""));

  const articles: NewArticle[] = [];
  const lignesBrutes: string[] = [];
  const erreurs: string[] = [];
  let colonnesEnTrop = 0;
  let colonneMax = 0;

  lignes.forEach((colsBrutes, i) => {
    // Colonnes au-delà des 8 attendues : on les ignore (le fichier Excel a souvent 2 colonnes
    // de volume calculé en plus — l'app le recalcule elle-même). On compte pour un avertissement
    // global unique, on ne rejette pas la ligne.
    let cols = colsBrutes;
    if (cols.length > 8) {
      colonnesEnTrop++;
      colonneMax = Math.max(colonneMax, cols.length);
      cols = cols.slice(0, 8);
    }
    // Excel omet les tabulations des cellules vides en fin de ligne : on complète
    // les colonnes manquantes avec des valeurs vides plutôt que de rejeter la ligne.
    cols = [...cols, ...Array(Math.max(0, 8 - cols.length)).fill("")];
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

    lignesBrutes.push(colsBrutes.join("\t"));
    articles.push({
      ar: ar.trim(),
      reference: reference.trim(),
      // Cellule Excel sur plusieurs lignes (Alt+Entrée) → une seule ligne dans l'app.
      designation: designation.replace(/\s*[\r\n]+\s*/g, " ").trim(),
      dim1_mm,
      dim2_mm,
      dim3_mm,
      poids_unitaire_kg,
      quantite,
    });
  });

  if (colonnesEnTrop > 0) {
    erreurs.unshift(
      `${colonnesEnTrop} ligne(s) ont ${colonneMax} colonnes — seules les 8 premières ` +
        `(AR · Référence · Désignation · Dim1 · Dim2 · Dim3 · Poids · Quantité) sont utilisées, ` +
        `les colonnes de volume sont recalculées par l'application.`,
    );
  }

  return { articles, lignesBrutes, erreurs };
}

function parseNombre(s: string): number {
  const n = Number(s.trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default function PasteImportZone({ onImport, onRefuses, onClose, texteInitial = "" }: Props) {
  const [texte, setTexte] = useState(texteInitial);
  const [importing, setImporting] = useState(false);
  // Étape de choix des lignes à AR douteux : indices (dans `articles`) cochés « ajouter ».
  const [choix, setChoix] = useState<Set<number> | null>(null);

  const { articles, lignesBrutes, erreurs } = parseColle(texte);
  const indicesDouteux = articles.map((a, i) => (arValide(a.ar) ? -1 : i)).filter((i) => i >= 0);

  async function importer(ajoutesDouteux: Set<number>) {
    setImporting(true);
    try {
      const retenus = articles.filter((a, i) => arValide(a.ar) || ajoutesDouteux.has(i));
      const refuses: ArticleRefuse[] = indicesDouteux
        .filter((i) => !ajoutesDouteux.has(i))
        .map((i) => ({ ...articles[i], ligne_brute: lignesBrutes[i] }));
      if (retenus.length > 0) await onImport(retenus);
      if (refuses.length > 0 && onRefuses) await onRefuses(refuses);
      onClose();
    } finally {
      setImporting(false);
    }
  }

  async function handleImport() {
    if (articles.length === 0) return;
    // Des AR ne commencent ni par « AR » ni par « ZR » : on demande lesquels ajouter.
    if (indicesDouteux.length > 0 && onRefuses) {
      setChoix(new Set());
      return;
    }
    await importer(new Set(indicesDouteux));
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
                    {articles.map((a, i) => (
                      <tr
                        key={i}
                        style={arValide(a.ar) ? undefined : { background: "var(--warn-bg)" }}
                        title={arValide(a.ar) ? undefined : "AR ne commençant ni par « AR » ni par « ZR » — confirmation demandée à l'import"}
                      >
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

      {choix && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              background: "var(--bg-panel)",
              borderRadius: "var(--radius-lg)",
              width: 900,
              maxWidth: "94vw",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>AR à vérifier</h3>
              <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--text-muted)" }}>
                {indicesDouteux.length} ligne(s) ont un AR qui ne commence ni par « AR » ni par « ZR ». Cochez celles à
                ajouter quand même ; les autres ne seront pas collées et resteront listées sous le tableau d'articles.
              </p>
            </div>
            <div style={{ padding: 16, overflow: "auto", flex: 1 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={choix.size === indicesDouteux.length}
                  onChange={(e) => setChoix(e.target.checked ? new Set(indicesDouteux) : new Set())}
                />
                Tout cocher
              </label>
              <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
                    <th style={{ ...tdStyle, width: 70 }}>Ajouter</th>
                    <th style={tdStyle}>Ligne collée</th>
                  </tr>
                </thead>
                <tbody>
                  {indicesDouteux.map((i) => (
                    <tr key={i}>
                      <td style={tdStyle}>
                        <input
                          type="checkbox"
                          checked={choix.has(i)}
                          onChange={(e) =>
                            setChoix((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(i);
                              else next.delete(i);
                              return next;
                            })
                          }
                        />
                      </td>
                      <td style={tdStyle} className="mono">
                        {lignesBrutes[i].split("\t").map((c, j) => (
                          <span key={j} style={{ display: "inline-block", marginRight: 14, fontWeight: j === 0 ? 700 : undefined }}>
                            {c || "—"}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn" onClick={() => setChoix(null)} disabled={importing}>
                Retour
              </button>
              <button className="btn btn-primary" onClick={() => importer(choix)} disabled={importing}>
                {importing ? "Import…" : "Valider"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const tdStyle: React.CSSProperties = {
  padding: "4px 8px",
  borderBottom: "1px solid var(--border)",
};
