import { useEffect, useState } from "react";
import { ERR_IDENTIFIANTS_REFUSES } from "../data/intranet";
import { connexionApi } from "../data/user";

interface Props {
  // Message affiché en tête (ex. identifiants refusés par l'intranet).
  message?: string;
  onOk: () => void;
  onAnnuler: () => void;
}

// Identifiants de l'intranet, vérifiés auprès de lui puis gardés sur le poste (gestionnaire
// d'identifiants Windows) pour les imports suivants.
export default function IdentifiantsIntranetDialog({ message, onOk, onAnnuler }: Props) {
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(message ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    connexionApi.identifiant().then((id) => id && setIdentifiant(id)).catch(() => {});
  }, []);

  async function valider() {
    setBusy(true);
    setErreur(null);
    try {
      await connexionApi.connexion(identifiant, motDePasse);
      onOk();
    } catch (e) {
      setErreur(String(e) === ERR_IDENTIFIANTS_REFUSES ? "Identifiant ou mot de passe refusé par l'intranet." : String(e));
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
        style={{ padding: 22, width: 380, display: "grid", gap: 12, boxShadow: "var(--shadow-lg)" }}
      >
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Connexion à l'intranet</h3>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-muted)" }}>
          Vos identifiants de l'intranet. Ils sont gardés sur ce poste pour les prochains imports.
        </p>
        <input
          className="input"
          autoFocus={!identifiant}
          value={identifiant}
          onChange={(e) => setIdentifiant(e.target.value)}
          placeholder="Identifiant"
        />
        <input
          className="input"
          type="password"
          autoFocus={!!identifiant}
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          placeholder="Mot de passe"
        />
        {erreur && <p style={{ margin: 0, fontSize: 12.5, color: "var(--danger-text)" }}>{erreur}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn" onClick={onAnnuler}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !identifiant.trim() || !motDePasse}>
            {busy ? "Connexion…" : "Se connecter"}
          </button>
        </div>
      </form>
    </div>
  );
}
