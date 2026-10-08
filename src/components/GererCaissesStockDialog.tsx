import { useState } from "react";
import type { CaisseStock, NewCaisseStock } from "../domain/types";
import { OUVERTURE_PAR_DESSUS, TYPES_OUVERTURE } from "../domain/demandeOptions";
import { MATIERES_CAISSE, dimensionsExterieures } from "../domain/caisseStock";
import { confirmerAction, confirmerSuppression } from "../data/confirm";

interface Props {
  caisses: CaisseStock[];
  onCreer: (caisse: NewCaisseStock) => Promise<void>;
  onModifier: (id: number, caisse: NewCaisseStock) => Promise<void>;
  onSupprimer: (id: number) => Promise<void>;
  compterLignesLiees: (id: number) => Promise<number>;
  onClose: () => void;
}

const CAISSE_VIDE: NewCaisseStock = {
  nom: "",
  longueur_mm: 0,
  largeur_mm: 0,
  hauteur_mm: 0,
  quantite: 1,
  observations: "",
  affaire_id: null,
  type_ouverture: OUVERTURE_PAR_DESSUS,
  matiere: "",
  ext_longueur_mm: 0,
  ext_largeur_mm: 0,
  ext_hauteur_mm: 0,
  tare_kg: 0,
};

function versNew(c: CaisseStock): NewCaisseStock {
  return {
    nom: c.nom,
    longueur_mm: c.longueur_mm,
    largeur_mm: c.largeur_mm,
    hauteur_mm: c.hauteur_mm,
    quantite: c.quantite,
    observations: c.observations,
    affaire_id: c.affaire_id,
    type_ouverture: c.type_ouverture,
    matiere: c.matiere,
    ext_longueur_mm: c.ext_longueur_mm,
    ext_largeur_mm: c.ext_largeur_mm,
    ext_hauteur_mm: c.ext_hauteur_mm,
    tare_kg: c.tare_kg,
  };
}

