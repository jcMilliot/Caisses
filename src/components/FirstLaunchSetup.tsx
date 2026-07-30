import { useState } from "react";

interface Props {
  onChooseFolder: () => Promise<boolean>;
}

export default function FirstLaunchSetup({ onChooseFolder }: Props) {
  const [cancelled, setCancelled] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      const ok = await onChooseFolder();
      setCancelled(!ok);
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
        <h1 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 700 }}>Bienvenue</h1>
        <p style={{ margin: "0 0 20px", fontSize: 13.5, color: "var(--text-muted)" }}>
          Choisissez le dossier où seront stockées les données de l'application (fichier{" "}
          <span className="mono">caisses.sqlite3</span>). Ce choix n'est demandé qu'une seule fois.
        </p>
        {cancelled && (
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--danger, #c0392b)" }}>
            Un dossier est requis pour continuer.
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={handleClick} disabled={busy}>
            {busy ? "…" : "Choisir le dossier de stockage"}
          </button>
        </div>
      </div>
    </div>
  );
}
