import { useEffect } from "react";

interface Props {
  message: string;
  titre: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ message, titre, danger, onConfirm, onCancel }: Props) {
  // Raccourcis clavier : Échap = annuler, Entrée = confirmer.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onConfirm, onCancel]);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--bg-panel)", borderRadius: "var(--radius-lg)", width: 420, maxWidth: "92vw", boxShadow: "var(--shadow-lg)" }}
      >
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: danger ? "var(--danger-text)" : "var(--text)" }}>{titre}</h2>
        </div>

        <div style={{ padding: 20 }}>
          <p style={{ margin: 0, fontSize: 14, color: "var(--text)", lineHeight: 1.5 }}>{message}</p>
        </div>

        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onCancel}>
            Annuler
          </button>
          <button
            className="btn btn-primary"
            style={danger ? { background: "var(--danger-text)", borderColor: "var(--danger-text)" } : undefined}
            onClick={onConfirm}
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}
