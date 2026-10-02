import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  valeurs: string[]; // valeurs distinctes présentes dans la colonne, déjà formatées pour affichage
  selection: Set<string> | null; // null = pas de filtre actif (tout affiché)
  onApply: (selection: Set<string> | null, tri: "asc" | "desc" | null) => void;
  triActif: "asc" | "desc" | null;
  onClose: () => void;
  ancre: HTMLElement; // élément déclencheur, sert à positionner la fenêtre (portail hors du tableau)
  estDate?: boolean; // conservé pour les appelants ; libellés de tri désormais communs
  // Condition propre à une colonne, en plus des conditions texte (ex. colonne AR de Simulations :
  // « Informations » → « Manquantes » / « Complètes »). Exclusive du filtre par valeurs.
  conditionSpeciale?: ConditionSpeciale;
}

export interface ConditionSpeciale {
  libelle: string;
  options: string[];
  actif: string | null;
  onApply: (valeur: string | null) => void;
}

type Onglet = "valeurs" | "condition";
type TypeCondition = "contient" | "egal" | "commence" | "termine" | "speciale";

const CONDITIONS: { id: TypeCondition; label: string }[] = [
  { id: "contient", label: "Contient" },
  { id: "egal", label: "Égal à" },
  { id: "commence", label: "Commence par" },
  { id: "termine", label: "Termine par" },
];

function correspond(valeur: string, type: TypeCondition, saisie: string): boolean {
  const v = valeur.toLowerCase();
  const q = saisie.trim().toLowerCase();
  switch (type) {
    case "contient":
      return v.includes(q);
    case "egal":
      return v === q;
    case "commence":
      return v.startsWith(q);
    case "termine":
      return v.endsWith(q);
    case "speciale":
      return true;
  }
}

const LARGEUR = 290;
const HAUTEUR_ESTIMEE = 470;

