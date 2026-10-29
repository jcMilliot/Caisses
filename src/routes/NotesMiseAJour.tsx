import { useEffect } from "react";
import { LIBELLE_RUBRIQUE, NOTES_MISE_A_JOUR, type GenreRubrique, type NoteVersion } from "../domain/notesMiseAJour";
import { rendreTexte } from "../components/texteDoc";

// Page « Notes de mise à jour » (carte de l'accueil, 2026-10-29) : la dernière version dépliée,
// les précédentes repliées. Texte dans domain/notesMiseAJour.ts.

const CLE_VUE = "caisses:notesMiseAJourVues";

// Vrai si la dernière version des notes n'a pas encore été ouverte sur ce poste (pastille
// « Nouveau » sur la carte de l'accueil).
export function notesNonLues(): boolean {
  try {
    return localStorage.getItem(CLE_VUE) !== NOTES_MISE_A_JOUR[0]?.version;
  } catch {
    return false;
  }
}

const COULEURS: Record<GenreRubrique, { fond: string; texte: string; bord: string }> = {
  nouveau: { fond: "var(--info-bg)", texte: "var(--info-text)", bord: "var(--info-border)" },
  ameliore: { fond: "var(--ok-bg)", texte: "var(--ok-text)", bord: "var(--ok-border)" },
  corrige: { fond: "var(--warn-bg)", texte: "var(--warn-text)", bord: "var(--warn-border)" },
};

export default function NotesMiseAJour() {
  useEffect(() => {
    try {
      localStorage.setItem(CLE_VUE, NOTES_MISE_A_JOUR[0]?.version ?? "");
    } catch {
      // Stockage indisponible : la pastille « Nouveau » restera, sans gêne.
    }
  }, []);

  const [derniere, ...precedentes] = NOTES_MISE_A_JOUR;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px 48px" }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Notes de mise à jour</h1>
          <p className="page-subtitle">Ce qui change dans l'application, version après version.</p>
        </div>
      </div>

      {derniere && <CarteVersion note={derniere} derniere />}

      {precedentes.length > 0 && (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 650, color: "var(--text-muted)", margin: "32px 0 12px" }}>Versions précédentes</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {precedentes.map((n) => (
              <details key={n.version} className="panel" style={{ padding: 0, overflow: "hidden" }}>
                <summary style={{ cursor: "pointer", padding: "14px 18px", display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                  <BadgeVersion version={n.version} />
                  <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{n.date}</span>
                  <span style={{ fontSize: 14 }}>{n.resume}</span>
                </summary>
                <div style={{ padding: "0 18px 18px" }}>
                  <Rubriques note={n} />
                </div>
              </details>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BadgeVersion({ version }: { version: string }) {
  return (
    <span style={{ fontWeight: 700, fontSize: 14, padding: "2px 10px", borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent)" }}>
      Version {version}
    </span>
  );
}

function CarteVersion({ note, derniere }: { note: NoteVersion; derniere?: boolean }) {
  return (
    <section className="panel" style={{ padding: "22px 24px", boxShadow: "var(--shadow-md)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <BadgeVersion version={note.version} />
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{note.date}</span>
        {derniere && (
          <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: "var(--ok-bg)", color: "var(--ok-text)", border: "1px solid var(--ok-border)" }}>
            Dernière version
          </span>
        )}
      </div>
      <p style={{ fontSize: 16.5, fontWeight: 600, margin: "14px 0 4px", lineHeight: 1.4 }}>{note.resume}</p>
      <Rubriques note={note} />
    </section>
  );
}

function Rubriques({ note }: { note: NoteVersion }) {
  return (
    <>
      {note.rubriques.map((r) => {
        const { titre, icone } = LIBELLE_RUBRIQUE[r.genre];
        const c = COULEURS[r.genre];
        return (
          <div key={r.genre} style={{ marginTop: 20 }}>
            <h3
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                fontWeight: 700,
                margin: "0 0 10px",
                padding: "3px 10px",
                borderRadius: 999,
                background: c.fond,
                color: c.texte,
                border: `1px solid ${c.bord}`,
              }}
            >
              <span aria-hidden>{icone}</span>
              {titre}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {r.points.map((p) => (
                <div key={p.titre} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <span
                    aria-hidden
                    style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 10, background: "var(--bg-panel-alt)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}
                  >
                    {p.icone}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 650, fontSize: 14.5 }}>{p.titre}</div>
                    <p style={{ margin: "3px 0 0", fontSize: 14, lineHeight: 1.55, color: "var(--text)" }}>{rendreTexte(p.texte)}</p>
                    {p.details && (
                      <ul style={{ margin: "6px 0 0", paddingLeft: 20, fontSize: 13.5, lineHeight: 1.55, color: "var(--text-muted)" }}>
                        {p.details.map((d) => (
                          <li key={d} style={{ marginTop: 3 }}>
                            {rendreTexte(d)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
