import { useEffect, useState } from "react";
import { demandesApi } from "../data/demandes";
import { dateIsoVersAffichage } from "../domain/dates";
import { caissesACommanderCetteSemaine, caissesARapatrierCetteSemaine, type AffaireACommander } from "../domain/caissesACommander";
import type { Demande } from "../domain/types";

type Section = "demandes" | "simulations" | "stock" | "achats";

interface CardDef {
  id: Section;
  titre: string;
  description: string;
  icone: string;
}

const CARDS: CardDef[] = [
  {
    id: "demandes",
    titre: "Demandes",
    description: "Suivi des demandes de caisses",
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
}

export default function Accueil({ onSelect }: Props) {
  const [demandes, setDemandes] = useState<Demande[] | null>(null);

  useEffect(() => {
    demandesApi.list().then(setDemandes);
  }, []);

  const aCommander = demandes ? caissesACommanderCetteSemaine(demandes) : [];
  const aRapatrier = demandes ? caissesARapatrierCetteSemaine(demandes) : [];

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "48px 24px", display: "flex", gap: 48 }}>
      <div style={{ flex: "0 0 auto", width: 520 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 24px", letterSpacing: "-0.01em" }}>Accueil</h1>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 16,
          }}
        >
          {CARDS.map((c) => (
            <button
              key={c.id}
              className="panel"
              onClick={() => onSelect(c.id)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 8,
                padding: 24,
                textAlign: "left",
                cursor: "pointer",
                border: "1px solid var(--border)",
                background: "var(--bg-panel)",
              }}
            >
              <span style={{ fontSize: 32 }}>{c.icone}</span>
              <span style={{ fontSize: 18, fontWeight: 600 }}>{c.titre}</span>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{c.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: "0 0 auto", borderLeft: "1px solid var(--border)" }} />

      <div style={{ flex: 1, minWidth: 0, paddingTop: 4, display: "flex", flexDirection: "column", gap: 32 }}>
        <ListeAffaires titre="Caisses à commander cette semaine" affaires={aCommander} chargement={demandes === null} />
        <ListeAffaires titre="Caisses à rapatrier cette semaine" affaires={aRapatrier} chargement={demandes === null} />
      </div>
    </div>
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
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 16px", letterSpacing: "-0.01em" }}>{titre}</h2>
      <div className="panel" style={{ padding: affaires.length > 0 ? 0 : 24, color: "var(--text-muted)" }}>
        {chargement ? (
          <p style={{ margin: 0, padding: 24 }}>Chargement…</p>
        ) : affaires.length === 0 ? (
          <p style={{ margin: 0 }}>Aucune affaire pour l'instant.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {affaires.map(({ demande, datePickingAffichage }) => (
              <li
                key={demande.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{demande.affaire}</span>
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
