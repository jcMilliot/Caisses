import { useState } from "react";
import { adminApi, type CompteStatus } from "../data/admin";
import CodeSecoursDialog from "./CodeSecoursDialog";
import MotDePasseOublie from "./MotDePasseOublie";

interface Props {
  // Renvoie le code de secours si un mot de passe administrateur vient d'être créé.
  onSubmit: (trigramme: string, motDePasse?: string) => Promise<string | null>;
  onTermine: (trigramme: string) => void;
}

export default function TrigrammeSetup({ onSubmit, onTermine }: Props) {
  // Code de secours à afficher, et suite une fois qu'il a été noté.
  const [codeAffiche, setCodeAffiche] = useState<{ code: string; ensuite: () => void } | null>(null);
  const [oubli, setOubli] = useState(false);
  const [valeur, setValeur] = useState("");
  // Renseigné quand le trigramme saisi est protégé : on passe à l'étape mot de passe.
  const [compte, setCompte] = useState<CompteStatus | null>(null);
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const creation = compte !== null && !compte.mot_de_passe_defini;

  async function handleSubmit() {
    setBusy(true);
    setErreur(null);
    try {
      if (compte === null) {
        const status = await adminApi.compteStatus(valeur);
        if (status.requiert_mot_de_passe) {
          setCompte(status);
          return;
        }
        await onSubmit(valeur);
      } else {
        if (creation && motDePasse !== confirmation) {
          setErreur("Les deux mots de passe ne correspondent pas");
          return;
        }
        const code = await onSubmit(valeur, motDePasse);
        if (code) setCodeAffiche({ code, ensuite: () => onTermine(valeur) });
      }
    } catch (e) {
      setErreur(String(e));
    } finally {
      setBusy(false);
    }
  }

  // Mot de passe oublié réussi : on montre le nouveau code, puis on poursuit la connexion avec le
  // nouveau mot de passe.
  function apresReinitialisation(nouveauMotDePasse: string, nouveauCode: string) {
    setOubli(false);
    setCodeAffiche({
      code: nouveauCode,
      ensuite: () => {
        setBusy(true);
        onSubmit(valeur, nouveauMotDePasse)
          .catch((e) => setErreur(String(e)))
          .finally(() => setBusy(false));
      },
    });
  }

  function revenir() {
    setOubli(false);
    setCompte(null);
    setMotDePasse("");
    setConfirmation("");
    setErreur(null);
  }

  const peutValider =
    compte === null ? valeur.length === 3 : motDePasse.length > 0 && (!creation || confirmation.length > 0);

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
      <div className="panel" style={{ width: 480, maxWidth: "92vw", padding: 32, boxShadow: "var(--shadow-lg)" }}>
        {compte === null ? (
          <>
            <h1 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 700 }}>Qui êtes-vous ?</h1>
            <p style={{ margin: "0 0 20px", fontSize: 13.5, color: "var(--text-muted)" }}>
              Saisissez votre trigramme (3 lettres). Il permet d'identifier qui travaille sur une
              affaire ou un écran quand plusieurs personnes utilisent l'application. Ce choix n'est
              demandé qu'une seule fois sur ce poste.
            </p>
            <input
              className="input mono"
              value={valeur}
              maxLength={3}
              autoFocus
              onChange={(e) => setValeur(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && peutValider && handleSubmit()}
              style={{ width: "100%", marginBottom: 16, fontSize: 18, textAlign: "center", letterSpacing: "0.2em" }}
            />
          </>
        ) : oubli ? (
          <>
            <h1 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 700 }}>Mot de passe oublié — {valeur}</h1>
            <MotDePasseOublie trigramme={valeur} onReinitialise={apresReinitialisation} onAnnuler={() => setOubli(false)} />
          </>
        ) : (
          <>
            <h1 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 700 }}>
              {creation ? `Créer le mot de passe de ${valeur}` : `Mot de passe de ${valeur}`}
            </h1>
            <p style={{ margin: "0 0 20px", fontSize: 13.5, color: "var(--text-muted)" }}>
              {creation
                ? "Ce trigramme donne accès à la page Admin. Choisissez un mot de passe (6 caractères minimum) : il sera demandé sur chaque poste qui choisit ce trigramme, et à l'ouverture de la page Admin."
                : "Ce trigramme est protégé par un mot de passe."}
            </p>
            <input
              className="input"
              type="password"
              value={motDePasse}
              autoFocus
              placeholder="Mot de passe"
              onChange={(e) => setMotDePasse(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && peutValider && handleSubmit()}
              style={{ width: "100%", marginBottom: 10 }}
            />
            {creation && (
              <input
                className="input"
                type="password"
                value={confirmation}
                placeholder="Confirmer le mot de passe"
                onChange={(e) => setConfirmation(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && peutValider && handleSubmit()}
                style={{ width: "100%", marginBottom: 10 }}
              />
            )}
            {!creation && (
              <button
                type="button"
                onClick={() => setOubli(true)}
                style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", fontSize: 12.5, cursor: "pointer" }}
              >
                Mot de passe oublié ?
              </button>
            )}
            <div style={{ height: 6 }} />
          </>
        )}
        {erreur && (
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--danger, #c0392b)" }}>{erreur}</p>
        )}
        {!oubli && <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {compte !== null && (
            <button className="btn" onClick={revenir} disabled={busy}>
              ← Autre trigramme
            </button>
          )}
          <button className="btn btn-primary" onClick={handleSubmit} disabled={busy || !peutValider}>
            {busy ? "…" : "Continuer"}
          </button>
        </div>}
      </div>
      {codeAffiche && (
        <CodeSecoursDialog
          code={codeAffiche.code}
          onFermer={() => {
            const ensuite = codeAffiche.ensuite;
            setCodeAffiche(null);
            ensuite();
          }}
        />
      )}
    </div>
  );
}
