import type { Article } from "../domain/types";

// Lignes supprimées dans l'intranet (QTARF vide) : hors du tableau et des calculs, listées sous
// le tableau d'articles ; elles reviennent si elles réapparaissent dans le picking (2026-10-07).
export default function ArticlesSupprimesIntranetBloc({ articles }: { articles: Article[] }) {
  if (articles.length === 0) return null;
  return (
    <div className="panel" style={{ marginTop: 16, padding: "14px 16px", borderLeft: "4px solid var(--border-strong)" }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>Lignes supprimées dans l'intranet</div>
      <table style={{ fontSize: 12.5, borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
            <th style={cellule}>AR</th>
            <th style={cellule}>Référence</th>
            <th style={cellule}>Désignation</th>
            <th style={{ ...cellule, textAlign: "right" }}>Dernière qté</th>
          </tr>
        </thead>
        <tbody>
          {articles.map((a) => (
            <tr key={a.id} style={{ color: "var(--text-muted)" }}>
              <td style={{ ...cellule, fontWeight: 700 }}>{a.ar}</td>
              <td style={cellule}>{a.reference || "—"}</td>
              <td style={cellule}>{a.designation || "—"}</td>
              <td style={{ ...cellule, textAlign: "right" }} className="mono">
                {a.quantite}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const cellule: React.CSSProperties = { padding: "4px 8px", borderBottom: "1px solid var(--border)" };
