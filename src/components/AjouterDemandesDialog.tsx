import { useState } from "react";
import type { NewDemande } from "../domain/types";
import {
  TYPES_ENVOI_CAISSE,
  TYPES_OUVERTURE,
  VALEURS_STOCK,
  MOTEURS,
  TERMINAUX,
  TRAITEMENTS,
  MODULES_LINEAIRES,
  necessiteNimp15,
  estCaisse4C,
  AVERTISSEMENT_MOUSSE_4C,
} from "../domain/demandeOptions";
import SelectOuAutre from "./SelectOuAutre";

interface Props {
  onAjouter: (demandes: NewDemande[]) => void;
  onClose: () => void;
}

function ligneVide(): NewDemande {
  return {
    ok_pour_passer_cde: false,
    affaire: "",
    type_envoi_caisse: "",
    type_ouverture: "",
    stock: "",
    longueur_mm: 0,
    largeur_mm: 0,
    hauteur_mm: 0,
    quantite: 1,
    date_picking: "",
    date_demandee_s2c: "",
    moteurs: "",
    module_lineaire: "",
    terminaux: "",
    traitement: "",
    informations_supp: "",
    cde_passee_affaire: false,
    cde_passee_achat_stock: false,
    observations: "",
  };
}

export default function AjouterDemandesDialog({ onAjouter, onClose }: Props) {
  const [lignes, setLignes] = useState<NewDemande[]>([ligneVide()]);

  function majLigne(index: number, patch: Partial<NewDemande>) {
    setLignes((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  // Une caisse 4B/4C impose le traitement NIMP15 — pré-rempli seulement si le champ Traitement
  // est encore vide, pour ne pas écraser une saisie manuelle déjà faite.
  function changerTypeEnvoi(index: number, valeur: string) {
    setLignes((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l;
        const traitement = necessiteNimp15(valeur) && !l.traitement.trim() ? "NIMP15" : l.traitement;
        return { ...l, type_envoi_caisse: valeur, traitement };
      })
    );
  }

  function ajouterLigne() {
    setLignes((prev) => [...prev, ligneVide()]);
  }

  function retirerLigne(index: number) {
    setLignes((prev) => prev.filter((_, i) => i !== index));
  }

  function handleAjouter() {
    const valides = lignes.filter((l) => l.affaire.trim().length > 0);
    if (valides.length === 0) return;
    onAjouter(valides);
    onClose();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-panel)",
          borderRadius: "var(--radius-lg)",
          width: 1100,
          maxWidth: "96vw",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Ajouter des demandes</h2>
        </div>

        <div style={{ padding: 20, overflow: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          {lignes.map((ligne, index) => (
            <div
              key={index}
              className="panel"
              style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, position: "relative" }}
            >
              {lignes.length > 1 && (
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => retirerLigne(index)}
                  style={{ position: "absolute", top: 8, right: 8 }}
                >
                  Retirer
                </button>
              )}

              <Champ label="Affaire">
                <input
                  autoFocus={index === 0}
                  value={ligne.affaire}
                  onChange={(e) => majLigne(index, { affaire: e.target.value })}
                  style={inputStyle}
                />
              </Champ>

              <Champ label="Type envoi caisse">
                <SelectOuAutre
                  valeur={ligne.type_envoi_caisse}
                  options={TYPES_ENVOI_CAISSE}
                  onChange={(v) => changerTypeEnvoi(index, v)}
                />
                {estCaisse4C(ligne.type_envoi_caisse) && (
                  <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--warn-text)" }}>{AVERTISSEMENT_MOUSSE_4C}</p>
                )}
              </Champ>

              <Champ label="Type ouverture">
                <SelectOuAutre
                  valeur={ligne.type_ouverture}
                  options={TYPES_OUVERTURE}
                  onChange={(v) => majLigne(index, { type_ouverture: v })}
                />
              </Champ>

              <Champ label="Stock">
                <SelectOuAutre
                  valeur={ligne.stock}
                  options={VALEURS_STOCK}
                  onChange={(v) => majLigne(index, { stock: v })}
                />
              </Champ>

              <Champ label="Longueur (m)">
                <input
                  type="number"
                  step="0.01"
                  value={ligne.longueur_mm / 1000 || ""}
                  onChange={(e) => majLigne(index, { longueur_mm: Number(e.target.value) * 1000 || 0 })}
                  style={inputStyle}
                />
              </Champ>

              <Champ label="Largeur (m)">
                <input
                  type="number"
                  step="0.01"
                  value={ligne.largeur_mm / 1000 || ""}
                  onChange={(e) => majLigne(index, { largeur_mm: Number(e.target.value) * 1000 || 0 })}
                  style={inputStyle}
                />
              </Champ>

              <Champ label="Hauteur (m)">
                <input
                  type="number"
                  step="0.01"
                  value={ligne.hauteur_mm / 1000 || ""}
                  onChange={(e) => majLigne(index, { hauteur_mm: Number(e.target.value) * 1000 || 0 })}
                  style={inputStyle}
                />
              </Champ>

              <Champ label="Qté">
                <input
                  type="number"
                  min={1}
                  value={ligne.quantite}
                  onChange={(e) => majLigne(index, { quantite: Math.round(Number(e.target.value)) || 1 })}
                  style={inputStyle}
                />
              </Champ>

              <Champ label="Date picking">
                <input
                  type="date"
                  value={ligne.date_picking}
                  onChange={(e) => majLigne(index, { date_picking: e.target.value })}
                  style={inputStyle}
                />
              </Champ>

              <Champ label="Date demandée à S2C">
                <input
                  type="date"
                  value={ligne.date_demandee_s2c}
                  onChange={(e) => majLigne(index, { date_demandee_s2c: e.target.value })}
                  style={inputStyle}
                />
              </Champ>

              <Champ label="Moteurs">
                <SelectOuAutre valeur={ligne.moteurs} options={MOTEURS} onChange={(v) => majLigne(index, { moteurs: v })} />
              </Champ>

              <Champ label="Module linéaire">
                <SelectOuAutre
                  valeur={ligne.module_lineaire}
                  options={MODULES_LINEAIRES}
                  onChange={(v) => majLigne(index, { module_lineaire: v })}
                />
              </Champ>

              <Champ label="Terminaux">
                <SelectOuAutre valeur={ligne.terminaux} options={TERMINAUX} onChange={(v) => majLigne(index, { terminaux: v })} />
              </Champ>

              <Champ label="Traitement">
                <SelectOuAutre
                  valeur={ligne.traitement}
                  options={TRAITEMENTS}
                  onChange={(v) => majLigne(index, { traitement: v })}
                />
              </Champ>

              <Champ label="Informations supplémentaires" span={2}>
                <input
                  value={ligne.informations_supp}
                  onChange={(e) => majLigne(index, { informations_supp: e.target.value })}
                  style={inputStyle}
                />
              </Champ>

              <Champ label="Observations" span={2}>
                <input
                  value={ligne.observations}
                  onChange={(e) => majLigne(index, { observations: e.target.value })}
                  style={inputStyle}
                />
              </Champ>

              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                <input
                  type="checkbox"
                  checked={ligne.cde_passee_affaire}
                  onChange={(e) => majLigne(index, { cde_passee_affaire: e.target.checked })}
                />
                Cde passée sur affaire
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                <input
                  type="checkbox"
                  checked={ligne.cde_passee_achat_stock}
                  onChange={(e) => majLigne(index, { cde_passee_achat_stock: e.target.checked })}
                />
                Cde passée sur achat stock
              </label>
            </div>
          ))}

          <button className="btn" onClick={ajouterLigne} style={{ alignSelf: "flex-start" }}>
            + Ajouter une ligne
          </button>
        </div>

        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={handleAjouter}>
            Ajouter {lignes.filter((l) => l.affaire.trim()).length || ""} demande(s)
          </button>
        </div>
      </div>
    </div>
  );
}

function Champ({ label, span, children }: { label: string; span?: number; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: span ? `span ${span}` : undefined }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11.5,
  color: "var(--text-muted)",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 8px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius)",
  background: "var(--bg-panel)",
  color: "var(--text)",
  font: "inherit",
};
