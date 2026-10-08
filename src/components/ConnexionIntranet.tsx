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
  // Champ d'adresse : affiché d'office si aucune n'est réglée, sinon sur demande (correction d'une
  // adresse fausse — l'Admin, où elle se règle aussi, demande d'être connecté).
  const [afficherUrl, setAfficherUrl] = useState(urlManquante);

  useEffect(() => {
    connexionApi.identifiant().then((id) => id && setIdentifiant(id)).catch(() => {});
    connexionApi.urlActuelle().then(setUrl).catch(() => {});
  }, []);

  const peutValider = identifiant.trim() !== "" && motDePasse !== "" && (!afficherUrl || url.trim() !== "");

  async function valider() {
    if (!peutValider || busy) return;
    setBusy(true);
    setErreur(null);
    try {
      onConnecte(await connexionApi.connexion(identifiant, motDePasse, afficherUrl ? url : undefined));
    } catch (e) {
      const texte = String(e);
      setErreur(texte === ERR_IDENTIFIANTS_REFUSES ? "Identifiant ou mot de passe refusé par l'intranet." : texte);
      // Adresse fausse (404) : on montre le champ pour la corriger.
      if (texte.includes("Adresse de l'intranet")) setAfficherUrl(true);
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
        {afficherUrl && (
          <input
            className="input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Adresse de l'intranet (https://…/api/)"
            title="Adresse de l'API de l'intranet (terminée par /api/), enregistrée si la connexion réussit — réglable aussi dans Admin › Paramètres"
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
          {afficherUrl ? (
            <span />
          ) : (
            <button
              type="button"
              onClick={() => setAfficherUrl(true)}
              style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", fontSize: 12.5, cursor: "pointer" }}
            >
              Modifier l'adresse de l'intranet
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy || !peutValider} style={{ minWidth: 130 }}>
            {busy ? "Connexion…" : "Se connecter"}
          </button>
        </div>
      </form>
    </div>
  );
}
