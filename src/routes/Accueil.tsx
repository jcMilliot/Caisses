import { useEffect, useState } from "react";
import { demandesApi } from "../data/demandes";
import { caisseStockApi } from "../data/caisseStock";
import { caissesStockACommander } from "../domain/caisseStock";
import PastilleAlerte from "../components/PastilleAlerte";
import IconeNav from "../components/IconeNav";
import { dateIsoVersAffichage } from "../domain/dates";
import { MESSAGE_ALERTE_COMMANDE, caissesACommanderCetteSemaine, caissesARapatrierCetteSemaine, type AffaireACommander } from "../domain/caissesACommander";
import type { CaisseStock, Demande } from "../domain/types";

type Section = "demandes" | "simulations" | "stock" | "achats" | "admin" | "documentation";

interface CardDef {
  id: Exclude<Section, "admin" | "documentation">;
  titre: string;
  description: string;
  icone: string;
}

const CARDS: CardDef[] = [
  {
    id: "demandes",
    titre: "Gestion des caisses",
    description: "Tableau de suivi des caisses",
    icone: "📋",
  },
  {
    id: "simulations",
    titre: "Simulations",
    description: "Affaires, articles et calcul des caisses",
    icone: "📦",
  },
  {
    id: "stock",
    titre: "Caisses en stock",
    description: "Inventaire des caisses disponibles",
    icone: "🏷️",
  },
  {
    id: "achats",
    titre: "Demandes d'achats",
    description: "Génération et envoi des affiches d'achat",
    icone: "🛒",
  },
];

interface Props {
  onSelect: (section: Section) => void;
  estAdmin: boolean;
}

export default function Accueil({ onSelect, estAdmin }: Props) {
  const [demandes, setDemandes] = useState<Demande[] | null>(null);
  const [stockACommander, setStockACommander] = useState<CaisseStock[]>([]);

  useEffect(() => {
    demandesApi.list().then(setDemandes);
    caisseStockApi
      .list()
      .then((c) => setStockACommander(caissesStockACommander(c)))
      .catch((e) => console.warn("Caisses de stock à commander :", e));
  }, []);

  const aCommander = demandes ? caissesACommanderCetteSemaine(demandes) : [];
  const aRapatrier = demandes ? caissesARapatrierCetteSemaine(demandes) : [];

  return (
    <>
    {/* Pas de bandeau sur l'accueil : Admin et Documentation y sont posés aux coins de l'écran
        (Admin en haut à droite comme dans le bandeau des autres pages). */}
    {estAdmin && (
      <button className="nav-lien" onClick={() => onSelect("admin")} style={{ position: "fixed", top: 14, right: 20, zIndex: 50 }}>
        <IconeNav nom="admin" taille={15} />
        Admin
      </button>
    )}
    <button className="nav-lien" onClick={() => onSelect("documentation")} style={{ position: "fixed", bottom: 14, left: 20, zIndex: 50 }}>
      <IconeNav nom="documentation" taille={15} />
      Documentation
    </button>
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "48px 24px", display: "flex", gap: 48 }}>
      <div style={{ flex: "0 0 auto", width: 520 }}>
        <h1 className="page-title" style={{ margin: "0 0 24px" }}>Accueil</h1>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 16,
          }}
        >
          {CARDS.map((c) => (
            <button key={c.id} className="panel carte-accueil" onClick={() => onSelect(c.id)}>
              <span className="carte-accueil-icone">{c.icone}</span>
              <span style={{ fontSize: 16.5, fontWeight: 650, marginTop: 6 }}>{c.titre}</span>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{c.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: "0 0 auto", borderLeft: "1px solid var(--border)" }} />

      <div style={{ flex: 1, minWidth: 0, paddingTop: 4, display: "flex", flexDirection: "column", gap: 32 }}>
        {stockACommander.length > 0 && (
          <StockACommander caisses={stockACommander} onOuvrir={() => onSelect("stock")} />
        )}
        <ListeAffaires titre="Caisses à commander cette semaine" affaires={aCommander} chargement={demandes === null} />
        <ListeAffaires titre="Caisses à rapatrier cette semaine" affaires={aRapatrier} chargement={demandes === null} />
      </div>
    </div>
    </>
  );
}

function ListeAffaires({
  titre,
  affaires,
  chargement,
}: {
  titre: string;
  affaires: AffaireACommander[];
  chargement: boolean;
}) {
  return (
    <div>
      <h2 style={titreBlocStyle}>{titre}</h2>
      <div className="panel liste-accueil" style={{ padding: affaires.length > 0 ? 0 : "18px 20px", color: "var(--text-muted)", overflow: "hidden" }}>
        {chargement ? (
          <p style={{ margin: 0, padding: 24 }}>Chargement…</p>
        ) : affaires.length === 0 ? (
          <p style={{ margin: 0 }}>Aucune affaire pour l'instant.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {affaires.map(({ demande, datePickingAffichage, urgent }) => (
              <li
                key={demande.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "11px 18px",
                  background: urgent ? "var(--danger-bg)" : undefined,
                }}
                title={urgent ? MESSAGE_ALERTE_COMMANDE : undefined}
              >
                <span style={{ fontWeight: 600, color: "var(--text)" }}>
                  {demande.affaire}
                  {urgent && (
                    <span style={{ marginLeft: 10, fontSize: 12.5, fontWeight: 700, color: "var(--danger-text)" }}>À commander</span>
                  )}
                </span>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  Picking {dateIsoVersAffichage(datePickingAffichage)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Caisses AR_CAISS_ gérées arrivées au seuil d'alerte (Admin › Caisses) — n'apparaît que s'il y en a.
function StockACommander({ caisses, onOuvrir }: { caisses: CaisseStock[]; onOuvrir: () => void }) {
  return (
    <div>
      <h2 style={titreBlocStyle}>Caisses de stock à commander</h2>
      <div className="panel liste-accueil" style={{ padding: 0, overflow: "hidden" }}>
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {caisses.map((c) => (
            <li
              key={c.id}
              onClick={onOuvrir}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                padding: "11px 18px",
                background: "var(--danger-bg)",
                cursor: "pointer",
              }}
              title="Ouvrir Caisses en stock"
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600, color: "var(--text)" }}>
                <PastilleAlerte titre="Stock au seuil d'alerte" />
                {c.nom} à commander
              </span>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {c.quantite} en stock (seuil {c.seuil_alerte})
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const titreBlocStyle: React.CSSProperties = { fontSize: 17, fontWeight: 700, margin: "0 0 12px" };
