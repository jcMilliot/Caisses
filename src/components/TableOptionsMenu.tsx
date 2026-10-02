import { useEffect, useRef, useState } from "react";
import { useSeparationLignesMarquee } from "../hooks/useSettings";

interface ColonneOption<T extends string> {
  champ: T;
  label: string;
}

interface Props<T extends string> {
  colonnes: ColonneOption<T>[];
  colonnesVisibles: Set<T>;
  onChangeColonnesVisibles: (visibles: Set<T>) => void;
  compact: boolean;
  onChangeCompact: (compact: boolean) => void;
  masquerValidees: boolean;
  onChangeMasquerValidees: (masquer: boolean) => void;
  inverse?: boolean;
  onChangeInverse?: (inverse: boolean) => void;
  // Réordonner les colonnes (glisser-déposer) ; `colonnes` est alors donné dans l'ordre courant.
  // null = revenir à l'ordre par défaut.
  onChangeOrdre?: (ordre: T[] | null) => void;
}

export default function TableOptionsMenu<T extends string>({
  colonnes,
  colonnesVisibles,
  onChangeColonnesVisibles,
  compact,
  onChangeCompact,
  masquerValidees,
  onChangeMasquerValidees,
  inverse,
  onChangeInverse,
  onChangeOrdre,
}: Props<T>) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [separationMarquee, setSeparationMarquee] = useSeparationLignesMarquee();

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOuvert(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Glisser-déposer des colonnes (2026-10-02), aux événements pointeur : le glisser-déposer HTML5
  // n'est pas fiable dans la webview Tauri sous Windows. On attrape une ligne et on la lâche ;
  // un trait montre où elle va s'insérer. Un clic sans déplacement coche / décoche toujours.
  const lignesRef = useRef<(HTMLDivElement | null)[]>([]);
  const [glisse, setGlisse] = useState<{ depuis: number; vers: number } | null>(null);
  const clicAnnule = useRef(false);

  function commencerGlisser(e: React.PointerEvent, index: number) {
    if (!onChangeOrdre || (e.target as HTMLElement).tagName === "INPUT") return;
    const yDepart = e.clientY;
    let actif = false;
    let vers = index;
    function onMove(ev: PointerEvent) {
      if (!actif && Math.abs(ev.clientY - yDepart) < 4) return;
      actif = true;
      // Position d'insertion : avant la première ligne dont le milieu est sous le pointeur.
      const rects = lignesRef.current.map((el) => el?.getBoundingClientRect());
      const i = rects.findIndex((r) => r && ev.clientY < r.top + r.height / 2);
      vers = i === -1 ? colonnes.length : i;
      setGlisse({ depuis: index, vers });
    }
    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      setGlisse(null);
      if (!actif) return;
      // Le clic qui suit le lâcher est ignoré ; remis à zéro ensuite (lâcher hors de la ligne).
      clicAnnule.current = true;
      window.setTimeout(() => (clicAnnule.current = false), 0);
      const ordre = colonnes.map((c) => c.champ);
      const [deplace] = ordre.splice(index, 1);
      ordre.splice(vers > index ? vers - 1 : vers, 0, deplace);
      onChangeOrdre!(ordre);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  function toggleColonne(champ: T) {
    const next = new Set(colonnesVisibles);
    if (next.has(champ)) next.delete(champ);
    else next.add(champ);
    onChangeColonnesVisibles(next);
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="btn" onClick={() => setOuvert((v) => !v)}>
        Options
      </button>
      {ouvert && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            background: "var(--bg-panel)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius)",
            boxShadow: "var(--shadow-lg)",
            width: 300,
            zIndex: 50,
            fontSize: 13,
          }}
        >
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={compact} onChange={(e) => onChangeCompact(e.target.checked)} />
              Affichage compact
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={masquerValidees} onChange={(e) => onChangeMasquerValidees(e.target.checked)} />
              Masquer les caisses reçues
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={separationMarquee} onChange={(e) => setSeparationMarquee(e.target.checked)} />
              Séparation des lignes plus marquée
            </label>
            {onChangeInverse && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={inverse ?? false} onChange={(e) => onChangeInverse(e.target.checked)} />
                Tableau inversé (anciens en haut, saisie en bas)
              </label>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "10px 14px 4px",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-muted)",
            }}
          >
            {onChangeOrdre ? "Colonnes (affichage et ordre)" : "Colonnes visibles"}
            {onChangeOrdre && (
              <button
                onClick={() => onChangeOrdre(null)}
                style={{ marginLeft: "auto", background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11.5, color: "var(--accent)", textTransform: "none", letterSpacing: 0, fontWeight: 500 }}
              >
                Ordre par défaut
              </button>
            )}
          </div>
          {onChangeOrdre && (
            <div style={{ padding: "0 14px 4px", fontSize: 11.5, color: "var(--text-muted)" }}>
              Glisser une colonne pour changer sa place dans le tableau.
            </div>
          )}
          <div style={{ maxHeight: 340, overflowY: "auto", padding: "4px 6px 10px", userSelect: glisse ? "none" : undefined }}>
            {colonnes.map((c, i) => (
              <div
                key={c.champ}
                ref={(el) => {
                  lignesRef.current[i] = el;
                }}
                className="ligne-filtre-valeur"
                onPointerDown={(e) => commencerGlisser(e, i)}
                style={{
                  borderRadius: 4,
                  cursor: onChangeOrdre ? (glisse ? "grabbing" : "grab") : undefined,
                  opacity: glisse?.depuis === i ? 0.4 : 1,
                  // Trait d'insertion au-dessus de la ligne visée (ou sous la dernière).
                  boxShadow:
                    glisse && glisse.vers === i
                      ? "inset 0 2px 0 var(--accent)"
                      : glisse && glisse.vers === colonnes.length && i === colonnes.length - 1
                        ? "inset 0 -2px 0 var(--accent)"
                        : undefined,
                }}
              >
                <label
                  onClickCapture={(e) => {
                    // Fin d'un glisser : ne pas cocher / décocher la colonne lâchée.
                    if (clicAnnule.current) {
                      clicAnnule.current = false;
                      e.preventDefault();
                    }
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", cursor: "inherit" }}
                >
                  <input type="checkbox" checked={colonnesVisibles.has(c.champ)} onChange={() => toggleColonne(c.champ)} />
                  {c.label}
                </label>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
