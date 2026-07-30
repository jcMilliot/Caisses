import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Demande } from "../domain/types";
import { dateIsoVersAffichage } from "../domain/dates";
import { necessiteNimp15, estCaisse4C, AVERTISSEMENT_MOUSSE_4C } from "../domain/demandeOptions";
import ColumnFilterMenu from "./ColumnFilterMenu";
import TableOptionsMenu from "./TableOptionsMenu";

interface Props {
  demandes: Demande[];
  onEdit: (id: number, patch: Partial<Demande>) => void;
  onDelete: (id: number, affaire: string) => void;
  onValider: (id: number, validee: boolean) => void;
  onSimulerAffaire: (demande: Demande) => void;
  readOnly?: boolean;
}

type Champ =
  | "ok_pour_passer_cde"
  | "affaire"
  | "type_envoi_caisse"
  | "type_ouverture"
  | "stock"
  | "longueur_mm"
  | "largeur_mm"
  | "hauteur_mm"
  | "quantite"
  | "date_picking"
  | "date_demandee_s2c"
  | "moteurs"
  | "module_lineaire"
  | "terminaux"
  | "traitement"
  | "informations_supp"
  | "cde_passee_affaire"
  | "cde_passee_achat_stock"
  | "observations";

type Tri = { colonne: Champ; sens: "asc" | "desc" };

const CLE_TRI = "caisses:tri:demandes";
const CLE_FILTRES = "caisses:filtres:demandes";

function chargerTri(): Tri | null {
  try {
    const brut = localStorage.getItem(CLE_TRI);
    return brut ? (JSON.parse(brut) as Tri) : null;
  } catch {
    return null;
  }
}

function sauvegarderTri(tri: Tri | null) {
  if (tri) localStorage.setItem(CLE_TRI, JSON.stringify(tri));
  else localStorage.removeItem(CLE_TRI);
}

// null = pas de filtre actif sur cette colonne (tout affiché) ; sinon ensemble des valeurs
// sélectionnées (au format texte affiché, ex. "Oui"/"" pour les booléens).
type Filtres = Partial<Record<Champ, string[]>>;

function chargerFiltres(): Filtres {
  try {
    const brut = localStorage.getItem(CLE_FILTRES);
    return brut ? (JSON.parse(brut) as Filtres) : {};
  } catch {
    return {};
  }
}

function sauvegarderFiltres(filtres: Filtres) {
  if (Object.keys(filtres).length === 0) localStorage.removeItem(CLE_FILTRES);
  else localStorage.setItem(CLE_FILTRES, JSON.stringify(filtres));
}

const CLE_COLONNES_VISIBLES = "caisses:colonnesVisibles:demandes";
const CLE_COMPACT = "caisses:compact:demandes";

function chargerColonnesVisibles(toutesLesColonnes: Champ[]): Set<Champ> {
  try {
    const brut = localStorage.getItem(CLE_COLONNES_VISIBLES);
    if (!brut) return new Set(toutesLesColonnes);
    return new Set(JSON.parse(brut) as Champ[]);
  } catch {
    return new Set(toutesLesColonnes);
  }
}

function sauvegarderColonnesVisibles(visibles: Set<Champ>) {
  localStorage.setItem(CLE_COLONNES_VISIBLES, JSON.stringify([...visibles]));
}

function chargerCompact(): boolean {
  return localStorage.getItem(CLE_COMPACT) === "1";
}

function sauvegarderCompact(compact: boolean) {
  if (compact) localStorage.setItem(CLE_COMPACT, "1");
  else localStorage.removeItem(CLE_COMPACT);
}

const CLE_MASQUER_VALIDEES = "caisses:masquerValidees:demandes";

function chargerMasquerValidees(): boolean {
  return localStorage.getItem(CLE_MASQUER_VALIDEES) === "1";
}

function sauvegarderMasquerValidees(masquer: boolean) {
  if (masquer) localStorage.setItem(CLE_MASQUER_VALIDEES, "1");
  else localStorage.removeItem(CLE_MASQUER_VALIDEES);
}

function estDemandeValidee(d: Demande): boolean {
  const obs = d.observations.trim().toLowerCase();
  return d.validee || obs.includes("livrée") || obs.includes("livree");
}

