import { useState } from "react";

interface Props {
  code: string;
  onFermer: () => void;
}

// Affiche un code de secours administrateur — la seule fois où il est visible. Il permet de
// choisir un nouveau mot de passe via « Mot de passe oublié ? ».
export default function CodeSecoursDialog({ code, onFermer }: Props) {
  const [copie, setCopie] = useState(false);
  const [note, setNote] = useState(false);

  async function copier() {
    try {
      await navigator.clipboard.writeText(code);
      setCopie(true);
    } catch {
      // Presse-papiers indisponible : le code reste lisible à l'écran.
    }
  }

  return (
    <div
      className="modal-overlay" style={{ zIndex: 500 }}
    >
      <div className="panel" style={{ width: 440, maxWidth: "92vw", padding: 26, display: "grid", gap: 14, boxShadow: "var(--shadow-lg)" }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Votre code de secours</h3>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
          Notez-le en lieu sûr (hors de l'application). En cas d'oubli du mot de passe, « Mot de passe oublié ? » et ce
          code permettent d'en choisir un nouveau. <strong>Il ne sera plus affiché.</strong>
        </p>
        <div
          className="mono"
          style={{
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textAlign: "center",
            padding: "14px 10px",
            borderRadius: "var(--radius)",
            background: "var(--warn-bg)",
            border: "1px solid var(--warn-border)",
            userSelect: "all",
          }}
        >
          {code}
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          <input type="checkbox" checked={note} onChange={(e) => setNote(e.target.checked)} />
          J'ai noté ce code
        </label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={copier}>
            {copie ? "Copié ✓" : "Copier"}
          </button>
          <button className="btn btn-primary" onClick={onFermer} disabled={!note}>
            Continuer
          </button>
        </div>
      </div>
    </div>
  );
}
