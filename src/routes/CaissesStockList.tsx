import { useEffect, useState } from "react";
import { caisseStockApi } from "../data/caisseStock";
import { demandesApi } from "../data/demandes";
import { demandeCaisseApi } from "../data/demandeCaisse";
import { useSectionLock } from "../hooks/useSectionLock";
import LockBanner from "../components/LockBanner";
import GererCaissesStockDialog from "../components/GererCaissesStockDialog";
import { estArCaiss } from "../domain/caisseStock";
import type { CaisseStock, Demande, DemandeCaisse } from "../domain/types";

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
  const [gestionOuverte, setGestionOuverte] = useState(false);

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

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 4 }}>
            Caisses
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>Caisses en stock</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setGestionOuverte(true)} disabled={readOnly}>
          Gérer les caisses
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
        Création, modification et suppression des caisses : bouton « Gérer les caisses ». L'affectation d'une caisse à
        une affaire se fait depuis Gestion des caisses (menu « Stock » d'une ligne) — cet écran l'affiche à titre
        informatif.
      </p>

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
                <th style={thStyle}>Type d'ouverture</th>
                <th style={thStyle}>Observations</th>
                <th style={thStyle}>Affectation</th>
              </tr>
            </thead>
            <tbody>
              {caisses.map((c) => {
                const demandeProprietaire =
                  demandes.find((d) => d.caisse_stock_id === c.id) ??
                  (() => {
                    const sc = demandeCaisses.find((sl) => sl.caisse_stock_id === c.id);
                    return sc ? demandes.find((d) => d.id === sc.demande_id) : undefined;
                  })();
                return (
                  <tr key={c.id} style={{ background: c.validee ? "var(--success-bg, #d4f4dd)" : undefined }}>
                    <td style={tdStyle}>{c.nom}</td>
                    <td style={tdStyle} className="mono">
                      {(c.longueur_mm / 1000).toFixed(2)}
                    </td>
                    <td style={tdStyle} className="mono">
                      {(c.largeur_mm / 1000).toFixed(2)}
                    </td>
                    <td style={tdStyle} className="mono">
                      {(c.hauteur_mm / 1000).toFixed(2)}
                    </td>
                    <td style={tdStyle}>{c.type_ouverture}</td>
                    <td style={tdStyle}>{c.observations}</td>
                    <td style={tdStyle}>
                      {estArCaiss(c.nom) ? (
                        <span style={{ color: "var(--text-faint)" }}>—</span>
                      ) : (
                        <span>{demandeProprietaire ? demandeProprietaire.affaire : "Non affectée"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {gestionOuverte && !readOnly && (
        <GererCaissesStockDialog
          caisses={caisses}
          onCreer={async (caisse) => {
            await caisseStockApi.create(caisse, trigramme);
            await reload();
          }}
          onModifier={async (id, caisse) => {
            await caisseStockApi.update(id, caisse, trigramme);
            await reload();
          }}
          onSupprimer={async (id) => {
            await caisseStockApi.delete(id, trigramme);
            await reload();
          }}
          compterLignesLiees={caisseStockApi.countLignesLiees}
          onClose={() => setGestionOuverte(false)}
        />
      )}
    </div>
  );
}

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
