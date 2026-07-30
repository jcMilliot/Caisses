import { useState } from "react";

interface Props {
  valeur: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
}

const AUTRE = "__autre__";

// Menu déroulant avec valeurs prédéfinies + option "Autre..." qui bascule vers un champ texte
// libre. Utilisé pour les champs de la section Demandes qui ont une liste de valeurs courantes
// mais doivent rester saisissables librement (type d'ouverture, stock, moteurs, etc.).
export default function SelectOuAutre({ valeur, options, onChange, placeholder }: Props) {
  const [modeLibre, setModeLibre] = useState(() => valeur !== "" && !options.includes(valeur));

  if (modeLibre) {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        <input
          autoFocus
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={inputStyle}
        />
        {options.length > 0 && (
          <button type="button" className="btn btn-sm" onClick={() => setModeLibre(false)}>
            Liste
          </button>
        )}
      </div>
    );
  }

  return (
    <select
      value={valeur}
      onChange={(e) => {
        if (e.target.value === AUTRE) {
          setModeLibre(true);
          onChange("");
        } else {
          onChange(e.target.value);
        }
      }}
      style={inputStyle}
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value={AUTRE}>Autre…</option>
    </select>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 8px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius)",
  background: "var(--bg-panel)",
  color: "var(--text)",
  font: "inherit",
};
