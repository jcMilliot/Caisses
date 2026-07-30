import { useEffect, useState } from "react";
import { caisseStockApi } from "../data/caisseStock";
import { affairesApi } from "../data/affaires";
import type { Affaire, CaisseStock, NewCaisseStock } from "../domain/types";

const CAISSE_VIDE: NewCaisseStock = {
  nom: "",
  longueur_mm: 0,
  largeur_mm: 0,
  hauteur_mm: 0,
  quantite: 1,
  observations: "",
  affaire_id: null,
};

export default function CaissesStockList() {
  const [caisses, setCaisses] = useState<CaisseStock[]>([]);
  const [affaires, setAffaires] = useState<Affaire[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<NewCaisseStock>(CAISSE_VIDE);

  async function reload() {
    setLoading(true);
    try {
      const [c, a] = await Promise.all([caisseStockApi.list(), affairesApi.list()]);
      setCaisses(c);
      setAffaires(a);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nom.trim()) return;
    await caisseStockApi.create(form);
    setForm(CAISSE_VIDE);
    setCreating(false);
    await reload();
  }

  async function handleDelete(id: number, nom: string) {
    if (!window.confirm(`Supprimer la caisse en stock « ${nom} » ?`)) return;
    await caisseStockApi.delete(id);
    await reload();
  }

  function nomAffaire(id: number | null): string {
    if (id === null) return "Non affectée";
    return affaires.find((a) => a.id === id)?.nom ?? "?";
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 4 }}>
            Caisses
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>Caisses en stock</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating((v) => !v)}>
          + Ajouter une caisse
        </button>
      </div>

      {creating && (
        <form
          onSubmit={handleCreate}
          className="panel"
          style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, padding: 18, marginBottom: 24 }}
        >
          <div style={{ gridColumn: "span 3" }}>
            <label style={labelStyle}>Nom</label>
            <input autoFocus value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Longueur (m)</label>
            <input
              type="number"
              step="0.01"
              value={form.longueur_mm / 1000 || ""}
              onChange={(e) => setForm({ ...form, longueur_mm: Number(e.target.value) * 1000 || 0 })}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Largeur (m)</label>
            <input
              type="number"
              step="0.01"
              value={form.largeur_mm / 1000 || ""}
              onChange={(e) => setForm({ ...form, largeur_mm: Number(e.target.value) * 1000 || 0 })}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Hauteur (m)</label>
            <input
              type="number"
              step="0.01"
              value={form.hauteur_mm / 1000 || ""}
              onChange={(e) => setForm({ ...form, hauteur_mm: Number(e.target.value) * 1000 || 0 })}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Qté</label>
            <input
              type="number"
              min={1}
              value={form.quantite}
              onChange={(e) => setForm({ ...form, quantite: Math.round(Number(e.target.value)) || 1 })}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Affectation</label>
            <select
              value={form.affaire_id ?? ""}
              onChange={(e) => setForm({ ...form, affaire_id: e.target.value === "" ? null : Number(e.target.value) })}
              style={inputStyle}
            >
              <option value="">Non affectée</option>
              {affaires.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nom}
                </option>
              ))}
            </select>
          </div>

          <div style={{ gridColumn: "span 3" }}>
            <label style={labelStyle}>Observations</label>
            <input
              value={form.observations}
              onChange={(e) => setForm({ ...form, observations: e.target.value })}
              style={inputStyle}
            />
          </div>

          <div style={{ gridColumn: "span 3", display: "flex", gap: 8 }}>
            <button type="submit" className="btn btn-primary">
              Créer
            </button>
            <button type="button" className="btn" onClick={() => setCreating(false)}>
              Annuler
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Chargement…</p>
      ) : caisses.length === 0 ? (
        <div className="panel" style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
          <p style={{ margin: 0 }}>Aucune caisse en stock pour l'instant.</p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
                <th style={thStyle}>Nom</th>
                <th style={thStyle}>Dimensions (m)</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Qté</th>
                <th style={thStyle}>Observations</th>
                <th style={thStyle}>Affectation</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {caisses.map((c) => (
                <tr key={c.id}>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{c.nom}</td>
                  <td className="mono" style={tdStyle}>
                    {(c.longueur_mm / 1000).toFixed(2)} × {(c.largeur_mm / 1000).toFixed(2)} × {(c.hauteur_mm / 1000).toFixed(2)}
                  </td>
                  <td className="mono" style={{ ...tdStyle, textAlign: "right" }}>
                    {c.quantite}
                  </td>
                  <td style={tdStyle}>{c.observations}</td>
                  <td style={tdStyle}>{nomAffaire(c.affaire_id)}</td>
                  <td style={tdStyle}>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(c.id, c.nom)}>
                      Suppr.
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "var(--text-muted)",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius)",
  background: "var(--bg-panel)",
  color: "var(--text)",
};

const thStyle: React.CSSProperties = {
  padding: "9px 8px",
  borderBottom: "2px solid var(--border)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 8px",
  borderBottom: "1px solid var(--border)",
};
