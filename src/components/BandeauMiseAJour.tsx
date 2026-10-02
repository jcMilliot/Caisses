import type { ProgressionMiseAJour } from "../data/updater";

// Barre tout en haut de la fenêtre (2026-10-02) : mise à jour disponible (Installer / Plus tard),
// puis téléchargement avec barre de progression et installation — l'installeur Windows tourne en
// mode silencieux et relance l'app, rien d'autre ne s'affiche.
export default function BandeauMiseAJour({
  version,
  progression,
  erreur,
  onInstaller,
  onPlusTard,
}: {
  version: string;
  progression: ProgressionMiseAJour | null;
  erreur: string | null;
  onInstaller: () => void;
  onPlusTard: () => void;
}) {
  const pct =
    progression?.etape === "telechargement" && progression.total
      ? Math.min(100, Math.round((progression.recu / progression.total) * 100))
      : null;

  return (
    <div
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "8px 24px",
        background: erreur ? "var(--danger-bg)" : "var(--info-bg)",
        borderBottom: `1px solid ${erreur ? "var(--danger-border)" : "var(--info-border)"}`,
        color: erreur ? "var(--danger-text)" : "var(--info-text)",
        fontSize: 13,
      }}
    >
      {progression === null ? (
        <>
          <span style={{ flex: 1 }}>
            {erreur ? (
              <>La mise à jour {version} a échoué : {erreur}</>
            ) : (
              <>
                La version <strong>{version}</strong> de l'application est disponible. L'installation se fait ici et
                l'application redémarre toute seule — pensez à enregistrer vos modifications en cours.
              </>
            )}
          </span>
          <button className="btn btn-sm" onClick={onPlusTard}>
            Plus tard
          </button>
          <button className="btn btn-sm btn-primary" onClick={onInstaller}>
            {erreur ? "Réessayer" : "Installer"}
          </button>
        </>
      ) : progression.etape === "telechargement" ? (
        <>
          <span style={{ whiteSpace: "nowrap" }}>
            Téléchargement de la version <strong>{version}</strong>
            {pct !== null ? ` — ${pct} %` : "…"}
          </span>
          <div style={{ flex: 1, maxWidth: 420, height: 8, background: "var(--bg-panel)", borderRadius: 999, overflow: "hidden" }}>
            <div
              style={{
                width: pct !== null ? `${pct}%` : "35%",
                height: "100%",
                background: "var(--info-text)",
                borderRadius: 999,
                transition: "width 0.2s ease",
              }}
            />
          </div>
        </>
      ) : (
        <span style={{ flex: 1 }}>
          Installation de la version <strong>{version}</strong>… L'application va se fermer puis redémarrer toute seule.
        </span>
      )}
    </div>
  );
}
