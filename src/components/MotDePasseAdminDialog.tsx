import { useState } from "react";
import { adminApi } from "../data/admin";

interface Props {
  trigramme: string;
  onOk: () => void;
  onAnnuler: () => void;
}

// Rouvre la session admin (après « Verrouiller ») pour une action réservée aux administrateurs
// faite hors de la page Admin : mot de passe du compte intranet (2026-10-08).
export default function MotDePasseAdminDialog({ trigramme, onOk, onAnnuler }: Props) {
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function valider() {
    setBusy(true);
    setErreur(null);
    try {
      await adminApi.unlock(motDePasse);
      onOk();
    } catch (e) {
      setErreur(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 400 }} onClick={onAnnuler}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          valider();
        }}
        className="panel"
        style={{ padding: 22, width: 360, display: "grid", gap: 12, boxShadow: "var(--shadow-lg)" }}
      >
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Action réservée aux administrateurs</h3>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-muted)" }}>Mot de passe de l'intranet de {trigramme}.</p>
        <input
          className="input"
          type="password"
          autoFocus
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          placeholder="Mot de passe"
        />
        {erreur && <p style={{ margin: 0, fontSize: 12.5, color: "var(--danger-text)" }}>{erreur}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn" onClick={onAnnuler}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || motDePasse.length === 0}>
            {busy ? "…" : "Valider"}
          </button>
        </div>
      </form>
    </div>
  );
}
