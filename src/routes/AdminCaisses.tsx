import { useEffect, useState } from "react";
import { caisseStockApi } from "../data/caisseStock";
import { dimensionsExterieures, estArCaiss, estStockACommander } from "../domain/caisseStock";
import type { CaisseStock } from "../domain/types";
import StatistiquesCaisses from "../components/StatistiquesCaisses";

// Onglet « Caisses » de la page Admin (renommé de « Stock » le 2026-10-02) : deux sous-onglets,
// « Stock » (ci-dessous) et « Statistiques » (components/StatistiquesCaisses.tsx).
export default function AdminCaisses({ trigramme }: { trigramme: string }) {
  const [sousOnglet, setSousOnglet] = useState<"stock" | "statistiques">("stock");
  return (
    <div>
      {/* Sous-onglets bien visibles (retour utilisateur du 2026-10-02) : grands boutons, actif plein. */}
      <div
        style={{
          display: "inline-flex",
          gap: 4,
          padding: 4,
          background: "var(--bg-panel)",
          border: "1px solid var(--border-strong)",
          borderRadius: 10,
          marginBottom: 20,
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {(
          [
            ["stock", "📦", "Stock"],
            ["statistiques", "📊", "Statistiques"],
          ] as const
        ).map(([o, icone, label]) => (
          <button
            key={o}
            onClick={() => setSousOnglet(o)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 22px",
              border: "none",
              borderRadius: 7,
              cursor: "pointer",
              fontSize: 14.5,
              fontWeight: 600,
              background: sousOnglet === o ? "var(--accent)" : "transparent",
              color: sousOnglet === o ? "#fff" : "var(--text-muted)",
              transition: "background 0.12s ease, color 0.12s ease",
            }}
          >
            <span aria-hidden="true">{icone}</span>
            {label}
          </button>
        ))}
      </div>
      {sousOnglet === "stock" ? <StockArCaiss trigramme={trigramme} /> : <StatistiquesCaisses />}
    </div>
  );
}

// Sous-onglet « Stock » (décisions 2026-10-01 / 2026-10-02) : pour chaque caisse
// AR_CAISS_, quantité en stock, suivi (« gérée ») et seuil d'alerte. Une caisse gérée voit sa
// quantité décomptée à la livraison des lignes qui l'utilisent, et passe « à commander » quand
// la quantité atteint le seuil. Une caisse non gérée n'est ni décomptée ni surveillée.
function StockArCaiss({ trigramme }: { trigramme: string }) {
  const [caisses, setCaisses] = useState<CaisseStock[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function charger() {
    try {
      setCaisses((await caisseStockApi.list()).filter((c) => estArCaiss(c.nom)));
    } catch (e) {
      setErreur(String(e));
    }
  }

  useEffect(() => {
    charger();
  }, []);

  if (caisses === null) return erreur ? <p style={{ color: "var(--danger-text)" }}>{erreur}</p> : null;

  return (
    <div style={{ maxWidth: 900 }}>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px" }}>
        Espace de gestion des « AR_CAISS » en stock
      </p>
      {erreur && <p style={{ color: "var(--danger-text)", fontSize: 13 }}>{erreur}</p>}
      {caisses.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>Aucune caisse AR_CAISS_ en stock.</p>
      ) : (
        <div className="panel" style={{ padding: 0, overflowX: "auto" }}>
          <table className="table-donnees">
            <thead>
              <tr>
                <th style={thStyle}>Caisse</th>
                <th style={thStyle}>Dimensions intérieures (m)</th>
                <th style={thStyle}>Dimensions extérieures (m)</th>
                <th style={thStyle}>Matière</th>
                <th style={thStyle}>Gérée</th>
                <th style={thStyle}>Qté en stock</th>
                <th style={thStyle}>Seuil d'alerte</th>
                <th style={thStyle}>État</th>
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {caisses.map((c) => (
                <LigneStock
                  key={`${c.id}-${c.quantite}-${c.gere}-${c.seuil_alerte}`}
                  caisse={c}
                  onEnregistrer={async (quantite, gere, seuil) => {
                    setErreur(null);
                    try {
                      await caisseStockApi.setSuivi(c.id, quantite, gere, seuil, trigramme);
                      await charger();
                    } catch (e) {
                      setErreur(String(e));
                    }
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LigneStock({
  caisse,
  onEnregistrer,
}: {
  caisse: CaisseStock;
  onEnregistrer: (quantite: number, gere: boolean, seuil: number) => Promise<void>;
}) {
  const [gere, setGere] = useState(caisse.gere);
  const [quantite, setQuantite] = useState(String(caisse.quantite));
  const [seuil, setSeuil] = useState(String(caisse.seuil_alerte));
  const [busy, setBusy] = useState(false);

  const q = Number(quantite);
  const s = Number(seuil);
  const valide = quantite.trim() !== "" && seuil.trim() !== "" && Number.isInteger(q) && Number.isInteger(s) && q >= 0 && s >= 0;
  const modifie = valide && (gere !== caisse.gere || q !== caisse.quantite || s !== caisse.seuil_alerte);
  const aCommander = estStockACommander(caisse);

  async function enregistrer() {
    setBusy(true);
    try {
      await onEnregistrer(q, gere, s);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr style={{ background: aCommander ? "var(--danger-bg)" : undefined }}>
      <td style={tdStyle}>
        <strong>{caisse.nom}</strong>
      </td>
      <td style={tdStyle} className="mono">
        {(caisse.longueur_mm / 1000).toFixed(2)} × {(caisse.largeur_mm / 1000).toFixed(2)} ×{" "}
        {(caisse.hauteur_mm / 1000).toFixed(2)}
      </td>
      <td style={{ ...tdStyle, color: dimensionsExterieures(caisse) ? undefined : "var(--text-muted)" }} className="mono">
        {dimensionsExterieures(caisse)?.replace(/ m$/, "") ?? "—"}
      </td>
      <td style={{ ...tdStyle, color: caisse.matiere ? undefined : "var(--text-muted)" }}>{caisse.matiere || "—"}</td>
      <td style={tdStyle}>
        <input
          type="checkbox"
          className="interrupteur"
          checked={gere}
          onChange={(e) => setGere(e.target.checked)}
          title={gere ? "Gérée : alerte « à commander » au seuil" : "Non gérée : pas d'alerte"}
        />
      </td>
      <td style={tdStyle}>
        <input className="input" type="number" min={0} step={1} value={quantite} onChange={(e) => setQuantite(e.target.value)} style={{ width: 80 }} />
      </td>
      <td style={tdStyle}>
        <input className="input" type="number" min={0} step={1} value={seuil} onChange={(e) => setSeuil(e.target.value)} style={{ width: 80 }} />
      </td>
      <td style={tdStyle}>
        {!caisse.gere ? (
          <span className="badge badge-muted">Non gérée</span>
        ) : aCommander ? (
          <span className="badge badge-danger">À commander</span>
        ) : (
          <span className="badge badge-ok">OK</span>
        )}
      </td>
      <td style={{ ...tdStyle, textAlign: "right" }}>
        {modifie && (
          <button className="btn btn-success-solid btn-sm" onClick={enregistrer} disabled={busy}>
            Enregistrer
          </button>
        )}
      </td>
    </tr>
  );
}

// En-têtes / cellules : .table-donnees (index.css).
const thStyle: React.CSSProperties = {};
const tdStyle: React.CSSProperties = {};
