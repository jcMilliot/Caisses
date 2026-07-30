import { useState } from "react";

interface Props {
  onSubmit: (trigramme: string) => Promise<void>;
}

export default function TrigrammeSetup({ onSubmit }: Props) {
  const [valeur, setValeur] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setBusy(true);
    setErreur(null);
    try {
      await onSubmit(valeur);
    } catch (e) {
      setErreur(String(e));
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
      <div className="panel" style={{ width: 480, maxWidth: "92vw", padding: 32, boxShadow: "var(--shadow-lg)" }}>
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
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          style={{ width: "100%", marginBottom: 16, fontSize: 18, textAlign: "center", letterSpacing: "0.2em" }}
        />
        {erreur && (
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--danger, #c0392b)" }}>{erreur}</p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={busy || valeur.length !== 3}>
            {busy ? "…" : "Continuer"}
          </button>
        </div>
      </div>
    </div>
  );
}
