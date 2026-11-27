import { useEffect, useRef, useState } from "react";
import { ENTETE_DOC, SECTIONS_DOC, type BlocDoc } from "../domain/documentation";
import { rendreTexte } from "../components/texteDoc";
import DocumentationTechnique from "./DocumentationTechnique";

// Documentation du processus métier, contenu dans domain/documentation.ts. Plus modifiable dans
// l'app depuis le 2026-11-26 (demande de l'utilisateur) : le texte se change dans le code. Ne pas
// y mentionner le journal.

interface Props {
  estAdmin: boolean;
}

type Onglet = "utilisateur" | "technique";

// Page Documentation : onglets « Documentation utilisateur » et « Documentation technique »
// (2026-10-15). L'onglet technique n'est visible que des administrateurs.
export default function Documentation({ estAdmin }: Props) {
  const docTechniqueVisible = estAdmin;
  const [onglet, setOnglet] = useState<Onglet>("utilisateur");
  const vue = docTechniqueVisible ? onglet : "utilisateur";

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: docTechniqueVisible ? "20px 24px 32px" : "32px 24px" }}>
      {docTechniqueVisible && (
        <div className="tabs">
          <button className={vue === "utilisateur" ? "tab actif" : "tab"} onClick={() => setOnglet("utilisateur")}>
            Documentation utilisateur
          </button>
          <button className={vue === "technique" ? "tab actif" : "tab"} onClick={() => setOnglet("technique")}>
            Documentation technique
          </button>
        </div>
      )}
      {vue === "technique" ? <DocumentationTechnique /> : <DocumentationUtilisateur />}
    </div>
  );
}

function DocumentationUtilisateur() {
  const [actif, setActif] = useState(SECTIONS_DOC[0].id);
  // Le clic dans le sommaire déclenche un scroll fluide qui traverse d'autres sections en
  // chemin : on ignore l'observer le temps du scroll pour éviter que la surbrillance clignote
  // sur les sections survolées avant d'arriver à la cible.
  const scrollProgrammatique = useRef(false);
  const reactiverObserverRef = useRef<number | undefined>(undefined);

  function allerA(id: string) {
    scrollProgrammatique.current = true;
    setActif(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.clearTimeout(reactiverObserverRef.current);
    reactiverObserverRef.current = window.setTimeout(() => {
      scrollProgrammatique.current = false;
    }, 700);
  }

  useEffect(() => {
    const sections = SECTIONS_DOC.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entrees) => {
        if (scrollProgrammatique.current) return;
        // Section la plus proche du haut de la zone de lecture parmi celles actuellement visibles.
        const visibles = entrees.filter((e) => e.isIntersecting);
        if (visibles.length === 0) return;
        const plusHaute = visibles.reduce((a, b) => (a.boundingClientRect.top <= b.boundingClientRect.top ? a : b));
        setActif(plusHaute.target.id);
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    );
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  function rendreBlocs(sectionId: string, blocs: BlocDoc[]) {
    const elements: React.ReactNode[] = [];
    let items: React.ReactNode[] = [];
    const viderListe = (cle: string) => {
      if (items.length > 0) elements.push(<ul key={`ul-${cle}`}>{items}</ul>);
      items = [];
    };
    blocs.forEach((b, i) => {
      const cle = `${sectionId}.${i}`;
      if (b.type === "h3") {
        viderListe(cle);
        elements.push(<h3 key={cle}>{rendreTexte(b.texte)}</h3>);
      } else {
        items.push(
          <li key={cle}>
            {rendreTexte(b.texte)}
            {b.sous && (
              <ul>
                {b.sous.map((x, j) => (
                  <li key={j}>{rendreTexte(x)}</li>
                ))}
              </ul>
            )}
          </li>,
        );
      }
    });
    viderListe("fin");
    return elements;
  }

  return (
    <div style={{ display: "flex", gap: 32 }}>
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          position: "sticky",
          top: 70,
          alignSelf: "flex-start",
          maxHeight: "calc(100vh - 100px)",
          overflow: "auto",
        }}
      >
        <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", margin: "6px 0 10px" }}>Sommaire</h2>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {SECTIONS_DOC.map((s) => (
            <button
              key={s.id}
              onClick={() => allerA(s.id)}
              style={{
                textAlign: "left",
                padding: "6px 10px",
                borderRadius: "var(--radius)",
                border: "none",
                background: actif === s.id ? "var(--accent-soft)" : "transparent",
                color: actif === s.id ? "var(--accent)" : "var(--text)",
                fontWeight: actif === s.id ? 600 : 400,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {s.sommaire}
            </button>
          ))}
        </nav>
      </aside>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ marginBottom: 28 }}>
          <h1 className="page-title">{ENTETE_DOC.titre}</h1>
          <div style={{ fontSize: 13.5, color: "var(--text-muted)", margin: "6px 0 0" }}>{ENTETE_DOC.intro}</div>
        </div>

        {SECTIONS_DOC.map((s) => (
          <section key={s.id} id={s.id} className="panel" style={{ padding: "20px 24px", marginBottom: 20, scrollMarginTop: 70 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 12px", letterSpacing: "-0.01em" }}>{s.titre}</h2>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--text)" }} className="doc-bloc">
              {rendreBlocs(s.id, s.blocs)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
