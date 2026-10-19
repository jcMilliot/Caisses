import { INTRO_DOC_TECHNIQUE, SECTIONS_DOC_TECHNIQUE } from "../domain/documentationTechnique";
import type { BlocDoc } from "../domain/documentation";
import { rendreTexte } from "../components/texteDoc";

// Onglet « Documentation technique » de la page Documentation (2026-10-15) : contenu fixe,
// lecture seule (domain/documentationTechnique.ts). Visible selon le droit décidé par la page.
export default function DocumentationTechnique() {
  return (
    <div style={{ display: "flex", gap: 32 }}>
      <aside style={{ width: 220, flexShrink: 0, position: "sticky", top: 70, alignSelf: "flex-start", maxHeight: "calc(100vh - 100px)", overflow: "auto" }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", margin: "6px 0 10px" }}>Sommaire</h2>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {SECTIONS_DOC_TECHNIQUE.map((s) => (
            <button
              key={s.id}
              onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              style={{ textAlign: "left", padding: "6px 10px", borderRadius: "var(--radius)", border: "none", background: "transparent", color: "var(--text)", fontSize: 13, cursor: "pointer" }}
            >
              {s.titre}
            </button>
          ))}
        </nav>
      </aside>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ marginBottom: 28 }}>
          <h1 className="page-title">Documentation technique</h1>
          <p style={{ fontSize: 13.5, color: "var(--text-muted)", margin: "6px 0 0" }}>{INTRO_DOC_TECHNIQUE}</p>
        </div>
        {SECTIONS_DOC_TECHNIQUE.map((s) => (
          <section key={s.id} id={s.id} className="panel" style={{ padding: "20px 24px", marginBottom: 20, scrollMarginTop: 70 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 12px", letterSpacing: "-0.01em" }}>{s.titre}</h2>
            <div style={{ fontSize: 13.5, lineHeight: 1.6 }} className="doc-bloc">
              <Blocs blocs={s.blocs} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

// Titres h3 et listes à puces (avec sous-points), regroupés comme dans la documentation utilisateur.
function Blocs({ blocs }: { blocs: BlocDoc[] }) {
  const groupes: (BlocDoc | BlocDoc[])[] = [];
  for (const b of blocs) {
    const dernier = groupes[groupes.length - 1];
    if (b.type === "li" && Array.isArray(dernier)) dernier.push(b);
    else groupes.push(b.type === "li" ? [b] : b);
  }
  return (
    <>
      {groupes.map((g, i) =>
        Array.isArray(g) ? (
          <ul key={i} style={{ margin: "0 0 12px", paddingLeft: 20 }}>
            {g.map((b, j) =>
              b.type === "li" ? (
                <li key={j} style={{ marginBottom: 4 }}>
                  {rendreTexte(b.texte)}
                  {b.sous && (
                    <ul style={{ margin: "4px 0", paddingLeft: 20 }}>
                      {b.sous.map((t, k) => (
                        <li key={k}>{rendreTexte(t)}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ) : null,
            )}
          </ul>
        ) : (
          <h3 key={i} style={{ fontSize: 14.5, fontWeight: 700, margin: "14px 0 6px" }}>
            {rendreTexte(g.texte)}
          </h3>
        ),
      )}
    </>
  );
}
