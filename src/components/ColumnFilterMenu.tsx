import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  valeurs: string[]; // valeurs distinctes présentes dans la colonne, déjà formatées pour affichage
  selection: Set<string> | null; // null = pas de filtre actif (tout affiché)
  onApply: (selection: Set<string> | null, tri: "asc" | "desc" | null) => void;
  triActif: "asc" | "desc" | null;
  onClose: () => void;
  ancre: HTMLElement; // élément déclencheur, sert à positionner le menu (portail hors du tableau)
  estDate?: boolean; // libellés de tri adaptés (plus ancien/récent) au lieu de A à Z / Z à A
}

const HAUTEUR_MAX_MENU = 420;

export default function ColumnFilterMenu({ valeurs, selection, onApply, triActif, onClose, ancre, estDate = false }: Props) {
  const [recherche, setRecherche] = useState("");
  // État local, non appliqué au tableau tant que l'utilisateur n'a pas cliqué sur OK.
  const [selectionLocale, setSelectionLocale] = useState<Set<string>>(() => new Set(selection ?? valeurs));
  const [triLocal, setTriLocal] = useState<"asc" | "desc" | null>(triActif);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) && !ancre.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [onClose, ancre]);

  const valeursFiltrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return valeurs;
    return valeurs.filter((v) => v.toLowerCase().includes(q));
  }, [valeurs, recherche]);

  function changerRecherche(q: string) {
    setRecherche(q);
    // Au fur et à mesure de la frappe, la sélection se recale sur les valeurs qui correspondent
    // au filtre courant — sans ça, taper une recherche ne fait que masquer visuellement les
    // autres valeurs sans les désélectionner, et valider applique quand même "tout" en arrière-
    // plan (il fallait cliquer "Tout désélectionner" en plus pour ne garder que le résultat).
    const query = q.trim().toLowerCase();
    if (!query) {
      setSelectionLocale(new Set(valeurs));
      return;
    }
    setSelectionLocale(new Set(valeurs.filter((v) => v.toLowerCase().includes(query))));
  }

  function toggleValeur(v: string) {
    setSelectionLocale((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  function appliquer() {
    onApply(selectionLocale.size === valeurs.length ? null : selectionLocale, triLocal);
    onClose();
  }

  const rect = ancre.getBoundingClientRect();
  // Bascule le menu au-dessus de l'ancre s'il n'y a pas assez de place en dessous, pour qu'il
  // reste entièrement visible sur la hauteur de la fenêtre plutôt que d'être coupé.
  const placerAuDessus = rect.bottom + HAUTEUR_MAX_MENU > window.innerHeight && rect.top > HAUTEUR_MAX_MENU;
  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(rect.left, window.innerWidth - 260),
    ...(placerAuDessus ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
  };

  return createPortal(
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      style={{
        ...style,
        background: "var(--bg-panel)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow-lg)",
        width: 240,
        maxHeight: HAUTEUR_MAX_MENU,
        display: "flex",
        flexDirection: "column",
        zIndex: 1000,
        fontSize: 13,
        color: "var(--text)",
      }}
    >
      <div style={{ padding: "6px 4px", borderBottom: "1px solid var(--border)" }}>
        <button
          onClick={() => setTriLocal("asc")}
          style={{ ...menuItemStyle, color: triLocal === "asc" ? "var(--accent)" : undefined }}
        >
          {estDate ? "▲ Du plus ancien au plus récent" : "▲ Trier de A à Z"}
        </button>
        <button
          onClick={() => setTriLocal("desc")}
          style={{ ...menuItemStyle, color: triLocal === "desc" ? "var(--accent)" : undefined }}
        >
          {estDate ? "▼ Du plus récent au plus ancien" : "▼ Trier de Z à A"}
        </button>
      </div>

      <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
        <input
          autoFocus
          value={recherche}
          onChange={(e) => changerRecherche(e.target.value)}
          placeholder="Rechercher…"
          style={{
            width: "100%",
            padding: "5px 8px",
            border: "1px solid var(--border-strong)",
            borderRadius: 4,
            fontSize: 12.5,
          }}
        />
      </div>

      <div style={{ padding: "4px 10px", display: "flex", gap: 10, borderBottom: "1px solid var(--border)" }}>
        <button onClick={() => setSelectionLocale(new Set(valeurs))} style={linkStyle}>
          Tout sélectionner
        </button>
        <button onClick={() => setSelectionLocale(new Set())} style={linkStyle}>
          Tout effacer
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 4px" }}>
        {valeursFiltrees.length === 0 ? (
          <div style={{ padding: "8px 10px", color: "var(--text-muted)", fontSize: 12.5 }}>Aucune valeur</div>
        ) : (
          valeursFiltrees.map((v) => (
            <label
              key={v}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 8px",
                cursor: "pointer",
                borderRadius: 4,
                fontSize: 12.5,
              }}
            >
              <input type="checkbox" checked={selectionLocale.has(v)} onChange={() => toggleValeur(v)} />
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {v || "(vide)"}
              </span>
            </label>
          ))
        )}
      </div>

      <div style={{ padding: "8px 10px", display: "flex", justifyContent: "flex-end", gap: 6, borderTop: "1px solid var(--border)" }}>
        <button className="btn btn-sm" onClick={onClose}>
          Annuler
        </button>
        <button className="btn btn-sm btn-primary" onClick={appliquer}>
          OK
        </button>
      </div>
    </div>,
    document.body
  );
}

const menuItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "6px 10px",
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: 12.5,
  borderRadius: 4,
};

const linkStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  fontSize: 11.5,
  color: "var(--accent)",
};
