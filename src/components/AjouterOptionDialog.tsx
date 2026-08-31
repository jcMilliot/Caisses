import { useMemo, useState } from "react";
import type { ListeOption, OptionListe } from "../domain/types";
import { LIBELLE_LISTE, optionsListe } from "../domain/demandeOptions";

interface Props {
  optionsPersonnalisees: OptionListe[];
  onAjouter: (liste: ListeOption, valeur: string) => Promise<void> | void;
  onSupprimer: (id: number) => Promise<void> | void;
  onClose: () => void;
}

const LISTES: ListeOption[] = ["moteurs", "module_lineaire", "terminaux"];

// Ajout/retrait de valeurs personnalisées aux listes déroulantes de la section Demandes
// (colonnes Moteurs / Module linéaire / Terminaux). Les valeurs de base ne sont pas listées ici.
export default function AjouterOptionDialog({ optionsPersonnalisees, onAjouter, onSupprimer, onClose }: Props) {
  const [liste, setListe] = useState<ListeOption>("moteurs");
  const [valeur, setValeur] = useState("");
  const [enCours, setEnCours] = useState(false);

  const dejaPresent = useMemo(
    () => optionsListe(liste, optionsPersonnalisees).some((v) => v.toLowerCase() === valeur.trim().toLowerCase()),
    [liste, valeur, optionsPersonnalisees],
  );

  const persoDeLaListe = optionsPersonnalisees.filter((o) => o.liste === liste);

  async function ajouter() {
    const v = valeur.trim();
    if (!v || dejaPresent || enCours) return;
    setEnCours(true);
    try {
      await onAjouter(liste, v);
      setValeur("");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--bg-panel)", borderRadius: "var(--radius-lg)", width: 460, maxWidth: "92vw", boxShadow: "var(--shadow-lg)" }}
      >
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Ajouter une valeur à une liste</h2>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
            Colonne
            <select value={liste} onChange={(e) => setListe(e.target.value as ListeOption)} style={champStyle}>
              {LISTES.map((l) => (
                <option key={l} value={l}>
                  {LIBELLE_LISTE[l]}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
            Nom de la valeur
            <input
              autoFocus
              value={valeur}
              onChange={(e) => setValeur(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  ajouter();
                }
              }}
              placeholder="ex. 4 MOTEURS"
              style={champStyle}
            />
          </label>
          {dejaPresent && valeur.trim() !== "" && (
            <span style={{ fontSize: 12, color: "var(--warn-text)" }}>Cette valeur existe déjà dans la liste.</span>
          )}

          {persoDeLaListe.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
                Valeurs personnalisées de « {LIBELLE_LISTE[liste]} »
              </span>
              {persoDeLaListe.map((o) => (
                <div key={o.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
                  <span>{o.valeur}</span>
                  <button className="btn btn-sm btn-danger" onClick={() => onSupprimer(o.id)}>
                    Retirer
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose}>
            Fermer
          </button>
          <button className="btn btn-primary" disabled={valeur.trim() === "" || dejaPresent || enCours} onClick={ajouter}>
            {enCours ? "Ajout…" : "Ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}

const champStyle: React.CSSProperties = {
  padding: "7px 8px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius)",
  background: "var(--bg-panel)",
  color: "var(--text)",
  font: "inherit",
};