// Seul endroit où l'on crée, modifie ou supprime une caisse en stock (le tableau de la section
// est en lecture seule). Modifier les dimensions ou le type d'ouverture d'une caisse les répercute
// sur les lignes non livrées de Gestion des caisses qui l'utilisent (côté backend), après
// confirmation.
export default function GererCaissesStockDialog({ caisses, onCreer, onModifier, onSupprimer, compterLignesLiees, onClose }: Props) {
  const [enCours, setEnCours] = useState(false);
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [editionId, setEditionId] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function executer(action: () => Promise<void>) {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
      return true;
    } catch (e) {
      setErreur(String(e));
      return false;
    } finally {
      setEnCours(false);
    }
  }

  async function creer(caisse: NewCaisseStock) {
    return executer(() => onCreer(caisse));
  }

  async function modifier(c: CaisseStock, caisse: NewCaisseStock) {
    const repercute =
      caisse.longueur_mm !== c.longueur_mm ||
      caisse.largeur_mm !== c.largeur_mm ||
      caisse.hauteur_mm !== c.hauteur_mm ||
      caisse.type_ouverture !== c.type_ouverture;
    if (repercute) {
      const nb = await compterLignesLiees(c.id);
      if (
        nb > 0 &&
        !(await confirmerAction(
          `${nb} caisse(s) non livrée(s) de Gestion des caisses utilisent « ${c.nom} » : elles reprendront ces dimensions et ce type d'ouverture (ainsi que leurs caisses de Simulations). Continuer ?`,
          "Modifier la caisse en stock",
        ))
      ) {
        return false;
      }
    }
    const ok = await executer(() => onModifier(c.id, caisse));
    if (ok) setEditionId(null);
    return ok;
  }

  async function messageSuppression(ids: number[]): Promise<string> {
    const usages = await Promise.all(ids.map((id) => compterLignesLiees(id)));
    const total = usages.reduce((a, b) => a + b, 0);
    const quoi = ids.length === 1 ? `la caisse « ${caisses.find((c) => c.id === ids[0])?.nom} »` : `les ${ids.length} caisses sélectionnées`;
    return total > 0
      ? `Supprimer ${quoi} ? ${total} caisse(s) non livrée(s) de Gestion des caisses l'utilisent : elle(s) n'y sera(ont) plus sélectionnée(s) (leurs dimensions restent).`
      : `Supprimer ${quoi} ?`;
  }

  async function supprimer(ids: number[]) {
    if (ids.length === 0) return;
    if (!(await confirmerSuppression(await messageSuppression(ids)))) return;
    const ok = await executer(async () => {
      for (const id of ids) await onSupprimer(id);
    });
    if (ok) {
      setSelection((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
      if (editionId !== null && ids.includes(editionId)) setEditionId(null);
    }
  }

  function toggleSelection(id: number) {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      className="modal-overlay" style={{ zIndex: 300 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-panel)",
          borderRadius: "var(--radius-lg)",
          width: 980,
          maxWidth: "96vw",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Gérer les caisses en stock</h2>
        </div>

        <div style={{ padding: 20, overflow: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ padding: "14px 16px", background: "var(--bg-panel-alt)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Nouvelle caisse</div>
            <FormulaireCaisse initial={CAISSE_VIDE} libelleValider="Ajouter" enCours={enCours} viderApres onValider={creer} />
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 0" }}>
              Préfixer le nom par « AR_CAISS » pour une caisse réutilisable, affectable à plusieurs affaires en même temps.
            </p>
          </div>

          {erreur && <p style={{ margin: 0, fontSize: 13, color: "var(--danger-text)" }}>{erreur}</p>}

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                Caisses en stock <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>({caisses.length})</span>
              </span>
              {selection.size > 0 && (
                <button className="btn btn-sm btn-danger" disabled={enCours} onClick={() => supprimer([...selection])}>
                  Supprimer la sélection ({selection.size})
                </button>
              )}
            </div>

            {caisses.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "6px 0" }}>Aucune caisse en stock — ajoutez-en une ci-dessus.</p>
            ) : (
              caisses.map((c) => (
                <div
                  key={c.id}
                  className="ligne-filtre-valeur"
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px", borderBottom: "1px solid var(--border)", fontSize: 13, borderRadius: 6 }}
                >
                  <input type="checkbox" checked={selection.has(c.id)} onChange={() => toggleSelection(c.id)} />
                  {editionId === c.id ? (
                    <div style={{ flex: 1 }}>
                      <FormulaireCaisse
                        initial={versNew(c)}
                        libelleValider="OK"
                        enCours={enCours}
                        onValider={(caisse) => modifier(c, caisse)}
                        onAnnuler={() => setEditionId(null)}
                      />
                    </div>
                  ) : (
                    <>
                      <span style={{ flex: "0 0 200px", fontWeight: 600, wordBreak: "break-word" }}>{c.nom}</span>
                      <span className="mono" style={{ flex: "0 0 160px", display: "flex", flexDirection: "column", gap: 2 }}>
                        <span title="Dimensions intérieures">
                          {(c.longueur_mm / 1000).toFixed(2)} × {(c.largeur_mm / 1000).toFixed(2)} × {(c.hauteur_mm / 1000).toFixed(2)} m
                        </span>
                        <span title="Dimensions extérieures" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          ext. {dimensionsExterieures(c) ?? "—"}
                        </span>
                      </span>
                      <span style={{ flex: "0 0 170px" }}>{c.type_ouverture}</span>
                      <span style={{ flex: "0 0 100px", color: c.matiere ? undefined : "var(--text-muted)" }}>
                        {c.matiere || "Matière ?"}
                      </span>
                      <span style={{ flex: 1, color: "var(--text-muted)", wordBreak: "break-word" }}>{c.observations}</span>
                      <button className="btn btn-sm" disabled={enCours} onClick={() => setEditionId(c.id)}>
                        Modifier
                      </button>
                      <button className="btn btn-sm btn-danger" disabled={enCours} onClick={() => supprimer([c.id])}>
                        Supprimer
                      </button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

// Dimensions saisies en mètres dans un state texte (« 0.5 » ne doit pas être bloqué à « 0 »).
function texteDim(mm: number): string {
  return mm === 0 ? "" : String(mm / 1000);
}

function mmDepuisTexte(texte: string): number {
  const n = Number(texte.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 1000) : 0;
}

function FormulaireCaisse({
  initial,
  libelleValider,
  enCours,
  viderApres,
  onValider,
  onAnnuler,
}: {
  initial: NewCaisseStock;
  libelleValider: string;
  enCours: boolean;
  viderApres?: boolean;
  onValider: (caisse: NewCaisseStock) => Promise<boolean>;
  onAnnuler?: () => void;
}) {
  const [nom, setNom] = useState(initial.nom);
  const [dims, setDims] = useState([texteDim(initial.longueur_mm), texteDim(initial.largeur_mm), texteDim(initial.hauteur_mm)]);
  const [dimsExt, setDimsExt] = useState([
    texteDim(initial.ext_longueur_mm),
    texteDim(initial.ext_largeur_mm),
    texteDim(initial.ext_hauteur_mm),
  ]);
  const [typeOuverture, setTypeOuverture] = useState(initial.type_ouverture || OUVERTURE_PAR_DESSUS);
  const [observations, setObservations] = useState(initial.observations);
  const [matiere, setMatiere] = useState(initial.matiere);
  // Tare (poids à vide, kg) facultative : vrai poids de la caisse dans l'alerte de charge.
  const [tare, setTare] = useState(initial.tare_kg > 0 ? String(initial.tare_kg) : "");
  // Champs obligatoires (2026-10-06) : nom, dimensions intérieures, type d'ouverture, matière.
  // Dimensions extérieures facultatives.
  const manquants = [
    nom.trim() === "" && "nom",
    dims.some((d) => mmDepuisTexte(d) <= 0) && "dimensions intérieures",
    typeOuverture === "" && "type d'ouverture",
    matiere === "" && "matière",
  ].filter((m): m is string => Boolean(m));
  const incomplet = manquants.length > 0;

  async function valider() {
    if (incomplet || enCours) return;
    const ok = await onValider({
      ...initial,
      nom: nom.trim(),
      longueur_mm: mmDepuisTexte(dims[0]),
      largeur_mm: mmDepuisTexte(dims[1]),
      hauteur_mm: mmDepuisTexte(dims[2]),
      ext_longueur_mm: mmDepuisTexte(dimsExt[0]),
      ext_largeur_mm: mmDepuisTexte(dimsExt[1]),
      ext_hauteur_mm: mmDepuisTexte(dimsExt[2]),
      type_ouverture: typeOuverture,
      matiere,
      observations,
      tare_kg: Math.max(0, Number(tare.replace(",", ".")) || 0),
    });
    if (ok && viderApres) {
      setNom("");
      setDims(["", "", ""]);
      setDimsExt(["", "", ""]);
      setTypeOuverture(OUVERTURE_PAR_DESSUS);
      setMatiere("");
      setTare("");
      setObservations("");
    }
  }

  function surTouche(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      valider();
    } else if (e.key === "Escape" && onAnnuler) {
      e.preventDefault();
      onAnnuler();
    }
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-end", flexWrap: "wrap" }} onKeyDown={surTouche}>
      <input autoFocus={!viderApres} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom" style={{ ...champStyle, width: 190, background: nom.trim() === "" ? "var(--warn-bg)" : undefined }} />
      {/* Dimensions intérieures et extérieures regroupées sous un titre chacune, pour ne pas
          les confondre (2026-10-06). Extérieures facultatives : la caisse n'est pas forcément
          disponible pour être mesurée à sa création. */}
      <GroupeDimensions titre="Dimensions intérieures" valeurs={dims} onChange={setDims} obligatoire accent />
      <GroupeDimensions titre="Dimensions extérieures (facultatif)" valeurs={dimsExt} onChange={setDimsExt} />
      <select value={typeOuverture} onChange={(e) => setTypeOuverture(e.target.value)} style={{ ...champStyle, width: 190 }}>
        {TYPES_OUVERTURE.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      {/* Matière obligatoire (fond orangé tant qu'elle n'est pas choisie, comme les champs
          obligatoires de la création de caisse). */}
      <select
        value={matiere}
        onChange={(e) => setMatiere(e.target.value)}
        title="Matière (obligatoire)"
        style={{ ...champStyle, width: 140, background: matiere === "" ? "var(--warn-bg)" : undefined }}
      >
        <option value="">— Matière —</option>
        {MATIERES_CAISSE.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <input
        value={tare}
        inputMode="decimal"
        onChange={(e) => setTare(e.target.value)}
        placeholder="Tare (kg)"
        title="Poids à vide (kg), facultatif — souvent inscrit sur la caisse par le fabricant"
        style={{ ...champStyle, width: 90 }}
      />
      <input
        value={observations}
        onChange={(e) => setObservations(e.target.value)}
        placeholder="Observations"
        style={{ ...champStyle, flex: 1, minWidth: 120 }}
      />
      <button
        className="btn btn-sm btn-primary"
        disabled={incomplet || enCours}
        title={incomplet ? `À renseigner : ${manquants.join(", ")}` : undefined}
        onClick={valider}
      >
        {libelleValider}
      </button>
      {onAnnuler && (
        <button className="btn btn-sm" onClick={onAnnuler}>
          Annuler
        </button>
      )}
    </div>
  );
}

// Encadré d'un groupe de dimensions (intérieures / extérieures), titre en haut — deux blocs bien
// distincts pour ne pas les confondre (retour du 2026-10-06). `obligatoire` : fond orangé sur
// les champs vides ou nuls.
function GroupeDimensions({
  titre,
  valeurs,
  onChange,
  obligatoire,
  accent,
}: {
  titre: string;
  valeurs: string[];
  onChange: (valeurs: string[]) => void;
  obligatoire?: boolean;
  accent?: boolean;
}) {
  return (
    <fieldset
      style={{
        margin: 0,
        padding: "4px 8px 8px",
        border: `1px solid ${accent ? "var(--accent)" : "var(--border-strong)"}`,
        borderRadius: "var(--radius)",
        background: accent ? "var(--accent-soft)" : "var(--bg-panel)",
      }}
    >
      <legend style={{ padding: "0 4px", fontSize: 11.5, fontWeight: 700, color: accent ? "var(--accent)" : "var(--text-muted)" }}>{titre}</legend>
      <div style={{ display: "flex", gap: 4 }}>
        {["L", "l", "H"].map((libelle, i) => (
          <input
            key={libelle}
            type="text"
            inputMode="decimal"
            value={valeurs[i]}
            onChange={(e) => onChange(valeurs.map((v, j) => (j === i ? e.target.value : v)))}
            onFocus={(e) => e.target.select()}
            placeholder={`${libelle} (m)`}
            title={titre}
            style={{ ...champStyle, width: 70, background: obligatoire && mmDepuisTexte(valeurs[i]) <= 0 ? "var(--warn-bg)" : "var(--bg-panel)" }}
          />
        ))}
      </div>
    </fieldset>
  );
}

// Bordure, arrondi et focus : style commun des champs (index.css).
const champStyle: React.CSSProperties = {
  font: "inherit",
};
