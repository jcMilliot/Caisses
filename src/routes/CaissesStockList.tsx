import { useEffect, useState } from "react";
import { caisseStockApi } from "../data/caisseStock";
import { demandesApi } from "../data/demandes";
import { demandeCaisseApi } from "../data/demandeCaisse";
import { useSectionLock } from "../hooks/useSectionLock";
import LockBanner from "../components/LockBanner";
import EditableCellInput from "../components/EditableCellInput";
import { confirmerSuppression } from "../data/confirm";
import { estArCaiss } from "../domain/caisseStock";
import type { CaisseStock, NewCaisseStock, Demande, DemandeCaisse } from "../domain/types";

const CAISSE_VIDE: NewCaisseStock = {
  nom: "",
  longueur_mm: 0,
  largeur_mm: 0,
  hauteur_mm: 0,
  quantite: 1,
  observations: "",
  affaire_id: null,
};

type Champ = "nom" | "longueur_mm" | "largeur_mm" | "hauteur_mm" | "observations";

function toNewCaisseStock(c: CaisseStock): NewCaisseStock {
  return {
    nom: c.nom,
    longueur_mm: c.longueur_mm,
    largeur_mm: c.largeur_mm,
    hauteur_mm: c.hauteur_mm,
    quantite: c.quantite,
    observations: c.observations,
    affaire_id: c.affaire_id,
  };
}

interface Props {
  trigramme: string;
}

export default function CaissesStockList({ trigramme }: Props) {
  const lock = useSectionLock("stock", trigramme);
  const readOnly = lock.status !== "held";
  const [caisses, setCaisses] = useState<CaisseStock[]>([]);
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [demandeCaisses, setDemandeCaisses] = useState<DemandeCaisse[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<NewCaisseStock>(CAISSE_VIDE);
  const [cellEnEdition, setCellEnEdition] = useState<{ id: number; champ: Champ } | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const [c, d, dc] = await Promise.all([caisseStockApi.list(), demandesApi.list(), demandeCaisseApi.listAll()]);
      setCaisses(c);
      setDemandes(d);
      setDemandeCaisses(dc);
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
    await caisseStockApi.create(form, trigramme);
    setForm(CAISSE_VIDE);
    setCreating(false);
    await reload();
  }

  async function handleDelete(id: number, nom: string) {
    if (!(await confirmerSuppression(`Supprimer la caisse en stock « ${nom} » ?`))) return;
    await caisseStockApi.delete(id, trigramme);
    await reload();
  }

  async function sauvegarderChamp(caisse: CaisseStock, champ: Champ, valeurBrute: string) {
    setCellEnEdition(null);
    const estDimension = champ === "longueur_mm" || champ === "largeur_mm" || champ === "hauteur_mm";
    const valeur = estDimension ? (Number(valeurBrute.replace(",", ".")) || 0) * 1000 : valeurBrute;
    const base = toNewCaisseStock(caisse);
    const updated: NewCaisseStock = { ...base, [champ]: valeur };
    if (JSON.stringify(updated) === JSON.stringify(base)) return;
    await caisseStockApi.update(caisse.id, updated, trigramme);
    await reload();
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 4 }}>
            Caisses
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>Caisses en stock</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating((v) => !v)} disabled={readOnly}>
          + Ajouter une caisse
        </button>
      </div>

      {(readOnly || lock.incomingRequest) && (
        <LockBanner
          holderTrigramme={lock.holderTrigramme}
          incomingRequest={lock.incomingRequest}
          outgoingRequestStatus={lock.outgoingRequestStatus}
          onRequestPen={lock.requestPen}
          onApprove={lock.approveRequest}
          onDeny={lock.denyRequest}
        />
      )}

      <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: -20, marginBottom: 24 }}>
        L'affectation d'une caisse à une affaire se fait désormais depuis Demandes (menu « Stock » d'une ligne) —
        cet écran affiche l'affectation actuelle à titre informatif.
      </p>

      {creating && (
        <form
          onSubmit={handleCreate}
          className="panel"
          style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, padding: 18, marginBottom: 24 }}
        >
          <div style={{ gridColumn: "span 3" }}>
            <label style={labelStyle}>Nom</label>
            <input autoFocus value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} style={inputStyle} />
            <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "4px 0 0" }}>
              Préfixer par « AR_CAISS » pour une caisse réutilisable, affectable à plusieurs affaires en même temps.
            </p>
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
                <th style={thStyle}>Longueur (m)</th>
                <th style={thStyle}>Largeur (m)</th>
                <th style={thStyle}>Hauteur (m)</th>
                <th style={thStyle}>Observations</th>
                <th style={thStyle}>Affectation</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {caisses.map((c) => {
                function cell(champ: Champ, valeurAffichee: React.ReactNode, mono = false) {
                  const enEdition = cellEnEdition?.id === c.id && cellEnEdition.champ === champ;
                  const estDimension = champ === "longueur_mm" || champ === "largeur_mm" || champ === "hauteur_mm";
                  return (
                    <td
                      style={{ ...tdStyle, cursor: readOnly ? "default" : "text", padding: enEdition ? 2 : tdStyle.padding }}
                      className={mono ? "mono" : undefined}
                      onClick={() => !readOnly && !enEdition && setCellEnEdition({ id: c.id, champ })}
                    >
                      {enEdition ? (
                        <EditableCellInput
                          type={estDimension ? "number" : "text"}
                          defaultValue={estDimension ? String((c[champ] as number) / 1000) : String(c[champ])}
                          align="left"
                          onCommit={(v) => sauvegarderChamp(c, champ, v)}
                          onCancel={() => setCellEnEdition(null)}
                        />
                      ) : (
                        valeurAffichee
                      )}
                    </td>
                  );
                }
                const demandeProprietaire =
                  demandes.find((d) => d.caisse_stock_id === c.id) ??
                  (() => {
                    const sc = demandeCaisses.find((sl) => sl.caisse_stock_id === c.id);
                    return sc ? demandes.find((d) => d.id === sc.demande_id) : undefined;
                  })();
                return (
                  <tr key={c.id} style={{ background: c.validee ? "var(--success-bg, #d4f4dd)" : undefined }}>
                    {cell("nom", c.nom)}
                    {cell("longueur_mm", (c.longueur_mm / 1000).toFixed(2), true)}
                    {cell("largeur_mm", (c.largeur_mm / 1000).toFixed(2), true)}
                    {cell("hauteur_mm", (c.hauteur_mm / 1000).toFixed(2), true)}
                    {cell("observations", c.observations)}
                    <td style={tdStyle}>
                      {estArCaiss(c.nom) ? (
                        <span style={{ color: "var(--text-faint)" }}>—</span>
                      ) : (
                        <span>{demandeProprietaire ? demandeProprietaire.affaire : "Non affectée"}</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(c.id, c.nom)} disabled={readOnly}>
                        Suppr.
                      </button>
                    </td>
                  </tr>
                );
              })}
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
  borderBottom: "2px solid var(--row-border-color)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 8px",
  borderBottom: "1px solid var(--row-border-color)",
  verticalAlign: "top",
};
