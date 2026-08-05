interface CaisseACreer {
  nom: string;
  longueur_mm: number;
  largeur_mm: number;
  hauteur_mm: number;
}

interface Props {
  nomAffaire: string;
  caisses: CaisseACreer[];
  onConfirmer: () => void;
  onClose: () => void;
}

export default function CreerAffaireDialog({ nomAffaire, caisses, onConfirmer, onClose }: Props) {
  const uneSeule = caisses.length === 1;
  const aDesDimensions = caisses.some((c) => c.longueur_mm > 0 || c.largeur_mm > 0 || c.hauteur_mm > 0);

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
          Aucune affaire « {nomAffaire} » n'existe encore dans Simulations. Créer l'affaire et{" "}
          {uneSeule
            ? `une caisse ${aDesDimensions ? "avec les dimensions renseignées dans la demande" : "sans dimensions pour l'instant"}`
            : `${caisses.length} caisses avec les dimensions renseignées`}{" "}
          ?
        </p>

        {aDesDimensions && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {caisses.map((c, i) => (
              <div key={i} style={{ fontSize: 13, display: "flex", gap: 16 }} className="mono">
                {!uneSeule && <span style={{ fontWeight: 700, minWidth: 100 }}>{c.nom || `Caisse ${i + 1}`}</span>}
                <span>L : {(c.longueur_mm / 1000).toFixed(2)} m</span>
                <span>l : {(c.largeur_mm / 1000).toFixed(2)} m</span>
                <span>H : {(c.hauteur_mm / 1000).toFixed(2)} m</span>
              </div>
            ))}
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
