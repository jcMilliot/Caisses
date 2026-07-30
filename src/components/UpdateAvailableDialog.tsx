interface Props {
  version: string;
  body?: string;
  installing: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

export default function UpdateAvailableDialog({ version, body, installing, onConfirm, onDismiss }: Props) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={installing ? undefined : onDismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel"
        style={{ width: 440, maxWidth: "92vw", padding: 24, boxShadow: "var(--shadow-lg)" }}
      >
        <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>Mise à jour disponible</h2>
        <p style={{ margin: "0 0 16px", fontSize: 13.5, color: "var(--text-muted)" }}>
          La version {version} de l'application est disponible. Voulez-vous l'installer maintenant ?
          L'application redémarrera automatiquement.
        </p>

        {body && (
          <div
            style={{
              fontSize: 12.5,
              marginBottom: 16,
              padding: 12,
              background: "var(--bg)",
              borderRadius: 6,
              whiteSpace: "pre-wrap",
            }}
          >
            {body}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onDismiss} disabled={installing}>
            Plus tard
          </button>
          <button className="btn btn-primary" onClick={onConfirm} disabled={installing}>
            {installing ? "Installation…" : "Installer"}
          </button>
        </div>
      </div>
    </div>
  );
}
