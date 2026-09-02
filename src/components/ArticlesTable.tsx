import { useEffect, useMemo, useRef, useState } from "react";
import { volumeUnitaireM3 } from "../domain/calculs";
import type { Article, Caisse, NewArticle } from "../domain/types";
import ColumnFilterMenu from "./ColumnFilterMenu";

interface Props {
  affaireId: number;
  articles: Article[];
  caisses: Caisse[];
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: () => void;
  onUpdate: (id: number, article: NewArticle) => Promise<void>;
  onStartDrag?: (articleId: number, e: React.PointerEvent) => void;
  readOnly?: boolean;
}

type Champ = "ar" | "reference" | "designation" | "dim1_mm" | "dim2_mm" | "dim3_mm" | "poids_unitaire_kg" | "quantite";
type ColonneTriable = Champ | "volume" | "caisse";
type Tri = { colonne: ColonneTriable; sens: "asc" | "desc" };

function chargerTri(affaireId: number): Tri | null {
  try {
    const brut = localStorage.getItem(`caisses:tri:${affaireId}`);
    return brut ? (JSON.parse(brut) as Tri) : null;
  } catch {
    return null;
  }
}

function sauvegarderTri(affaireId: number, tri: Tri | null) {
  const cle = `caisses:tri:${affaireId}`;
  if (tri) localStorage.setItem(cle, JSON.stringify(tri));
  else localStorage.removeItem(cle);
}

// null = pas de filtre actif sur cette colonne (tout affiché) ; sinon ensemble des valeurs
// sélectionnées (au format texte affiché).
type Filtres = Partial<Record<ColonneTriable, string[]>>;

function chargerFiltres(affaireId: number): Filtres {
  try {
    const brut = localStorage.getItem(`caisses:filtresArticles:${affaireId}`);
    return brut ? (JSON.parse(brut) as Filtres) : {};
  } catch {
    return {};
  }
}

function sauvegarderFiltres(affaireId: number, filtres: Filtres) {
  const cle = `caisses:filtresArticles:${affaireId}`;
  if (Object.keys(filtres).length === 0) localStorage.removeItem(cle);
  else localStorage.setItem(cle, JSON.stringify(filtres));
}

const CHAMPS_TEXTE: ReadonlySet<Champ> = new Set(["ar", "reference", "designation"]);
const CHAMPS_EDITABLES: ReadonlySet<Champ> = new Set(["dim1_mm", "dim2_mm", "dim3_mm", "poids_unitaire_kg"]);

function toNewArticle(a: Article): NewArticle {
  return {
    ar: a.ar,
    reference: a.reference,
    designation: a.designation,
    dim1_mm: a.dim1_mm,
    dim2_mm: a.dim2_mm,
    dim3_mm: a.dim3_mm,
    poids_unitaire_kg: a.poids_unitaire_kg,
    quantite: a.quantite,
  };
}

