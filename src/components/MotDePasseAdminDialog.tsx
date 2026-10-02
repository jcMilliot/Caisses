import { useEffect, useState } from "react";
import { adminApi } from "../data/admin";
import CodeSecoursDialog from "./CodeSecoursDialog";
import MotDePasseOublie from "./MotDePasseOublie";

interface Props {
  trigramme: string;
  onOk: () => void;
  onAnnuler: () => void;
}

// Ouvre la session admin (mot de passe personnel, créé ici s'il n'existe pas encore) pour une
// action réservée aux administrateurs faite hors de la page Admin.
export default function MotDePasseAdminDialog({ trigramme, onOk, onAnnuler }: Props) {
  const [defini, setDefini] = useState<boolean | null>(null);
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [oubli, setOubli] = useState(false);
  const [codeAffiche, setCodeAffiche] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .compteStatus(trigramme)
      .then((s) => setDefini(s.mot_de_passe_defini))
      .catch((e) => setErreur(String(e)));
  }, [trigramme]);

  const creation = defini === false;

  async function valider(mdp = motDePasse) {
    if (creation && mdp !== confirmation) {
      setErreur("Les deux mots de passe ne correspondent pas");
      return;
    }
    setBusy(true);
    setErreur(null);
    try {
      const code = await adminApi.unlock(trigramme, mdp);
      if (code) setCodeAffiche(code);
      else onOk();
    } catch (e) {
      setErreur(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (codeAffiche) return <CodeSecoursDialog code={codeAffiche} onFermer={onOk} />;

  return (
    <div
      className="modal-overlay" style={{ zIndex: 400 }}
      onClick={onAnnuler}
    >
      {oubli ? (
        <div onClick={(e) => e.stopPropagation()} className="panel" style={{ padding: 22, width: 400, boxShadow: "var(--shadow-lg)" }}>
          <h3 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 700 }}>Mot de passe oublié — {trigramme}</h3>
          <MotDePasseOublie
            trigramme={trigramme}
            onReinitialise={(nouveau, code) => {
              setOubli(false);
              // Le nouveau mot de passe est valide : on ouvre la session, puis on montre le code.
              adminApi
                .unlock(trigramme, nouveau)
                .then(() => setCodeAffiche(code))
                .catch((e) => setErreur(String(e)));
            }}
            onAnnuler={() => setOubli(false)}
          />
        </div>
      ) : (
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
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-muted)" }}>
          {creation
            ? `Créez le mot de passe administrateur de ${trigramme} (6 caractères minimum).`
            : `Mot de passe administrateur de ${trigramme} (demandé une fois par lancement de l'app).`}
        </p>
        <input
          className="input"
          type="password"
          autoFocus
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          placeholder="Mot de passe"
        />
        {creation && (
          <input
            className="input"
            type="password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder="Confirmer le mot de passe"
          />
        )}
        {erreur && <p style={{ margin: 0, fontSize: 12.5, color: "var(--danger-text)" }}>{erreur}</p>}
        {!creation && defini !== null && (
          <button
            type="button"
            onClick={() => setOubli(true)}
            style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", fontSize: 12.5, cursor: "pointer", justifySelf: "start" }}
          >
            Mot de passe oublié ?
          </button>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn" onClick={onAnnuler}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || defini === null || motDePasse.length === 0}>
            Valider
          </button>
        </div>
      </form>
      )}
    </div>
  );
}
