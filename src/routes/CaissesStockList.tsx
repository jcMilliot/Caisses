import { useEffect, useState } from "react";
import { caisseStockApi } from "../data/caisseStock";
import { demandesApi } from "../data/demandes";
import { demandeCaisseApi } from "../data/demandeCaisse";
import { useSectionLock } from "../hooks/useSectionLock";
import LockBanner from "../components/LockBanner";
import GererCaissesStockDialog from "../components/GererCaissesStockDialog";
import { estArCaiss, estStockACommander } from "../domain/caisseStock";
import PastilleAlerte from "../components/PastilleAlerte";
import { estDemandeCaisseValidee, estDemandeValidee } from "../domain/demandeOptions";
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

  // Caisse de récup (hors AR_CAISS_) utilisée sur une ligne livrée : masquée de la liste, pas
  // supprimée — les lignes de Gestion des caisses continuent de pointer dessus (2026-10-01).
  const caissesVisibles = caisses.filter((c) => {
    if (estArCaiss(c.nom)) return true;
    if (c.validee) return false;
    const mereLivree = demandes.some((d) => d.caisse_stock_id === c.id && estDemandeValidee(d));
    const sousCaisseLivree = demandeCaisses.some((sc) => {
      if (sc.caisse_stock_id !== c.id) return false;
      const mere = demandes.find((d) => d.id === sc.demande_id);
      return estDemandeCaisseValidee(sc) || (mere !== undefined && estDemandeValidee(mere));
    });
    return !mereLivree && !sousCaisseLivree;
  });

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px 48px" }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Caisses en stock</h1>
          <p className="page-subtitle">
            Création, modification et suppression des caisses.
            <br />
            L'affectation d'une caisse à une affaire se fait depuis Gestion des caisses (menu « Stock » d'une ligne).
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setGestionOuverte(true)} disabled={readOnly}>
          Gérer les caisses
        </button>
      </div>

      {(readOnly || lock.incomingRequest) && (
        <LockBanner
          lectureSeule={lock.lectureSeule}
          holderTrigramme={lock.holderTrigramme}
          incomingRequest={lock.incomingRequest}
          outgoingRequestStatus={lock.outgoingRequestStatus}
          onRequestPen={lock.requestPen}
          onApprove={lock.approveRequest}
          onDeny={lock.denyRequest}
        />
      )}

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Chargement…</p>
      ) : caissesVisibles.length === 0 ? (
        <div className="panel" style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
          <p style={{ margin: 0 }}>Aucune caisse en stock pour l'instant.</p>
        </div>
      ) : (
        <div className="panel" style={{ padding: 0, overflowX: "auto" }}>
          <table className="table-donnees">
            <thead>
              <tr>
                <th style={thStyle}>Nom</th>
                <th style={thStyle}>Longueur (m)</th>
                <th style={thStyle}>Largeur (m)</th>
                <th style={thStyle}>Hauteur (m)</th>
                <th style={thStyle}>Type d'ouverture</th>
                <th style={thStyle}>Qté en stock</th>
                <th style={thStyle}>Observations</th>
                <th style={thStyle}>Affectation</th>
              </tr>
            </thead>
            <tbody>
              {caissesVisibles.map((c) => {
                const demandeProprietaire =
                  demandes.find((d) => d.caisse_stock_id === c.id) ??
                  (() => {
                    const sc = demandeCaisses.find((sl) => sl.caisse_stock_id === c.id);
                    return sc ? demandes.find((d) => d.id === sc.demande_id) : undefined;
                  })();
                const aCommander = estStockACommander(c);
                return (
                  <tr
                    key={c.id}
                    style={{ background: aCommander ? "var(--danger-bg)" : c.validee ? "var(--success-bg, #d4f4dd)" : undefined }}
                  >
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 600 }}>{c.nom}</span>
                      {aCommander && (
                        <span
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 8, color: "var(--danger-text)", fontWeight: 700 }}
                        >
                          <PastilleAlerte titre={`Stock (${c.quantite}) au seuil d'alerte (${c.seuil_alerte}), réglé dans Admin › Caisses.`} />
                          À commander
                        </span>
                      )}
                    </td>
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
                    <td style={tdStyle} className="mono">
                      {estArCaiss(c.nom) ? c.quantite : <span style={{ color: "var(--text-faint)" }}>—</span>}
                    </td>
                    <td style={tdStyle}>{c.observations}</td>
                    <td style={tdStyle}>
                      {estArCaiss(c.nom) ? (
                        <span style={{ color: "var(--text-faint)" }}>—</span>
                      ) : (
                        demandeProprietaire ? (
                          <span style={{ fontWeight: 600 }}>{demandeProprietaire.affaire}</span>
                        ) : (
                          <span className="badge badge-muted">Non affectée</span>
                        )
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
          caisses={caissesVisibles}
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

// En-têtes / cellules : .table-donnees (index.css).
const thStyle: React.CSSProperties = {};
const tdStyle: React.CSSProperties = {};