export default function ArticlesTable({
  affaireId,
  articles,
  caisses,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onUpdate,
  onStartDrag,
  readOnly,
}: Props) {
  const [cellEnEdition, setCellEnEdition] = useState<{ id: number; champ: Champ } | null>(null);
  const [tri, setTri] = useState<Tri | null>(() => chargerTri(affaireId));
  const [filtres, setFiltres] = useState<Filtres>(() => chargerFiltres(affaireId));
  const [menuOuvert, setMenuOuvert] = useState<ColonneTriable | null>(null);
  const boutonsFiltreRef = useRef<Partial<Record<ColonneTriable, HTMLButtonElement>>>({});

  const caisseById = useMemo(() => new Map(caisses.map((c) => [c.id, c])), [caisses]);
  const caisseName = (id: number | null) => (id === null ? "—" : caisseById.get(id)?.nom ?? "?");

  function valeurTexte(a: Article, colonne: ColonneTriable): string {
    switch (colonne) {
      case "volume":
        return volumeUnitaireM3(a).toFixed(4);
      case "caisse":
        return caisseName(a.caisse_id);
      default:
        return String(a[colonne]);
    }
  }

  // Pour chaque colonne de dimension, l'id du premier article portant la valeur la plus haute
  // *de toute l'affaire* — pour surligner la case correspondant au maximum de chaque dimension.
  // (Le max par caisse est mis en évidence ailleurs, dans les CaisseCard.)
  const idArticleMaxParChamp = useMemo(() => {
    const champs: ("dim1_mm" | "dim2_mm" | "dim3_mm")[] = ["dim1_mm", "dim2_mm", "dim3_mm"];
    const result: Partial<Record<Champ, number>> = {};
    for (const champ of champs) {
      let meilleur: Article | null = null;
      for (const a of articles) {
        if (!meilleur || a[champ] > meilleur[champ]) meilleur = a;
      }
      if (meilleur && meilleur[champ] > 0) result[champ] = meilleur.id;
    }
    return result;
  }, [articles]);

  const articlesFiltres = useMemo(() => {
    const colonnesFiltrees = Object.entries(filtres) as [ColonneTriable, string[]][];
    if (colonnesFiltrees.length === 0) return articles;
    return articles.filter((a) => colonnesFiltrees.every(([colonne, valeurs]) => valeurs.includes(valeurTexte(a, colonne))));
  }, [articles, filtres, caisseById]);

  const articlesTries = useMemo(() => {
    if (!tri) return articlesFiltres;
    const facteur = tri.sens === "asc" ? 1 : -1;
    const valeur = (a: Article): string | number => {
      switch (tri.colonne) {
        case "volume":
          return volumeUnitaireM3(a);
        case "caisse":
          return caisseName(a.caisse_id).toLowerCase();
        default:
          return CHAMPS_TEXTE.has(tri.colonne as Champ)
            ? String(a[tri.colonne as Champ]).toLowerCase()
            : (a[tri.colonne as Champ] as number);
      }
    };
    return [...articlesFiltres].sort((a, b) => {
      const va = valeur(a);
      const vb = valeur(b);
      if (va < vb) return -1 * facteur;
      if (va > vb) return 1 * facteur;
      return 0;
    });
  }, [articlesFiltres, tri, caisseById]);

  function toggleTri(colonne: ColonneTriable) {
    setTri((prev) => {
      const next: Tri | null =
        !prev || prev.colonne !== colonne ? { colonne, sens: "asc" } : prev.sens === "asc" ? { colonne, sens: "desc" } : null;
      sauvegarderTri(affaireId, next);
      return next;
    });
  }

  function appliquerFiltreColonne(colonne: ColonneTriable, selection: Set<string> | null, sens: "asc" | "desc" | null) {
    setFiltres((prev) => {
      const next = { ...prev };
      if (selection === null) delete next[colonne];
      else next[colonne] = [...selection];
      sauvegarderFiltres(affaireId, next);
      return next;
    });
    if (sens) {
      const nextTri: Tri = { colonne, sens };
      setTri(nextTri);
      sauvegarderTri(affaireId, nextTri);
    } else if (tri?.colonne === colonne) {
      setTri(null);
      sauvegarderTri(affaireId, null);
    }
  }

  if (articles.length === 0) {
    return (
      <p style={{ color: "var(--text-muted)", padding: "20px 0" }}>
        Aucun article. Collez des lignes depuis Excel ou ajoutez-en manuellement.
      </p>
    );
  }

  async function sauvegarderChamp(article: Article, champ: Champ, valeurBrute: string) {
    const base = toNewArticle(article);
    const estNombre = !CHAMPS_TEXTE.has(champ);
    const updated: NewArticle = estNombre
      ? { ...base, [champ]: Number(valeurBrute.replace(",", ".")) || 0 }
      : { ...base, [champ]: valeurBrute };
    setCellEnEdition(null);
    if (JSON.stringify(updated) === JSON.stringify(base)) return;
    await onUpdate(article.id, updated);
  }

  function cell(article: Article, champ: Champ, valeurAffichee: React.ReactNode, align: "left" | "right" = "left") {
    const enEdition = cellEnEdition?.id === article.id && cellEnEdition.champ === champ;
    const estNombre = !CHAMPS_TEXTE.has(champ);
    const editable = !readOnly && CHAMPS_EDITABLES.has(champ);
    const estMax = idArticleMaxParChamp[champ] === article.id;
    return (
      <td
        style={{
          ...tdStyle,
          textAlign: align,
          cursor: editable ? "text" : "default",
          padding: enEdition ? 2 : tdStyle.padding,
          fontWeight: estMax ? 800 : undefined,
        }}
        className={estNombre ? "mono" : undefined}
        title={estMax ? "Dimension maximale de l'affaire pour cette colonne" : undefined}
        onClick={() => editable && !enEdition && setCellEnEdition({ id: article.id, champ })}
      >
        {enEdition ? (
          <EditableCellInput
            type={estNombre ? "number" : "text"}
            defaultValue={String(article[champ])}
            align={align}
            onCommit={(v) => sauvegarderChamp(article, champ, v)}
            onCancel={() => setCellEnEdition(null)}
          />
        ) : estMax ? (
          <span
            style={{
              display: "inline-block",
              padding: "1px 6px",
              borderRadius: 4,
              background: "var(--accent)",
              color: "#fff",
              fontWeight: 800,
            }}
          >
            {valeurAffichee}
          </span>
        ) : (
          valeurAffichee
        )}
      </td>
    );
  }

  function thTriable(colonne: ColonneTriable, label: string, align: "left" | "right" = "left") {
    const actif = tri?.colonne === colonne;
    const filtreActif = filtres[colonne] !== undefined;
    const valeursDistinctes = [...new Set(articles.map((a) => valeurTexte(a, colonne)))].sort((a, b) => a.localeCompare(b));
    const selection = filtres[colonne] ? new Set(filtres[colonne]) : null;
    return (
      <th style={{ ...thStyle, textAlign: align, background: filtreActif ? "var(--filtre-actif-bg)" : thStyle.background }}>
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: align === "right" ? "flex-end" : "flex-start", gap: 4 }}>
          <span style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleTri(colonne)}>
            {label}
            <span style={{ marginLeft: 4, opacity: actif ? 1 : 0.25 }}>{actif ? (tri!.sens === "asc" ? "▲" : "▼") : "▲"}</span>
          </span>
          <button
            ref={(el) => {
              if (el) boutonsFiltreRef.current[colonne] = el;
            }}
            onClick={() => setMenuOuvert((prev) => (prev === colonne ? null : colonne))}
            title="Filtrer"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px 4px",
              fontSize: 11,
              color: filtreActif ? "var(--accent)" : "var(--text-faint)",
              position: "relative",
            }}
          >
            ▾
            {filtreActif && (
              <span
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "var(--accent)",
                }}
              />
            )}
          </button>
        </div>
        {menuOuvert === colonne && boutonsFiltreRef.current[colonne] && (
          <ColumnFilterMenu
            valeurs={valeursDistinctes}
            selection={selection}
            onApply={(s, sens) => appliquerFiltreColonne(colonne, s, sens)}
            triActif={actif ? tri!.sens : null}
            onClose={() => setMenuOuvert(null)}
            ancre={boutonsFiltreRef.current[colonne]!}
          />
        )}
      </th>
    );
  }

  const yATrouFiltre = Object.keys(filtres).length > 0;

  return (
    <table style={{ width: "100%", fontSize: 13, borderCollapse: "separate", borderSpacing: 0 }}>
      <thead>
        <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
          {onStartDrag && <th style={{ ...thStyle, width: 20 }}></th>}
          <th style={thStyle}>
            <input
              type="checkbox"
              checked={articles.length > 0 && selectedIds.size === articles.length}
              onChange={onToggleSelectAll}
            />
          </th>
          {thTriable("ar", "AR")}
          {thTriable("reference", "Réf. fourn.")}
          {thTriable("designation", "Désignation")}
          {thTriable("dim1_mm", "Dim1 (mm)", "right")}
          {thTriable("dim2_mm", "Dim2 (mm)", "right")}
          {thTriable("dim3_mm", "Dim3 (mm)", "right")}
          {thTriable("poids_unitaire_kg", "Poids u. (kg)", "right")}
          {thTriable("quantite", "Qté", "right")}
          {thTriable("volume", "Vol. u. (m³)", "right")}
          {thTriable("caisse", "Caisse")}
        </tr>
      </thead>
      <tbody>
        {articlesTries.length === 0 ? (
          <tr>
            <td
              colSpan={(onStartDrag ? 1 : 0) + 10}
              style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", padding: "20px 8px" }}
            >
              {yATrouFiltre ? "Aucun article ne correspond aux filtres actifs." : "Aucun article."}
            </td>
          </tr>
        ) : (
          articlesTries.map((a) => {
            const caisseAssignee = a.caisse_id !== null ? caisseById.get(a.caisse_id) : undefined;
            return (
              <tr
                key={a.id}
                className="article-row"
                style={{
                  background: selectedIds.has(a.id)
                    ? "var(--accent-soft-strong)"
                    : caisseAssignee
                      ? caisseAssignee.couleur
                      : undefined,
                }}
              >
                {onStartDrag && !readOnly && (
                  <td
                    onPointerDown={(e) => {
                      e.preventDefault();
                      onStartDrag(a.id, e);
                    }}
                    style={{ ...tdStyle, cursor: "grab", color: "var(--text-faint)", textAlign: "center", userSelect: "none", touchAction: "none", fontSize: 15 }}
                    title="Glisser vers une caisse pour assigner"
                  >
                    ⠿
                  </td>
                )}
                <td style={tdStyle}>
                  <input type="checkbox" checked={selectedIds.has(a.id)} onChange={() => onToggleSelect(a.id)} />
                </td>
                {cell(a, "ar", a.ar)}
                {cell(a, "reference", a.reference)}
                {cell(a, "designation", a.designation)}
                {cell(a, "dim1_mm", a.dim1_mm, "right")}
                {cell(a, "dim2_mm", a.dim2_mm, "right")}
                {cell(a, "dim3_mm", a.dim3_mm, "right")}
                {cell(a, "poids_unitaire_kg", a.poids_unitaire_kg, "right")}
                {cell(a, "quantite", a.quantite, "right")}
                <td style={{ ...tdStyle, textAlign: "right" }} className="mono">
                  {volumeUnitaireM3(a).toFixed(4)}
                </td>
                <td style={tdStyle}>
                  {caisseAssignee ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--text)",
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: caisseAssignee.couleur, border: "1px solid rgba(0,0,0,0.15)" }} />
                      {caisseAssignee.nom}
                    </span>
                  ) : (
                    <span style={{ color: "var(--text-faint)" }}>—</span>
                  )}
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}

function EditableCellInput({
  type,
  defaultValue,
  align,
  onCommit,
  onCancel,
}: {
  type: "text" | "number";
  defaultValue: string;
  align: "left" | "right";
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const committed = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  function commitOnce() {
    if (committed.current) return;
    committed.current = true;
    onCommit(ref.current?.value ?? defaultValue);
  }

  return (
    <input
      ref={ref}
      type={type}
      defaultValue={defaultValue}
      onBlur={commitOnce}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitOnce();
        } else if (e.key === "Escape") {
          e.preventDefault();
          committed.current = true;
          onCancel();
        }
      }}
      style={{
        width: "100%",
        textAlign: align,
        padding: "3px 6px",
        border: "1px solid var(--accent)",
        borderRadius: 4,
        font: "inherit",
      }}
    />
  );
}

const thStyle: React.CSSProperties = {
  padding: "9px 8px",
  borderRight: "1px solid var(--row-border-color)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  position: "sticky",
  top: 0,
  background: "var(--bg-panel)",
  // Trait de séparation posé en box-shadow (rendu par-dessus, pas de couture sous-pixel comme
  // avec un border-bottom au bord d'un élément sticky, où l'on voyait défiler un liseré).
  boxShadow: "0 2px 0 var(--row-border-color)",
  zIndex: 3,
};
const tdStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid var(--row-border-color)",
  borderRight: "1px solid var(--row-border-color)",
};
