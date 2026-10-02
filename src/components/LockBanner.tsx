interface Props {
  // Rôle Lecteur : bandeau de lecture seule, sans demande d'écriture possible.
  lectureSeule?: boolean;
  holderTrigramme: string | null;
  incomingRequest: string | null;
  outgoingRequestStatus: "none" | "pending" | "denied";
  onRequestPen: () => void;
  onApprove: () => void;
  onDeny: () => void;
}

export default function LockBanner({
  lectureSeule,
  holderTrigramme,
  incomingRequest,
  outgoingRequestStatus,
  onRequestPen,
  onApprove,
  onDeny,
}: Props) {
  if (lectureSeule) {
    return (
      <div style={bannerStyle("var(--border-strong)")}>
        <span>
          Accès en <strong>lecture seule</strong> (rôle Lecteur) — aucune modification possible.
        </span>
      </div>
    );
  }

  if (incomingRequest) {
    return (
      <div style={bannerStyle("var(--accent)")}>
        <span>{incomingRequest} demande l'accès en écriture.</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-sm btn-primary" onClick={onApprove}>
            Approuver
          </button>
          <button className="btn btn-sm" onClick={onDeny}>
            Refuser
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={bannerStyle("var(--border-strong)")}>
      <span>
        Verrouillé en écriture par <strong>{holderTrigramme}</strong> — lecture seule.
        {outgoingRequestStatus === "denied" && " Votre demande a été refusée."}
      </span>
      <button className="btn btn-sm" onClick={onRequestPen} disabled={outgoingRequestStatus === "pending"}>
        {outgoingRequestStatus === "pending" ? "Demande envoyée…" : "Demande d'écriture"}
      </button>
    </div>
  );
}

function bannerStyle(borderColor: string): React.CSSProperties {
  return {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "10px 16px",
    marginBottom: 16,
    border: "1px solid var(--border)",
    borderLeft: `4px solid ${borderColor}`,
    borderRadius: "var(--radius)",
    background: "var(--bg-panel)",
    boxShadow: "var(--shadow-sm)",
    fontSize: 13,
  };
}
