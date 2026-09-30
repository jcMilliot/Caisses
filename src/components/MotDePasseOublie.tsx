import { useState } from "react";
import { adminApi } from "../data/admin";

interface Props {
  trigramme: string;
  // Mot de passe changé : nouveau mot de passe (pour poursuivre la connexion) et nouveau code de
  // secours à afficher (l'ancien ne sert plus).
  onReinitialise: (nouveauMotDePasse: string, nouveauCode: string) => void;
  onAnnuler: () => void;
}

// « Mot de passe oublié ? » : code de secours + nouveau mot de passe.
export default function MotDePasseOublie({ trigramme, onReinitialise, onAnnuler }: Props) {
  const [code, setCode] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function valider() {
    if (nouveau !== confirmation) {
      setErreur("Les deux mots de passe ne correspondent pas");
      return;
    }
    setBusy(true);
    setErreur(null);
    try {
      const nouveauCode = await adminApi.reinitialiserParCode(trigramme, code, nouveau);
      onReinitialise(nouveau, nouveauCode);
    } catch (e) {
      setErreur(String(e));
    } finally {
      setBusy(false);
    }
  }

  const peutValider = code.trim().length > 0 && nouveau.length > 0 && confirmation.length > 0;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
        Saisissez le code de secours de {trigramme} (reçu à la création du mot de passe) et choisissez un nouveau mot de
        passe. Sans code, un autre administrateur peut réinitialiser votre mot de passe depuis Admin › Utilisateurs.
      </p>
      <input
        className="input mono"
        autoFocus
        placeholder="Code de secours (XXXX-XXXX-XXXX)"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
      />
      <input className="input" type="password" placeholder="Nouveau mot de passe" value={nouveau} onChange={(e) => setNouveau(e.target.value)} />
      <input
        className="input"
        type="password"
        placeholder="Confirmer le nouveau mot de passe"
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && peutValider && valider()}
      />
      {erreur && <p style={{ margin: 0, fontSize: 13, color: "var(--danger-text)" }}>{erreur}</p>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" className="btn" onClick={onAnnuler} disabled={busy}>
          Retour
        </button>
        <button type="button" className="btn btn-primary" onClick={valider} disabled={busy || !peutValider}>
          Changer le mot de passe
        </button>
      </div>
    </div>
  );
}
