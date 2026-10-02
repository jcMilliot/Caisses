import { useState } from "react";
import { backupApi } from "../data/backup";

// Message affiché sur les autres postes quand un administrateur veut restaurer une sauvegarde
// (décision 2026-10-02) : un seul choix, fermer l'application. Le poste se retire alors des
// postes actifs, et la restauration démarre chez l'administrateur dès que plus aucun poste
// n'est ouvert.
export default function DemandeFermetureDialog({ demandeur }: { demandeur: string }) {
  const [fermeture, setFermeture] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function fermer() {
    setFermeture(true);
    try {
      await backupApi.quitterPourRestauration();
    } catch (e) {
      setErreur(String(e));
      setFermeture(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 3000 }}
    >
      <div className="panel" style={{ width: 440, maxWidth: "calc(100vw - 32px)", padding: 24, boxShadow: "var(--shadow-lg)" }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 10px" }}>Fermeture de l'application</h2>
        <p style={{ fontSize: 14, lineHeight: 1.5, margin: "0 0 8px" }}>
          L'application doit être fermée afin de restaurer une précédente sauvegarde.
        </p>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 18px" }}>
          Demande de {demandeur}. Les modifications non enregistrées seront perdues.
        </p>
        {erreur && <p style={{ fontSize: 12.5, color: "var(--danger-text)", margin: "0 0 12px" }}>{erreur}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={fermer} disabled={fermeture} autoFocus>
            {fermeture ? "Fermeture…" : "Fermer l'application"}
          </button>
        </div>
      </div>
    </div>
  );
}
