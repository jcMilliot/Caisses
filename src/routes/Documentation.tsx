import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { SECTIONS_DOC, textesParDefaut, type BlocDoc } from "../domain/documentation";
import { documentationApi } from "../data/documentation";
import { confirmerAction } from "../data/confirm";
import { useSessionAdmin } from "../hooks/useSessionAdmin";

// Documentation du processus métier. Contenu par défaut dans domain/documentation.ts ; les
// administrateurs peuvent en modifier les textes (titres, sommaire, points) via « Modifier »
// (décision 2026-09-30, textes seulement — sections et points fixes). Seuls les textes modifiés
// sont enregistrés en base. Ne pas y mentionner le journal ni la page Admin (demande de
// l'utilisateur, 2026-09-28).

interface Props {
  trigramme: string;
  estAdmin: boolean;
}

// Texte avec **gras** → éléments React.
function rendreTexte(texte: string): React.ReactNode {
  return texte.split(/(\*\*[^*]+\*\*)/g).map((morceau, i) =>
    morceau.startsWith("**") && morceau.endsWith("**") && morceau.length > 4 ? (
      <strong key={i}>{morceau.slice(2, -2)}</strong>
    ) : (
      <Fragment key={i}>{morceau}</Fragment>
    ),
  );
}

export default function Documentation({ trigramme, estAdmin }: Props) {
  const defauts = useMemo(() => textesParDefaut(), []);
  const [enregistres, setEnregistres] = useState<Record<string, string>>({});
  const [brouillon, setBrouillon] = useState<Record<string, string> | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const { assurerSession, dialogue } = useSessionAdmin(trigramme);

  useEffect(() => {
    documentationApi.getTextes().then(setEnregistres).catch((e) => setErreur(String(e)));
  }, []);

  const edition = brouillon !== null;
  const courants = brouillon ?? enregistres;
  const texte = (cle: string) => courants[cle] ?? defauts[cle] ?? "";
  const modifie = edition && JSON.stringify(nettoyer(brouillon, defauts)) !== JSON.stringify(nettoyer(enregistres, defauts));

  function changer(cle: string, valeur: string) {
    setBrouillon((prev) => ({ ...(prev ?? {}), [cle]: valeur }));
  }

  async function commencerEdition() {
    if (!(await assurerSession())) return;
    setErreur(null);
    setBrouillon({ ...enregistres });
  }

  async function enregistrer() {
    if (!brouillon) return;
    try {
      const aEnregistrer = nettoyer(brouillon, defauts);
      await documentationApi.setTextes(aEnregistrer);
      setEnregistres(aEnregistrer);
      setBrouillon(null);
    } catch (e) {
      setErreur(String(e));
    }
  }

  async function annuler() {
    if (modifie && !(await confirmerAction("Abandonner les modifications de la documentation ?", "Annuler"))) return;
    setBrouillon(null);
  }

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

  // Texte affiché ou champ de saisie selon le mode.
  function champ(cle: string, multiligne = true, style?: React.CSSProperties) {
    if (!edition) return rendreTexte(texte(cle));
    return multiligne ? (
      <TexteAuto valeur={texte(cle)} onChange={(v) => changer(cle, v)} />
    ) : (
      <input className="input" value={texte(cle)} onChange={(e) => changer(cle, e.target.value)} style={{ width: "100%", ...style }} />
    );
  }

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
        elements.push(<h3 key={cle}>{champ(cle, false, { fontSize: 14, fontWeight: 700 })}</h3>);
      } else {
        items.push(
          <li key={cle}>
            {champ(cle)}
            {b.sous && (
              <ul>
                {b.sous.map((_, j) => (
                  <li key={j}>{champ(`${cle}.${j}`)}</li>
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
    <div style={{ display: "flex", maxWidth: 1200, margin: "0 auto", padding: "32px 24px", gap: 32 }}>
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
          {SECTIONS_DOC.map((s) =>
            edition ? (
              <input
                key={s.id}
                className="input"
                value={texte(`${s.id}.sommaire`)}
                onChange={(e) => changer(`${s.id}.sommaire`, e.target.value)}
                style={{ fontSize: 13, padding: "5px 8px", marginBottom: 2 }}
              />
            ) : (
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
                {texte(`${s.id}.sommaire`)}
              </button>
            ),
          )}
        </nav>
      </aside>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <h1 className="page-title">
              {champ("entete.titre", false, { fontSize: 22, fontWeight: 700 })}
            </h1>
            <div style={{ fontSize: 13.5, color: "var(--text-muted)", margin: "6px 0 0" }}>{champ("entete.intro")}</div>
          </div>
          {estAdmin && (
            <div style={{ display: "flex", gap: 8, flexShrink: 0, position: "sticky", top: 70 }}>
              {!edition && (
                <button className="btn btn-sm" onClick={commencerEdition}>
                  Modifier
                </button>
              )}
              {edition && !modifie && (
                <button className="btn btn-sm" onClick={() => setBrouillon(null)}>
                  Terminer
                </button>
              )}
              {modifie && (
                <>
                  <button className="btn btn-sm btn-pastel-orange" onClick={annuler}>
                    Annuler
                  </button>
                  <button className="btn btn-sm btn-success-solid" onClick={enregistrer}>
                    Enregistrer
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {edition && (
          <p style={{ fontSize: 12.5, color: "var(--info-text)", background: "var(--info-bg)", padding: "8px 12px", borderRadius: "var(--radius)", margin: "-12px 0 20px" }}>
            Mode modification : chaque texte est modifiable. Entourer un mot de **deux astérisques** pour le mettre en gras.
            Vider un champ rétablit le texte d'origine.
          </p>
        )}
        {erreur && <p style={{ fontSize: 13, color: "var(--danger-text)", margin: "0 0 16px" }}>{erreur}</p>}

        {SECTIONS_DOC.map((s) => (
          <section key={s.id} id={s.id} className="panel" style={{ padding: "20px 24px", marginBottom: 20, scrollMarginTop: 70 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 12px", letterSpacing: "-0.01em" }}>
              {champ(`${s.id}.titre`, false, { fontSize: 16, fontWeight: 700 })}
            </h2>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--text)" }} className="doc-bloc">
              {rendreBlocs(s.id, s.blocs)}
            </div>
          </section>
        ))}
      </div>

      {dialogue}
    </div>
  );
}

// Ne garde que les textes différents du contenu par défaut (un champ vidé revient au défaut).
function nettoyer(textes: Record<string, string>, defauts: Record<string, string>): Record<string, string> {
  const r: Record<string, string> = {};
  for (const [cle, valeur] of Object.entries(textes)) {
    if (cle in defauts && valeur.trim() !== "" && valeur !== defauts[cle]) r[cle] = valeur;
  }
  return r;
}

// Zone de texte qui s'agrandit avec son contenu.
function TexteAuto({ valeur, onChange }: { valeur: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [valeur]);
  return (
    <textarea
      ref={ref}
      className="input"
      value={valeur}
      onChange={(e) => onChange(e.target.value)}
      rows={1}
      style={{ width: "100%", resize: "none", font: "inherit", lineHeight: 1.5, padding: "4px 8px", overflow: "hidden" }}
    />
  );
}
