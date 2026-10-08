import type { ResultatImport } from "../domain/importIntranet";

interface Props {
  resultat: ResultatImport;
  premierImport: boolean;
  busy: boolean;
  onAppliquer: () => void;
  onAnnuler: () => void;
}

// Résumé de ce que l'import / la vérification de mise à jour va changer, avant de l'appliquer.
export default function ImportIntranetDialog({ resultat: r, premierImport, busy, onAppliquer, onAnnuler }: Props) {
  const anomalies = r.plan.anomalies.length;
  return (
    <div className="modal-overlay" style={{ zIndex: 300 }} onClick={onAnnuler}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-panel)",
          borderRadius: "var(--radius-lg)",
          width: 640,
          maxWidth: "92vw",
          maxHeight: "84vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
            {premierImport ? "Importer depuis l'intranet" : "Mise à jour depuis l'intranet"}
          </h2>
        </div>
        <div style={{ padding: 20, overflow: "auto", flex: 1, display: "grid", gap: 14, fontSize: 13 }}>
          {r.remplaces.length > 0 && (
            <p style={avertissementStyle}>
              ⚠ Les {r.remplaces.length} article(s) collés depuis Excel seront remplacés par ceux de l'intranet
              {r.remplaces.some((a) => a.caisse_id !== null) && " et retirés de leur caisse"}.
            </p>
          )}
          <Bloc titre={`${r.ajoutes.length} ligne(s) ajoutée(s)`} lignes={r.ajoutes.map((a) => `${a.ar} — Qté ${a.quantite}`)} />
          <Bloc
            titre={`${r.modifies.length} ligne(s) modifiée(s)`}
            lignes={r.modifies.map((m) => `${m.avant.ar} : ${m.changements.join(", ")}`)}
          />
          <Bloc
            titre={`${r.supprimes.length} ligne(s) supprimée(s) dans l'intranet`}
            note="Elles sortent du tableau (et de leur caisse) et sont listées en dessous."
            lignes={r.supprimes.map((a) => a.ar)}
          />
          <Bloc
            titre={`${r.revenus.length} ligne(s) de nouveau présente(s)`}
            note="Elles reviennent dans le tableau, sans caisse."
            lignes={r.revenus.map((a) => a.ar)}
          />
          {anomalies > 0 && (
            <p style={avertissementStyle}>⚠ {anomalies} ligne(s) sans numéro de besoin ne seront pas importée(s).</p>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onAnnuler} disabled={busy}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={onAppliquer} disabled={busy}>
            {busy ? "Enregistrement…" : premierImport ? "Importer" : "Appliquer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Bloc({ titre, note, lignes }: { titre: string; note?: string; lignes: string[] }) {
  if (lignes.length === 0) return null;
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{titre}</div>
      {note && <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{note}</div>}
      <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 180, overflow: "auto" }}>
        {lignes.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

const avertissementStyle: React.CSSProperties = {
  margin: 0,
  padding: "8px 12px",
  borderRadius: "var(--radius)",
  background: "var(--warn-bg)",
  border: "1px solid var(--warn-border)",
  color: "var(--warn-text)",
};