const CLE_LARGEURS = "caisses:largeursColonnes:demandes";
const LARGEUR_MIN = 40;

function chargerLargeurs(): Partial<Record<Champ, number>> {
  try {
    const brut = localStorage.getItem(CLE_LARGEURS);
    return brut ? (JSON.parse(brut) as Partial<Record<Champ, number>>) : {};
  } catch {
    return {};
  }
}

function sauvegarderLargeurs(largeurs: Partial<Record<Champ, number>>) {
  localStorage.setItem(CLE_LARGEURS, JSON.stringify(largeurs));
}

const CHAMPS_BOOL: ReadonlySet<Champ> = new Set(["ok_pour_passer_cde", "cde_passee_affaire", "cde_passee_achat_stock"]);
const CHAMPS_NOMBRE: ReadonlySet<Champ> = new Set(["longueur_mm", "largeur_mm", "hauteur_mm", "quantite"]);
const CHAMPS_DATE: ReadonlySet<Champ> = new Set(["date_picking", "date_demandee_s2c"]);

function valeurTexte(d: Demande, champ: Champ): string {
  const v = d[champ];
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  if (CHAMPS_DATE.has(champ)) return dateIsoVersAffichage(String(v));
  return String(v);
}

const COLONNES: { champ: Champ; label: string; align?: "left" | "right" }[] = [
  { champ: "ok_pour_passer_cde", label: "Ok cde" },
  { champ: "affaire", label: "Affaire" },
  { champ: "type_envoi_caisse", label: "Type envoi caisse" },
  { champ: "type_ouverture", label: "Type ouverture" },
  { champ: "stock", label: "Stock" },
  { champ: "longueur_mm", label: "L", align: "right" },
  { champ: "largeur_mm", label: "l", align: "right" },
  { champ: "hauteur_mm", label: "H", align: "right" },
  { champ: "quantite", label: "Qté", align: "right" },
  { champ: "date_picking", label: "Date picking" },
  { champ: "date_demandee_s2c", label: "Date dem. S2C" },
  { champ: "moteurs", label: "Moteurs" },
  { champ: "module_lineaire", label: "Module linéaire" },
  { champ: "terminaux", label: "Terminaux" },
  { champ: "traitement", label: "Traitement" },
  { champ: "informations_supp", label: "Infos suppl." },
  { champ: "cde_passee_affaire", label: "Cde passée affaire" },
  { champ: "cde_passee_achat_stock", label: "Cde passée achat stock" },
  { champ: "observations", label: "Observations" },
];

const TOUTES_LES_COLONNES = COLONNES.map((c) => c.champ);

