import { useState } from "react";
import { mmDepuisTexte, texteDim } from "./GererCaissesStockDialog";
import { depassementMesuresMax4C } from "../domain/demandeOptions";
import type { Caisse, Demande } from "../domain/types";

export interface Dimensions {
  longueur_mm: number;
  largeur_mm: number;
  hauteur_mm: number;
}

interface Props {
  demande: Demande;
  // Caisse de Simulations liée à la ligne : undefined = recherche en cours, null = aucune.
  caisseSimu: Caisse | null | undefined;
  // Caisse en stock sélectionnée sur la ligne (retirée si les dimensions changent).
  nomCaisseStock: string | null;
  onEnregistrer: (dims: Dimensions, reporterSurSimu: boolean) => void;
  onClose: () => void;
}

const m = (mm: number) => (mm / 1000).toFixed(2);

// Dimensions d'une ligne mère de Gestion des caisses (2026-10-20) : les trois saisies ensemble,
// avec le report vers la caisse de Simulations décidé ici (case cochée par défaut) — une seule
// validation au lieu d'une question par dimension depuis l'enregistrement automatique.
export default function DimensionsDemandeDialog({ demande, caisseSimu, nomCaisseStock, onEnregistrer, onClose }: Props) {
  const [textes, setTextes] = useState([texteDim(demande.longueur_mm), texteDim(demande.largeur_mm), texteDim(demande.hauteur_mm)]);
  const [reporter, setReporter] = useState(true);
  const dims: Dimensions = {
    longueur_mm: mmDepuisTexte(textes[0]),
    largeur_mm: mmDepuisTexte(textes[1]),
    hauteur_mm: mmDepuisTexte(textes[2]),
  };
  const change =
    dims.longueur_mm !== demande.longueur_mm || dims.largeur_mm !== demande.largeur_mm || dims.hauteur_mm !== demande.hauteur_mm;
  const caisseDifferente =
    caisseSimu != null &&
    (Math.abs(caisseSimu.longueur_mm - dims.longueur_mm) >= 0.5 ||
      Math.abs(caisseSimu.largeur_mm - dims.largeur_mm) >= 0.5 ||
      Math.abs(caisseSimu.hauteur_mm - dims.hauteur_mm) >= 0.5);
  const alerte4C = depassementMesuresMax4C(demande.type_envoi_caisse, dims.longueur_mm, dims.largeur_mm, dims.hauteur_mm);

  return (
    <div className="modal-overlay" style={{ zIndex: 400 }} onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!change && !caisseDifferente) return onClose();
          onEnregistrer(dims, reporter && caisseDifferente);
        }}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        className="panel"
        style={{ padding: 22, width: 420, maxWidth: "calc(100vw - 32px)", boxSizing: "border-box", display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14, boxShadow: "var(--shadow-lg)" }}
      >
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Dimensions — {demande.affaire}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          {["L (m)", "l (m)", "H (m)"].map((label, i) => (
            <label key={label} style={{ display: "grid", gap: 4, fontSize: 12.5, color: "var(--text-muted)" }}>
              {label}
              <input
                className="input mono"
                inputMode="decimal"
                autoFocus={i === 0}
                value={textes[i]}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setTextes((t) => t.map((x, j) => (j === i ? e.target.value : x)))}
                style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}
              />
            </label>
          ))}
        </div>
        {alerte4C && <p style={{ margin: 0, fontSize: 12.5, color: "var(--danger-text)" }}>⚠ {alerte4C}</p>}
        {nomCaisseStock && change && (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--warn-text)" }}>
            La caisse en stock « {nomCaisseStock} » ne sera plus sélectionnée sur cette ligne.
          </p>
        )}
        {caisseSimu === undefined ? (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-muted)" }}>Recherche de la caisse dans Simulations…</p>
        ) : caisseSimu && caisseDifferente ? (
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
            <input type="checkbox" checked={reporter} onChange={(e) => setReporter(e.target.checked)} style={{ marginTop: 2 }} />
            <span>
              Reporter aussi sur la caisse « {caisseSimu.nom} » de Simulations
              <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)" }}>
                actuellement {m(caisseSimu.longueur_mm)} × {m(caisseSimu.largeur_mm)} × {m(caisseSimu.hauteur_mm)} m
              </span>
            </span>
          </label>
        ) : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn-success-solid" disabled={caisseSimu === undefined}>
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  );
}
