import { useState } from "react";
import { setupApi } from "../data/setup";

interface Props {
  // Ouvre la base du dossier choisi ; lève une erreur si impossible.
  onUseFolder: (folder: string) => Promise<void>;
  // Base déplacée par un administrateur vers ce dossier, inaccessible depuis ce poste.
  deplacee?: string | null;
}

// Premier démarrage d'un poste (ou base déplacée) : dossier de la base saisi (chemin communiqué
// par un administrateur, décision du 2026-10-08) ou choisi avec « Parcourir… ». Un dossier sans
// base demande confirmation avant d'en créer une nouvelle (vide).
export default function FirstLaunchSetup({ onUseFolder, deplacee }: Props) {
  const [chemin, setChemin] = useState(deplacee ?? "");
  const [erreur, setErreur] = useState<string | null>(
    deplacee ? `La base a été déplacée vers ce dossier, mais il est inaccessible depuis ce poste.` : null,
  );
  // Dossier accessible mais sans base : confirmation avant d'en créer une vide.
  const [sansBase, setSansBase] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function utiliser(dossier: string, creer = false) {
    const d = dossier.trim();
    if (!d || busy) return;
    setBusy(true);
    setErreur(null);
    try {
      const etat = await setupApi.verifierDossier(d);
      if (!etat.existe) {
        setErreur("Dossier introuvable ou inaccessible depuis ce poste. Vérifiez le chemin (lecteur réseau connecté ?).");
        return;
      }
      if (!etat.base_presente && !creer) {
        setSansBase(d);
        return;
      }
      await onUseFolder(d);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function parcourir() {
    const dossier = await setupApi.chooseDbFolder();
    if (!dossier) return;
    setChemin(dossier);
    setSansBase(null);
    await utiliser(dossier);
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
      <div className="panel" style={{ width: 520, maxWidth: "92vw", padding: 32, boxShadow: "var(--shadow-lg)" }}>
        <h1 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 700 }}>{deplacee ? "Dossier de la base" : "Bienvenue"}</h1>
        <p style={{ margin: "0 0 16px", fontSize: 13.5, color: "var(--text-muted)" }}>
          Indiquez le dossier qui contient la base de l'application (fichier <span className="mono">caisses.sqlite3</span>) :
          collez le chemin communiqué par un administrateur, ou cherchez-le avec « Parcourir… ». Ce choix n'est demandé
          qu'une seule fois.
        </p>
        <form
          style={{ display: "flex", gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            setSansBase(null);
            utiliser(chemin);
          }}
        >
          <input
            className="input mono"
            autoFocus
            value={chemin}
            onChange={(e) => {
              setChemin(e.target.value);
              setSansBase(null);
            }}
            placeholder="Chemin du dossier (ex. S:\…)"
            style={{ flex: 1, fontSize: 13 }}
          />
          <button type="button" className="btn" onClick={parcourir} disabled={busy}>
            Parcourir…
          </button>
        </form>
        {erreur && <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--danger-text)" }}>{erreur}</p>}
        {sansBase && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: "var(--radius)",
              background: "var(--warn-bg)",
              border: "1px solid var(--warn-border)",
              color: "var(--warn-text)",
              fontSize: 13,
            }}
          >
            Aucune base dans ce dossier. Pour rejoindre la base partagée, vérifiez le chemin. Pour démarrer une base{" "}
            <strong>nouvelle et vide</strong> ici :
            <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-sm" onClick={() => utiliser(sansBase, true)} disabled={busy}>
                Créer une nouvelle base ici
              </button>
            </div>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
          <button
            className="btn btn-primary"
            onClick={() => {
              setSansBase(null);
              utiliser(chemin);
            }}
            disabled={busy || chemin.trim() === ""}
          >
            {busy ? "…" : "Utiliser ce dossier"}
          </button>
        </div>
      </div>
    </div>
  );
}
