import { useState } from "react";
import type { NewArticle } from "../domain/types";
import type { ArticleNonColle } from "../data/articlesNonColles";

interface Props {
  lignes: ArticleNonColle[];
  // Actions visibles pour les administrateurs seulement (garde réelle côté Rust).
  estAdmin: boolean;
  readOnly: boolean;
  onModifier: (id: number, article: NewArticle) => Promise<void>;
  onIntegrer: (id: number) => Promise<void>;
  onSupprimer: (id: number) => Promise<void>;
}

const CHAMPS: { cle: keyof NewArticle; label: string; nombre?: boolean; largeur: number }[] = [
  { cle: "ar", label: "AR", largeur: 130 },
  { cle: "reference", label: "Référence", largeur: 130 },
  { cle: "designation", label: "Désignation", largeur: 220 },
  { cle: "dim1_mm", label: "Dim1", nombre: true, largeur: 60 },
  { cle: "dim2_mm", label: "Dim2", nombre: true, largeur: 60 },
  { cle: "dim3_mm", label: "Dim3", nombre: true, largeur: 60 },
  { cle: "poids_unitaire_kg", label: "Poids", nombre: true, largeur: 60 },
  { cle: "quantite", label: "Qté", nombre: true, largeur: 50 },
];

// Lignes écartées au collage Excel (AR ne commençant ni par « AR » ni par « ZR »), gardées avec
// l'affaire et listées sous le tableau d'articles (décision 2026-09-30).
export default function ArticlesNonCollesBloc({ lignes, estAdmin, readOnly, onModifier, onIntegrer, onSupprimer }: Props) {
  const [editionId, setEditionId] = useState<number | null>(null);
  const [saisie, setSaisie] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (lignes.length === 0) return null;
  const actions = estAdmin && !readOnly;

  function commencerEdition(l: ArticleNonColle) {
    setEditionId(l.id);
    setSaisie(Object.fromEntries(CHAMPS.map((c) => [c.cle, String(l[c.cle])])));
  }

  async function executer(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  async function validerEdition(id: number) {
    const nombre = (cle: string) => Number((saisie[cle] ?? "").replace(",", ".")) || 0;
    const article: NewArticle = {
      ar: (saisie.ar ?? "").trim(),
      reference: (saisie.reference ?? "").trim(),
      designation: (saisie.designation ?? "").trim(),
      dim1_mm: nombre("dim1_mm"),
      dim2_mm: nombre("dim2_mm"),
      dim3_mm: nombre("dim3_mm"),
      poids_unitaire_kg: nombre("poids_unitaire_kg"),
      quantite: Math.round(nombre("quantite")) || 1,
    };
    await executer(async () => {
      await onModifier(id, article);
      setEditionId(null);
    });
  }

  return (
    <div
      className="panel"
      style={{ marginTop: 16, padding: "14px 16px", borderLeft: "4px solid var(--warn-border)", background: "var(--warn-bg)" }}
    >
      <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>Ces lignes n'ont pas été collées :</div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px" }}>
        Leur AR ne commence ni par « AR » ni par « ZR ».
        {estAdmin ? " Vous pouvez les corriger, les ajouter au tableau ou les supprimer." : " Seul un administrateur peut les ajouter au tableau ou les supprimer."}
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ fontSize: 12.5, borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
              {CHAMPS.map((c) => (
                <th key={c.cle} style={{ ...cellule, width: c.largeur }}>
                  {c.label}
                </th>
              ))}
              {actions && <th style={cellule} />}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.id} title={`Collée par ${l.cree_par || "?"} — ligne d'origine : ${l.ligne_brute.split("\t").join(" · ")}`}>
                {CHAMPS.map((c) => (
                  <td key={c.cle} style={{ ...cellule, fontWeight: c.cle === "ar" ? 700 : undefined }} className={c.nombre ? "mono" : undefined}>
                    {editionId === l.id ? (
                      <input
                        className="input"
                        value={saisie[c.cle] ?? ""}
                        onChange={(e) => setSaisie((prev) => ({ ...prev, [c.cle]: e.target.value }))}
                        style={{ width: "100%", padding: "3px 5px", fontSize: 12.5 }}
                      />
                    ) : (
                      String(l[c.cle]) || "—"
                    )}
                  </td>
                ))}
                {actions && (
                  <td style={{ ...cellule, whiteSpace: "nowrap" }}>
                    {editionId === l.id ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => validerEdition(l.id)}>
                          OK
                        </button>
                        <button className="btn btn-sm" onClick={() => setEditionId(null)}>
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-sm" disabled={busy} onClick={() => commencerEdition(l)}>
                          Modifier
                        </button>
                        <button className="btn btn-sm btn-pastel-green" disabled={busy} onClick={() => executer(() => onIntegrer(l.id))}>
                          Ajouter au tableau
                        </button>
                        <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => executer(() => onSupprimer(l.id))}>
                          Supprimer
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const cellule: React.CSSProperties = {
  padding: "4px 8px",
  borderBottom: "1px solid var(--warn-border)",
};