// Fenêtre de tri / filtre d'une colonne (DemandesTable, ArticlesTable) — refonte du 2026-10-02
// d'après un modèle fourni par l'utilisateur : déplaçable par la poignée en haut à droite, tri
// croissant / décroissant, onglet « Valeurs » (recherche, case « Tout sélectionner » unique,
// nombre de valeurs cochées) et onglet « Condition » (contient / égal à / commence par / termine
// par). Une condition est convertie en liste des valeurs qui la vérifient : le tableau ne connaît
// toujours qu'une sélection de valeurs. « Réinitialiser » retire filtre et tri de la colonne.
export default function ColumnFilterMenu({ valeurs, selection, onApply, triActif, onClose, ancre, conditionSpeciale }: Props) {
  const [onglet, setOnglet] = useState<Onglet>(conditionSpeciale?.actif ? "condition" : "valeurs");
  const [recherche, setRecherche] = useState("");
  // État local, non appliqué au tableau tant que l'utilisateur n'a pas cliqué sur Appliquer.
  const [selectionLocale, setSelectionLocale] = useState<Set<string>>(() => new Set(selection ?? valeurs));
  const [triLocal, setTriLocal] = useState<"asc" | "desc" | null>(triActif);
  const [typeCondition, setTypeCondition] = useState<TypeCondition>(conditionSpeciale?.actif ? "speciale" : "contient");
  const [choixSpecial, setChoixSpecial] = useState<string>(conditionSpeciale?.actif ?? conditionSpeciale?.options[0] ?? "");
  const [saisieCondition, setSaisieCondition] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const caseToutRef = useRef<HTMLInputElement>(null);

  // Position initiale sous l'en-tête (au-dessus s'il n'y a pas la place), puis libre au glisser.
  const [position, setPosition] = useState(() => {
    const rect = ancre.getBoundingClientRect();
    const placerAuDessus = rect.bottom + HAUTEUR_ESTIMEE > window.innerHeight && rect.top > HAUTEUR_ESTIMEE;
    return {
      x: Math.max(8, Math.min(rect.right - LARGEUR, window.innerWidth - LARGEUR - 8)),
      y: placerAuDessus ? Math.max(8, rect.top - HAUTEUR_ESTIMEE - 4) : rect.bottom + 4,
    };
  });
  const glisser = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) && !ancre.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, ancre]);

  const valeursFiltrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return valeurs;
    // Correspondance « commence par » (retour utilisateur du 2026-09-11), recalculée à chaque lettre.
    return valeurs.filter((v) => v.toLowerCase().startsWith(q));
  }, [valeurs, recherche]);

  function changerRecherche(q: string) {
    setRecherche(q);
    // La sélection suit la recherche : valider n'applique que les valeurs trouvées (sinon les
    // valeurs masquées restaient cochées en arrière-plan).
    const query = q.trim().toLowerCase();
    setSelectionLocale(new Set(query ? valeurs.filter((v) => v.toLowerCase().startsWith(query)) : valeurs));
  }

  function toggleValeur(v: string) {
    setSelectionLocale((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  // Case unique « Tout sélectionner » : agit sur les valeurs affichées (après recherche).
  const nbAffichesCoches = valeursFiltrees.filter((v) => selectionLocale.has(v)).length;
  const toutCoche = valeursFiltrees.length > 0 && nbAffichesCoches === valeursFiltrees.length;
  useEffect(() => {
    if (caseToutRef.current) caseToutRef.current.indeterminate = nbAffichesCoches > 0 && !toutCoche;
  }, [nbAffichesCoches, toutCoche]);

  function basculerTout() {
    setSelectionLocale((prev) => {
      const next = new Set(prev);
      for (const v of valeursFiltrees) {
        if (toutCoche) next.delete(v);
        else next.add(v);
      }
      return next;
    });
  }

  const valeursCondition = useMemo(
    () => (saisieCondition.trim() ? valeurs.filter((v) => correspond(v, typeCondition, saisieCondition)) : valeurs),
    [valeurs, typeCondition, saisieCondition],
  );

  const specialeActive = onglet === "condition" && typeCondition === "speciale" && conditionSpeciale !== undefined;

  function appliquer() {
    if (specialeActive) {
      conditionSpeciale!.onApply(choixSpecial);
      onApply(null, triLocal);
      onClose();
      return;
    }
    conditionSpeciale?.onApply(null);
    const choix = onglet === "condition" ? new Set(valeursCondition) : selectionLocale;
    onApply(choix.size === valeurs.length ? null : choix, triLocal);
    onClose();
  }

  function reinitialiser() {
    conditionSpeciale?.onApply(null);
    onApply(null, null);
    onClose();
  }

  return createPortal(
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "SELECT") {
          e.preventDefault();
          appliquer();
        }
      }}
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        width: LARGEUR,
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        boxShadow: "var(--shadow-lg)",
        zIndex: 1000,
        fontSize: 13,
        color: "var(--text)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* En-tête : titre, Réinitialiser, poignée de déplacement. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px 8px" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)" }}>FILTRE COLONNE</span>
        <button onClick={reinitialiser} style={{ ...lienStyle, marginLeft: "auto" }} title="Retirer le filtre et le tri de cette colonne">
          Réinitialiser
        </button>
        <span
          title="Déplacer"
          onPointerDown={(e) => {
            glisser.current = { dx: e.clientX - position.x, dy: e.clientY - position.y };
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!glisser.current) return;
            setPosition({
              x: Math.max(0, Math.min(e.clientX - glisser.current.dx, window.innerWidth - LARGEUR)),
              y: Math.max(0, Math.min(e.clientY - glisser.current.dy, window.innerHeight - 60)),
            });
          }}
          onPointerUp={() => (glisser.current = null)}
          style={{ cursor: "grab", color: "var(--text-faint)", display: "inline-flex", padding: 2, touchAction: "none" }}
        >
          <IconePoignee />
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, padding: "0 14px 12px", borderBottom: "1px solid var(--border)" }}>
        {(["asc", "desc"] as const).map((sens) => (
          <button
            key={sens}
            onClick={() => setTriLocal((t) => (t === sens ? null : sens))}
            style={{
              ...pilluleStyle,
              borderColor: triLocal === sens ? "var(--accent)" : "var(--border-strong)",
              background: triLocal === sens ? "var(--accent-soft)" : "var(--bg-panel)",
              color: triLocal === sens ? "var(--accent)" : "var(--text)",
              fontWeight: triLocal === sens ? 600 : 400,
            }}
          >
            {sens === "asc" ? "Trier croissant" : "Trier décroissant"}
          </button>
        ))}
      </div>

      <div style={{ padding: "12px 14px 0" }}>
        {/* Mini-onglets Valeurs / Condition. */}
        <div style={{ display: "flex", gap: 2, padding: 3, background: "var(--bg-panel-alt)", borderRadius: 8 }}>
          {(["valeurs", "condition"] as const).map((o) => (
            <button
              key={o}
              onClick={() => setOnglet(o)}
              style={{
                flex: 1,
                padding: "6px 0",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 12.5,
                fontWeight: onglet === o ? 600 : 500,
                background: onglet === o ? "var(--bg-panel)" : "transparent",
                color: onglet === o ? "var(--text)" : "var(--text-muted)",
                boxShadow: onglet === o ? "var(--shadow-sm)" : undefined,
              }}
            >
              {o === "valeurs" ? "Valeurs" : "Condition"}
            </button>
          ))}
        </div>
      </div>

      {onglet === "valeurs" ? (
        <div style={{ padding: "12px 14px 0", display: "flex", flexDirection: "column", gap: 10 }}>
          <input autoFocus value={recherche} onChange={(e) => changerRecherche(e.target.value)} placeholder="Rechercher une valeur" style={champStyle} />
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
            <input ref={caseToutRef} type="checkbox" checked={toutCoche} onChange={basculerTout} />
            Tout sélectionner
          </label>
          <div
            style={{
              maxHeight: 180,
              overflowY: "auto",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 4,
            }}
          >
            {valeursFiltrees.length === 0 ? (
              <div style={{ padding: "8px 10px", color: "var(--text-muted)", fontSize: 12.5 }}>Aucune valeur</div>
            ) : (
              valeursFiltrees.map((v) => (
                <label
                  key={v}
                  className="ligne-filtre-valeur"
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", cursor: "pointer", borderRadius: 6, fontSize: 13 }}
                >
                  <input type="checkbox" checked={selectionLocale.has(v)} onChange={() => toggleValeur(v)} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v || "(vide)"}</span>
                </label>
              ))
            )}
          </div>
        </div>
      ) : (
        <div style={{ padding: "12px 14px 0", display: "flex", flexDirection: "column", gap: 10 }}>
          <select value={typeCondition} onChange={(e) => setTypeCondition(e.target.value as TypeCondition)} style={champStyle}>
            {CONDITIONS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
            {conditionSpeciale && <option value="speciale">{conditionSpeciale.libelle}</option>}
          </select>
          {specialeActive ? (
            <select value={choixSpecial} onChange={(e) => setChoixSpecial(e.target.value)} style={champStyle}>
              {conditionSpeciale!.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input autoFocus value={saisieCondition} onChange={(e) => setSaisieCondition(e.target.value)} placeholder="Valeur" style={champStyle} />
          )}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          margin: "14px 0 0",
          padding: "12px 14px",
          borderTop: "1px solid var(--border)",
        }}
      >
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {onglet === "valeurs"
            ? `${selectionLocale.size} valeur(s) sélectionnée(s)`
            : specialeActive
              ? "Le filtre s'applique sur validation"
              : saisieCondition.trim()
              ? `${valeursCondition.length} valeur(s) correspondante(s)`
              : "Le filtre s'applique sur validation"}
        </span>
        <button className="btn btn-primary btn-sm" onClick={appliquer} style={{ padding: "7px 16px", borderRadius: 8 }}>
          Appliquer
        </button>
      </div>
    </div>,
    document.body,
  );
}

function IconePoignee() {
  return (
    <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
      {[2, 7, 12].map((y) =>
        [3, 9].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" fill="currentColor" />),
      )}
    </svg>
  );
}

const lienStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  fontSize: 12,
  color: "var(--text-muted)",
};

const pilluleStyle: React.CSSProperties = {
  padding: "5px 12px",
  border: "1px solid var(--border-strong)",
  borderRadius: 999,
  cursor: "pointer",
  fontSize: 12.5,
};

const champStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  fontSize: 13,
  background: "var(--bg-panel)",
  color: "var(--text)",
};
