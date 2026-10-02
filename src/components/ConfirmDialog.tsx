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
    // Armés après un court délai : évite qu'une touche Entrée encore enfoncée au moment où ce
    // dialogue s'ouvre (ex. validation d'une cellule de tableau qui déclenche elle-même cette
    // confirmation) ne le referme aussitôt via l'auto-repeat du clavier, sans que l'utilisateur
    // n'ait rien vu ni pu répondre consciemment.
    let armes = false;
    const armer = setTimeout(() => {
      armes = true;
    }, 150);
    function onKey(e: KeyboardEvent) {
      if (!armes || e.repeat) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(armer);
      window.removeEventListener("keydown", onKey);
    };
  }, [onConfirm, onCancel]);

  return (
    <div
      className="modal-overlay" style={{ zIndex: 300 }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--bg-panel)", borderRadius: "var(--radius-lg)", width: 440, maxWidth: "92vw", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: danger ? "var(--danger-text)" : "var(--text)" }}>
            {danger && <span aria-hidden="true" style={{ marginRight: 8 }}>⚠</span>}
            {titre}
          </h2>
        </div>

        <div style={{ padding: "18px 22px 20px" }}>
          <p style={{ margin: 0, fontSize: 14, color: "var(--text)", lineHeight: 1.55 }}>{message}</p>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onCancel}>
            Annuler
          </button>
          <button
            className="btn btn-primary"
            style={{ minWidth: 100, ...(danger ? { background: "var(--danger-text)", borderColor: "var(--danger-text)" } : {}) }}
            onClick={onConfirm}
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}
