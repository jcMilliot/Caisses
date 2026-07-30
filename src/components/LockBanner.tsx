interface Props {
  holderTrigramme: string | null;
  incomingRequest: string | null;
  outgoingRequestStatus: "none" | "pending" | "denied";
  onRequestPen: () => void;
  onApprove: () => void;
  onDeny: () => void;
}

export default function LockBanner({
  holderTrigramme,
  incomingRequest,
  outgoingRequestStatus,
  onRequestPen,
  onApprove,
  onDeny,
}: Props) {
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
        {outgoingRequestStatus === "pending" ? "Demande envoyée…" : "Demander le crayon"}
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
    border: `1px solid ${borderColor}`,
    borderRadius: "var(--radius)",
    background: "var(--bg-panel)",
    fontSize: 13,
  };
}
