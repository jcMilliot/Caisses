interface Props {
  nomAffaire: string;
  longueur_mm: number;
  largeur_mm: number;
  hauteur_mm: number;
  onConfirmer: () => void;
  onClose: () => void;
}

export default function CreerAffaireDialog({ nomAffaire, longueur_mm, largeur_mm, hauteur_mm, onConfirmer, onClose }: Props) {
  const aDesDimensions = longueur_mm > 0 || largeur_mm > 0 || hauteur_mm > 0;

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
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel"
        style={{ width: 440, maxWidth: "92vw", padding: 24, boxShadow: "var(--shadow-lg)" }}
      >
        <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>Créer l'affaire dans Simulations</h2>
        <p style={{ margin: "0 0 16px", fontSize: 13.5, color: "var(--text-muted)" }}>
          Aucune affaire « {nomAffaire} » n'existe encore dans Simulations. Créer l'affaire et une caisse{" "}
          {aDesDimensions ? "avec les dimensions renseignées dans la demande" : "sans dimensions pour l'instant"} ?
        </p>

        {aDesDimensions && (
          <div style={{ fontSize: 13, marginBottom: 16, display: "flex", gap: 16 }} className="mono">
            <span>L : {(longueur_mm / 1000).toFixed(2)} m</span>
            <span>l : {(largeur_mm / 1000).toFixed(2)} m</span>
            <span>H : {(hauteur_mm / 1000).toFixed(2)} m</span>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={onConfirmer}>
            Créer
          </button>
        </div>
      </div>
    </div>
  );
}
