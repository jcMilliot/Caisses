import { useEffect, useMemo, useRef, useState } from "react";
import { volumeUnitaireM3 } from "../domain/calculs";
import type { Article, Caisse, NewArticle } from "../domain/types";

interface Props {
  affaireId: number;
  articles: Article[];
  caisses: Caisse[];
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: () => void;
  onUpdate: (id: number, article: NewArticle) => Promise<void>;
  onStartDrag?: (articleId: number, e: React.PointerEvent) => void;
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

const CHAMPS_TEXTE: ReadonlySet<Champ> = new Set(["ar", "reference", "designation"]);

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
}: Props) {
  const [cellEnEdition, setCellEnEdition] = useState<{ id: number; champ: Champ } | null>(null);
  const [tri, setTri] = useState<Tri | null>(() => chargerTri(affaireId));

  const caisseById = useMemo(() => new Map(caisses.map((c) => [c.id, c])), [caisses]);
  const caisseName = (id: number | null) => (id === null ? "—" : caisseById.get(id)?.nom ?? "?");

  const articlesTries = useMemo(() => {
    if (!tri) return articles;
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
    return [...articles].sort((a, b) => {
      const va = valeur(a);
      const vb = valeur(b);
      if (va < vb) return -1 * facteur;
      if (va > vb) return 1 * facteur;
      return 0;
    });
  }, [articles, tri, caisseById]);

  function toggleTri(colonne: ColonneTriable) {
    setTri((prev) => {
      const next: Tri | null =
        !prev || prev.colonne !== colonne ? { colonne, sens: "asc" } : prev.sens === "asc" ? { colonne, sens: "desc" } : null;
      sauvegarderTri(affaireId, next);
      return next;
    });
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
    return (
      <td
        style={{ ...tdStyle, textAlign: align, cursor: "text", padding: enEdition ? 2 : tdStyle.padding }}
        className={estNombre ? "mono" : undefined}
        onClick={() => !enEdition && setCellEnEdition({ id: article.id, champ })}
      >
        {enEdition ? (
          <EditableCellInput
            type={estNombre ? "number" : "text"}
            defaultValue={String(article[champ])}
            align={align}
            onCommit={(v) => sauvegarderChamp(article, champ, v)}
            onCancel={() => setCellEnEdition(null)}
          />
        ) : (
          valeurAffichee
        )}
      </td>
    );
  }

  function thTriable(colonne: ColonneTriable, label: string, align: "left" | "right" = "left") {
    const actif = tri?.colonne === colonne;
    return (
      <th
        style={{ ...thStyle, textAlign: align, cursor: "pointer", userSelect: "none", color: actif ? "var(--accent)" : undefined }}
        onClick={() => toggleTri(colonne)}
      >
        {label}
        <span style={{ marginLeft: 4, opacity: actif ? 1 : 0.25 }}>
          {actif ? (tri!.sens === "asc" ? "▲" : "▼") : "▲"}
        </span>
      </th>
    );
  }

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
          {thTriable("dim1_mm", "Dim1", "right")}
          {thTriable("dim2_mm", "Dim2", "right")}
          {thTriable("dim3_mm", "Dim3", "right")}
          {thTriable("poids_unitaire_kg", "Poids u. (kg)", "right")}
          {thTriable("quantite", "Qté", "right")}
          {thTriable("volume", "Vol. u. (m³)", "right")}
          {thTriable("caisse", "Caisse")}
        </tr>
      </thead>
      <tbody>
        {articlesTries.map((a) => {
          const caisseAssignee = a.caisse_id !== null ? caisseById.get(a.caisse_id) : undefined;
          return (
            <tr
              key={a.id}
              className="article-row"
              style={{
                background: selectedIds.has(a.id)
                  ? "var(--accent-soft-strong)"
                  : caisseAssignee
                    ? `color-mix(in srgb, ${caisseAssignee.couleur} 55%, white)`
                    : undefined,
              }}
            >
              {onStartDrag && (
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
        })}
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
  borderBottom: "2px solid var(--border)",
  borderRight: "1px solid var(--border)",
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
  padding: "6px 8px",
  borderBottom: "1px solid var(--border)",
  borderRight: "1px solid var(--border)",
};
