import { useEffect, useState } from "react";
import { connexionApi } from "../data/user";
import { ERR_IDENTIFIANTS_REFUSES } from "../data/intranet";

interface Props {
  // Message de la tentative automatique (identifiants refusés, intranet injoignable…).
  message: string | null;
  // Aucune adresse d'intranet réglée : première configuration, demandée ici.
  urlManquante: boolean;
  onConnecte: (identite: string) => void;
}

// Écran de connexion avec le compte intranet (2026-10-08), à la place du choix du trigramme :
// identifiants vérifiés par l'intranet puis gardés sur le poste ; le trigramme est repris de
// l'intranet. Intranet injoignable au tout premier lancement : message + nouvel essai.
export default function ConnexionIntranet({ message, urlManquante, onConnecte }: Props) {
  const [url, setUrl] = useState("");
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(message);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    connexionApi.identifiant().then((id) => id && setIdentifiant(id)).catch(() => {});
  }, []);

  const peutValider = identifiant.trim() !== "" && motDePasse !== "" && (!urlManquante || url.trim() !== "");

  async function valider() {
    if (!peutValider || busy) return;
    setBusy(true);
    setErreur(null);
    try {
      if (urlManquante) await connexionApi.urlInitiale(url);
      onConnecte(await connexionApi.connexion(identifiant, motDePasse));
    } catch (e) {
      const texte = String(e);
      setErreur(texte === ERR_IDENTIFIANTS_REFUSES ? "Identifiant ou mot de passe refusé par l'intranet." : texte);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
      }}
    >
      <form
        className="panel"
        style={{ width: 440, maxWidth: "92vw", padding: 32, boxShadow: "var(--shadow-lg)", display: "grid", gap: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          valider();
        }}
      >
        <h1 style={{ margin: "0 0 2px", fontSize: 18, fontWeight: 700 }}>Connexion</h1>
        <p style={{ margin: "0 0 10px", fontSize: 13.5, color: "var(--text-muted)" }}>
          Connectez-vous avec votre compte de l'intranet. Vos identifiants sont gardés sur ce poste : vous n'aurez pas à les
          ressaisir.
        </p>
        {urlManquante && (
          <input
            className="input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Adresse de l'intranet (https://…/api/)"
            title="Première configuration : adresse de l'API de l'intranet, réglable ensuite dans Admin › Paramètres"
          />
        )}
        <input
          className="input"
          value={identifiant}
          autoFocus={!identifiant}
          onChange={(e) => setIdentifiant(e.target.value)}
          placeholder="Identifiant"
        />
        <input
          className="input"
          type="password"
          value={motDePasse}
          autoFocus={!!identifiant}
          onChange={(e) => setMotDePasse(e.target.value)}
          placeholder="Mot de passe"
        />
        {erreur && <p style={{ margin: 0, fontSize: 13, color: "var(--danger-text)" }}>{erreur}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
          <button type="submit" className="btn btn-primary" disabled={busy || !peutValider} style={{ minWidth: 130 }}>
            {busy ? "Connexion…" : "Se connecter"}
          </button>
        </div>
      </form>
    </div>
  );
}
