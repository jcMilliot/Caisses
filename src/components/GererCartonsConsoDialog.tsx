import { useState } from "react";
import type { CartonConso, NewCartonConso } from "../domain/types";
import { PREFIXE_CARTON, cm, mmDepuisCm, nomCartonValide, texteCm } from "../domain/cartonConso";
import { confirmerSuppression } from "../data/confirm";
import { GroupeDimensions } from "./GererCaissesStockDialog";

interface Props {
  cartons: CartonConso[];
  onCreer: (carton: NewCartonConso) => Promise<void>;
  onModifier: (id: number, carton: NewCartonConso) => Promise<void>;
  onSupprimer: (id: number) => Promise<void>;
  onClose: () => void;
}

const CARTON_VIDE: NewCartonConso = {
  nom: "",
  longueur_mm: 0,
  largeur_mm: 0,
  hauteur_mm: 0,
  ext_longueur_mm: 0,
  ext_largeur_mm: 0,
  ext_hauteur_mm: 0,
  poids_kg: 0,
};

// Seul endroit où l'on crée, modifie ou supprime un carton conso (le tableau de l'onglet est en
// lecture seule), sur le modèle de « Gérer les caisses ». Pas d'affectation : rien à répercuter.
export default function GererCartonsConsoDialog({ cartons, onCreer, onModifier, onSupprimer, onClose }: Props) {
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

  async function modifier(id: number, carton: NewCartonConso) {
    const ok = await executer(() => onModifier(id, carton));
    if (ok) setEditionId(null);
    return ok;
  }

  async function supprimer(ids: number[]) {
    if (ids.length === 0) return;
    const quoi = ids.length === 1 ? `le carton « ${cartons.find((c) => c.id === ids[0])?.nom} »` : `les ${ids.length} cartons sélectionnés`;
    if (!(await confirmerSuppression(`Supprimer ${quoi} ?`))) return;
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
    <div className="modal-overlay" style={{ zIndex: 300 }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-panel)",
          borderRadius: "var(--radius-lg)",
          width: 900,
          maxWidth: "96vw",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Gérer les cartons conso</h2>
        </div>

        <div style={{ padding: 20, overflow: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ padding: "14px 16px", background: "var(--bg-panel-alt)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Nouveau carton</div>
            <FormulaireCarton initial={CARTON_VIDE} libelleValider="Ajouter" enCours={enCours} viderApres onValider={(c) => executer(() => onCreer(c))} />
          </div>

          {erreur && <p style={{ margin: 0, fontSize: 13, color: "var(--danger-text)" }}>{erreur}</p>}

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                Cartons conso <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>({cartons.length})</span>
              </span>
              {selection.size > 0 && (
                <button className="btn btn-sm btn-danger" disabled={enCours} onClick={() => supprimer([...selection])}>
                  Supprimer la sélection ({selection.size})
                </button>
              )}
            </div>

            {cartons.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "6px 0" }}>Aucun carton — ajoutez-en un ci-dessus.</p>
            ) : (
              cartons.map((c) => (
                <div
                  key={c.id}
                  className="ligne-filtre-valeur"
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px", borderBottom: "1px solid var(--border)", fontSize: 13, borderRadius: 6 }}
                >
                  <input type="checkbox" checked={selection.has(c.id)} onChange={() => toggleSelection(c.id)} />
                  {editionId === c.id ? (
                    <div style={{ flex: 1 }}>
                      <FormulaireCarton
                        initial={c}
                        libelleValider="OK"
                        enCours={enCours}
                        onValider={(carton) => modifier(c.id, carton)}
                        onAnnuler={() => setEditionId(null)}
                      />
                    </div>
                  ) : (
                    <>
                      <span style={{ flex: "0 0 170px", fontWeight: 600, wordBreak: "break-word" }}>{c.nom}</span>
                      <span className="mono" style={{ flex: "0 0 190px", display: "flex", flexDirection: "column", gap: 2 }}>
                        <span title="Dimensions intérieures">
                          {cm(c.longueur_mm)} × {cm(c.largeur_mm)} × {cm(c.hauteur_mm)} cm
                        </span>
                        <span title="Dimensions extérieures" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          ext. {cm(c.ext_longueur_mm)} × {cm(c.ext_largeur_mm)} × {cm(c.ext_hauteur_mm)} cm
                        </span>
                      </span>
                      <span className="mono" style={{ flex: 1, color: c.poids_kg > 0 ? undefined : "var(--text-muted)" }}>
                        {c.poids_kg > 0 ? `${c.poids_kg} kg` : "Poids ?"}
                      </span>
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

function FormulaireCarton({
  initial,
  libelleValider,
  enCours,
  viderApres,
  onValider,
  onAnnuler,
}: {
  initial: NewCartonConso;
  libelleValider: string;
  enCours: boolean;
  viderApres?: boolean;
  onValider: (carton: NewCartonConso) => Promise<boolean>;
  onAnnuler?: () => void;
}) {
  const [nom, setNom] = useState(initial.nom);
  const [dims, setDims] = useState([texteCm(initial.longueur_mm), texteCm(initial.largeur_mm), texteCm(initial.hauteur_mm)]);
  const [dimsExt, setDimsExt] = useState([
    texteCm(initial.ext_longueur_mm),
    texteCm(initial.ext_largeur_mm),
    texteCm(initial.ext_hauteur_mm),
  ]);
  const [poids, setPoids] = useState(initial.poids_kg > 0 ? String(initial.poids_kg) : "");
  // Obligatoires (2026-10-14) : nom au format AR_RAJA__XXXXX, dimensions intérieures et
  // extérieures. Poids facultatif.
  const nomOk = nomCartonValide(nom);
  const manquants = [
    !nomOk && `nom au format « ${PREFIXE_CARTON}XXXXX »`,
    dims.some((d) => mmDepuisCm(d) <= 0) && "dimensions intérieures",
    dimsExt.some((d) => mmDepuisCm(d) <= 0) && "dimensions extérieures",
  ].filter((m): m is string => Boolean(m));
  const incomplet = manquants.length > 0;

  async function valider() {
    if (incomplet || enCours) return;
    const ok = await onValider({
      nom: nom.trim().toUpperCase(),
      longueur_mm: mmDepuisCm(dims[0]),
      largeur_mm: mmDepuisCm(dims[1]),
      hauteur_mm: mmDepuisCm(dims[2]),
      ext_longueur_mm: mmDepuisCm(dimsExt[0]),
      ext_largeur_mm: mmDepuisCm(dimsExt[1]),
      ext_hauteur_mm: mmDepuisCm(dimsExt[2]),
      poids_kg: Math.max(0, Number(poids.replace(",", ".")) || 0),
    });
    if (ok && viderApres) {
      setNom("");
      setDims(["", "", ""]);
      setDimsExt(["", "", ""]);
      setPoids("");
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
      <input
        autoFocus={!viderApres}
        value={nom}
        onChange={(e) => setNom(e.target.value)}
        placeholder={`${PREFIXE_CARTON}XXXXX`}
        title={`Référence du carton, format « ${PREFIXE_CARTON}XXXXX »`}
        style={{ ...champStyle, width: 170, background: nomOk ? undefined : "var(--warn-bg)" }}
      />
      <GroupeDimensions titre="Dimensions intérieures" valeurs={dims} onChange={setDims} obligatoire accent unite="cm" />
      <GroupeDimensions titre="Dimensions extérieures" valeurs={dimsExt} onChange={setDimsExt} obligatoire unite="cm" />
      <input
        value={poids}
        inputMode="decimal"
        onChange={(e) => setPoids(e.target.value)}
        placeholder="Poids (kg)"
        title="Poids du carton vide (kg), facultatif"
        style={{ ...champStyle, width: 90 }}
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

const champStyle: React.CSSProperties = {
  font: "inherit",
};