export default function DemandesTable({ demandes, onEdit, onDelete, onValider, onSimulerAffaire, readOnly }: Props) {
  const [cellEnEdition, setCellEnEdition] = useState<{ id: number; champ: Champ } | null>(null);
  const [tri, setTri] = useState<Tri | null>(() => chargerTri());
  const [filtres, setFiltres] = useState<Filtres>(() => chargerFiltres());
  const [menuOuvert, setMenuOuvert] = useState<Champ | null>(null);
  const [colonnesVisibles, setColonnesVisibles] = useState<Set<Champ>>(() => chargerColonnesVisibles(TOUTES_LES_COLONNES));
  const [compact, setCompact] = useState(() => chargerCompact());
  const [masquerValidees, setMasquerValidees] = useState(() => chargerMasquerValidees());
  const [menuContextuel, setMenuContextuel] = useState<{ demande: Demande; x: number; y: number; validee: boolean } | null>(null);
  const [largeurs, setLargeurs] = useState<Partial<Record<Champ, number>>>(() => chargerLargeurs());
  const boutonsFiltreRef = useRef<Partial<Record<Champ, HTMLButtonElement>>>({});
  const redimensionnement = useRef<{ champ: Champ; xDepart: number; largeurDepart: number } | null>(null);

  function commencerRedimensionnement(e: React.PointerEvent, champ: Champ, largeurActuelle: number) {
    e.preventDefault();
    e.stopPropagation();
    redimensionnement.current = { champ, xDepart: e.clientX, largeurDepart: largeurActuelle };

    function onMove(ev: PointerEvent) {
      if (!redimensionnement.current) return;
      const { champ, xDepart, largeurDepart } = redimensionnement.current;
      const nouvelle = Math.max(LARGEUR_MIN, largeurDepart + (ev.clientX - xDepart));
      setLargeurs((prev) => ({ ...prev, [champ]: nouvelle }));
    }
    function onUp() {
      redimensionnement.current = null;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      setLargeurs((prev) => {
        sauvegarderLargeurs(prev);
        return prev;
      });
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  function largeurColonne(champ: Champ): number {
    return largeurs[champ] ?? (compact ? 90 : 130);
  }

  useEffect(() => {
    if (!menuContextuel) return;
    function fermer() {
      setMenuContextuel(null);
    }
    document.addEventListener("click", fermer);
    return () => document.removeEventListener("click", fermer);
  }, [menuContextuel]);

  function changerColonnesVisibles(visibles: Set<Champ>) {
    setColonnesVisibles(visibles);
    sauvegarderColonnesVisibles(visibles);
  }

  function changerCompact(v: boolean) {
    setCompact(v);
    sauvegarderCompact(v);
  }

  function changerMasquerValidees(v: boolean) {
    setMasquerValidees(v);
    sauvegarderMasquerValidees(v);
  }

  const colonnesAffichees = COLONNES.filter((c) => colonnesVisibles.has(c.champ));

  const demandesVisibles = masquerValidees ? demandes.filter((d) => !estDemandeValidee(d)) : demandes;

  const demandesFiltrees = useMemo(() => {
    const colonnesFiltrees = Object.entries(filtres) as [Champ, string[]][];
    if (colonnesFiltrees.length === 0) return demandesVisibles;
    return demandesVisibles.filter((d) => colonnesFiltrees.every(([champ, valeurs]) => valeurs.includes(valeurTexte(d, champ))));
  }, [demandesVisibles, filtres]);

  const demandesTriees = useMemo(() => {
    if (!tri) return demandesFiltrees;
    const facteur = tri.sens === "asc" ? 1 : -1;
    const valeur = (d: Demande): string | number => {
      const v = d[tri.colonne];
      if (typeof v === "boolean") return v ? 1 : 0;
      if (typeof v === "number") return v;
      return String(v).toLowerCase();
    };
    return [...demandesFiltrees].sort((a, b) => {
      const va = valeur(a);
      const vb = valeur(b);
      if (va < vb) return -1 * facteur;
      if (va > vb) return 1 * facteur;
      return 0;
    });
  }, [demandesFiltrees, tri]);

  function appliquerFiltreColonne(champ: Champ, selection: Set<string> | null, sens: "asc" | "desc" | null) {
    setFiltres((prev) => {
      const next = { ...prev };
      if (selection === null) delete next[champ];
      else next[champ] = [...selection];
      sauvegarderFiltres(next);
      return next;
    });
    // Ne modifie le tri global que si l'utilisateur a choisi un sens pour cette colonne, ou
    // s'il retire le tri qui portait déjà dessus — sans ça, valider le filtre d'une colonne
    // non triée effacerait à tort le tri actif sur une autre colonne.
    if (sens) {
      const nextTri: Tri = { colonne: champ, sens };
      setTri(nextTri);
      sauvegarderTri(nextTri);
    } else if (tri?.colonne === champ) {
      setTri(null);
      sauvegarderTri(null);
    }
  }

  function sauvegarderChamp(demande: Demande, champ: Champ, valeurBrute: string) {
    setCellEnEdition(null);
    const valeur = CHAMPS_NOMBRE.has(champ) ? Number(valeurBrute.replace(",", ".")) || 0 : valeurBrute;
    if (demande[champ] === valeur) return;
    // Une caisse 4B/4C impose le traitement NIMP15 — pré-rempli seulement si le champ
    // Traitement est encore vide, pour ne pas écraser une saisie manuelle déjà faite.
    if (champ === "type_envoi_caisse" && necessiteNimp15(String(valeur)) && !demande.traitement.trim()) {
      onEdit(demande.id, { type_envoi_caisse: valeur as string, traitement: "NIMP15" });
      return;
    }
    onEdit(demande.id, { [champ]: valeur });
  }

  function toggleBool(demande: Demande, champ: "ok_pour_passer_cde" | "cde_passee_affaire" | "cde_passee_achat_stock") {
    onEdit(demande.id, { [champ]: !demande[champ] });
  }

  function cell(demande: Demande, champ: Champ, align: "left" | "right" = "left", td: React.CSSProperties = tdStyle) {
    if (CHAMPS_BOOL.has(champ)) {
      return (
        <td style={{ ...td, textAlign: "center" }}>
          <input
            type="checkbox"
            checked={demande[champ] as boolean}
            disabled={readOnly}
            onChange={() => toggleBool(demande, champ as "ok_pour_passer_cde" | "cde_passee_affaire" | "cde_passee_achat_stock")}
          />
        </td>
      );
    }
    const enEdition = cellEnEdition?.id === demande.id && cellEnEdition.champ === champ;
    const estNombre = CHAMPS_NOMBRE.has(champ);
    const estDate = CHAMPS_DATE.has(champ);
    const valeurBrute = demande[champ] as string | number;
    const valeurAffichee = estDate ? dateIsoVersAffichage(String(valeurBrute)) : valeurBrute;
    const largeur = largeurColonne(champ);
    const avertissementMousse = champ === "type_envoi_caisse" && estCaisse4C(demande.type_envoi_caisse) ? AVERTISSEMENT_MOUSSE_4C : undefined;
    return (
      <td
        style={{
          ...td,
          textAlign: align,
          cursor: readOnly ? "default" : "text",
          padding: enEdition ? 2 : td.padding,
          width: largeur,
          maxWidth: largeur,
          whiteSpace: "normal",
          wordBreak: "break-word",
          fontWeight: champ === "affaire" ? 700 : undefined,
        }}
        className={estNombre ? "mono" : undefined}
        title={avertissementMousse}
        onClick={() => !readOnly && !enEdition && setCellEnEdition({ id: demande.id, champ })}
      >
        {enEdition ? (
          <EditableCellInput
            type={estDate ? "date" : estNombre ? "number" : "text"}
            defaultValue={String(valeurBrute)}
            align={align}
            onCommit={(v) => sauvegarderChamp(demande, champ, v)}
            onCancel={() => setCellEnEdition(null)}
          />
        ) : (
          <>
            {valeurAffichee}
            {avertissementMousse && <span style={{ color: "var(--warn-text)", marginLeft: 4 }}>⚠</span>}
          </>
        )}
      </td>
    );
  }

  function thFiltrable(champ: Champ, label: string, align: "left" | "right" = "left", th: React.CSSProperties = thStyle) {
    const actif = tri?.colonne === champ;
    const filtreActif = filtres[champ] !== undefined;
    const valeursDistinctes = [...new Set(demandes.map((d) => valeurTexte(d, champ)))].sort((a, b) => a.localeCompare(b));
    const selection = filtres[champ] ? new Set(filtres[champ]) : null;
    const largeur = largeurColonne(champ);
    return (
      <th
        style={{
          ...th,
          textAlign: align,
          position: "sticky",
          top: 0,
          width: largeur,
          maxWidth: largeur,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: align === "right" ? "flex-end" : "flex-start", gap: 4 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
          <button
            ref={(el) => {
              if (el) boutonsFiltreRef.current[champ] = el;
            }}
            onClick={() => setMenuOuvert((prev) => (prev === champ ? null : champ))}
            title="Trier et filtrer"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px 4px",
              fontSize: 11,
              color: actif || filtreActif ? "var(--accent)" : "var(--text-faint)",
              position: "relative",
            }}
          >
            {actif ? (tri!.sens === "asc" ? "▲" : "▼") : "▾"}
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
        {menuOuvert === champ && boutonsFiltreRef.current[champ] && (
          <ColumnFilterMenu
            valeurs={valeursDistinctes}
            selection={selection}
            onApply={(s, sens) => appliquerFiltreColonne(champ, s, sens)}
            triActif={actif ? tri!.sens : null}
            onClose={() => setMenuOuvert(null)}
            ancre={boutonsFiltreRef.current[champ]!}
            estDate={CHAMPS_DATE.has(champ)}
          />
        )}
        <div
          onPointerDown={(e) => commencerRedimensionnement(e, champ, largeur)}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: 6,
            cursor: "col-resize",
            touchAction: "none",
          }}
        />
      </th>
    );
  }

  const yATrouFiltre = Object.keys(filtres).length > 0;
  const th = compact ? thStyleCompact : thStyle;
  const td = compact ? tdStyleCompact : tdStyle;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <TableOptionsMenu
          colonnes={COLONNES.map((c) => ({ champ: c.champ, label: c.label }))}
          colonnesVisibles={colonnesVisibles}
          onChangeColonnesVisibles={changerColonnesVisibles}
          compact={compact}
          onChangeCompact={changerCompact}
          masquerValidees={masquerValidees}
          onChangeMasquerValidees={changerMasquerValidees}
        />
      </div>
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            fontSize: compact ? 12 : 13,
            borderCollapse: "separate",
            borderSpacing: 0,
            tableLayout: "fixed",
          }}
        >
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
              {colonnesAffichees.map((c) => (
                <Fragment key={c.champ}>{thFiltrable(c.champ, c.label, c.align, th)}</Fragment>
              ))}
              <th style={{ ...th, width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {demandes.length === 0 ? (
              <tr>
                <td colSpan={colonnesAffichees.length + 1} style={{ ...td, textAlign: "center", color: "var(--text-muted)", padding: "20px 8px" }}>
                  Aucune demande. Collez des lignes depuis Excel ou ajoutez-en une manuellement.
                </td>
              </tr>
            ) : demandesTriees.length === 0 ? (
              <tr>
                <td colSpan={colonnesAffichees.length + 1} style={{ ...td, textAlign: "center", color: "var(--text-muted)", padding: "20px 8px" }}>
                  {yATrouFiltre
                    ? "Aucune demande ne correspond aux filtres actifs."
                    : masquerValidees
                      ? "Aucune demande non validée."
                      : "Aucune demande."}
                </td>
              </tr>
            ) : (
              demandesTriees.map((d) => {
                const estValidee = estDemandeValidee(d);
                return (
                  <tr
                    key={d.id}
                    className="article-row"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenuContextuel({ demande: d, x: e.clientX, y: e.clientY, validee: estValidee });
                    }}
                    style={{
                      background: estValidee ? "var(--success-bg, #d4f4dd)" : d.ok_pour_passer_cde ? "#f5eee0" : undefined,
                    }}
                  >
                    {colonnesAffichees.map((c) => (
                      <Fragment key={c.champ}>{cell(d, c.champ, c.align, td)}</Fragment>
                    ))}
                    <td style={td}>
                      <button className="btn btn-sm btn-danger" onClick={() => onDelete(d.id, d.affaire)} disabled={readOnly}>
                        Suppr.
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {menuContextuel &&
        createPortal(
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: menuContextuel.y,
              left: menuContextuel.x,
              background: "var(--bg-panel)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius)",
              boxShadow: "var(--shadow-lg)",
              zIndex: 1000,
              fontSize: 13,
              minWidth: 180,
            }}
          >
            <button
              onClick={() => {
                onValider(menuContextuel.demande.id, !menuContextuel.validee);
                setMenuContextuel(null);
              }}
              style={menuBoutonStyle}
            >
              {menuContextuel.validee ? "Dévalider la caisse" : "Valider la caisse"}
            </button>
            <button
              onClick={() => {
                onSimulerAffaire(menuContextuel.demande);
                setMenuContextuel(null);
              }}
              style={menuBoutonStyle}
            >
              Simuler l'affaire
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}

function EditableCellInput({
  type,
  defaultValue,
  align,
  onCommit,
  onCancel,
}: {
  type: "text" | "number" | "date";
  defaultValue: string;
  align: "left" | "right";
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const committed = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    // select() n'est pas supporté sur <input type="date"> dans certains navigateurs.
    if (ref.current?.type !== "date") ref.current?.select();
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

const menuBoutonStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "8px 12px",
  background: "none",
  border: "none",
  cursor: "pointer",
  font: "inherit",
};

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
  whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = {
  padding: "10px 8px",
  borderBottom: "1px solid var(--border)",
  borderRight: "1px solid var(--border)",
  verticalAlign: "middle",
};

const thStyleCompact: React.CSSProperties = {
  ...thStyle,
  padding: "4px 5px",
  fontSize: 9.5,
};
const tdStyleCompact: React.CSSProperties = {
  ...tdStyle,
  padding: "6px 5px",
};
