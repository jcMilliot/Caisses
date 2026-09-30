import { useEffect, useMemo, useState } from "react";
import { journalApi } from "../data/journal";
import { formaterHorodatage } from "../domain/dates";
import type { JournalEntree } from "../domain/types";

const LIBELLE_ACTION: Record<string, string> = {
  creation: "Création",
  suppression: "Suppression",
  modification_dimensions: "Modif. dimensions",
  reference_ajout: "Référence ajoutée",
  reference_modification: "Référence renommée",
  reference_suppression: "Référence supprimée",
  restauration: "Restauration",
};

const LIBELLE_ENTITE: Record<string, string> = {
  demande: "Caisse",
  demande_caisse: "Sous-caisse",
  option_liste: "Référence",
  base: "Base de données",
};

const COULEUR_ACTION: Record<string, string> = {
  creation: "var(--ok-text)",
  suppression: "var(--danger-text)",
  modification_dimensions: "var(--warn-text)",
  reference_ajout: "var(--ok-text)",
  reference_modification: "var(--warn-text)",
  reference_suppression: "var(--danger-text)",
  restauration: "var(--danger-text)",
};

// Onglet « Journal » de la page Admin (session admin requise côté backend).
export default function Journal() {
  const [entrees, setEntrees] = useState<JournalEntree[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtreTrigramme, setFiltreTrigramme] = useState("");
  const [filtreAction, setFiltreAction] = useState("");

  useEffect(() => {
    setLoading(true);
    journalApi
      .list(1000)
      .then(setEntrees)
      .finally(() => setLoading(false));
  }, []);

  const trigrammes = useMemo(
    () => [...new Set(entrees.map((e) => e.trigramme))].sort(),
    [entrees],
  );

  const filtrees = entrees.filter(
    (e) =>
      (filtreTrigramme === "" || e.trigramme === filtreTrigramme) &&
      (filtreAction === "" || e.action === filtreAction),
  );

  return (
    <div>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 14px" }}>
        Création / suppression de caisses et sous-caisses, modification de dimensions, gestion des références.
        Historique conservé 2 mois.
      </p>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <select value={filtreTrigramme} onChange={(e) => setFiltreTrigramme(e.target.value)} style={selectStyle}>
          <option value="">Tous les auteurs</option>
          {trigrammes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={filtreAction} onChange={(e) => setFiltreAction(e.target.value)} style={selectStyle}>
          <option value="">Toutes les actions</option>
          {Object.entries(LIBELLE_ACTION).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
          {filtrees.length} entrée{filtrees.length > 1 ? "s" : ""}
        </span>
      </div>

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Chargement…</p>
      ) : filtrees.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>Aucune entrée.</p>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: "auto", maxHeight: "calc(100vh - 300px)" }}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
                <th style={thStyle}>Date &amp; heure</th>
                <th style={thStyle}>Auteur</th>
                <th style={thStyle}>Action</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Détails</th>
              </tr>
            </thead>
            <tbody>
              {filtrees.map((e) => (
                <tr key={e.id} className="article-row">
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }} className="mono">
                    {formaterHorodatage(e.horodatage)}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{e.trigramme}</td>
                  <td style={{ ...tdStyle, fontWeight: 600, color: COULEUR_ACTION[e.action] ?? "var(--text)" }}>
                    {LIBELLE_ACTION[e.action] ?? e.action}
                  </td>
                  <td style={tdStyle}>{LIBELLE_ENTITE[e.entite] ?? e.entite}</td>
                  <td style={tdStyle}>{e.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "6px 8px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius)",
  background: "var(--bg-panel)",
  color: "var(--text)",
  font: "inherit",
  fontSize: 12.5,
};

const thStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderBottom: "2px solid var(--row-border-color)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  position: "sticky",
  top: 0,
  background: "var(--bg-panel)",
  zIndex: 1,
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid var(--row-border-color)",
  verticalAlign: "top",
  textAlign: "left",
};
