import { useEffect, useRef, useState } from "react";
import { useSeparationLignesMarquee } from "../hooks/useSettings";

interface ColonneOption<T extends string> {
  champ: T;
  label: string;
}

interface Props<T extends string> {
  colonnes: ColonneOption<T>[];
  colonnesVisibles: Set<T>;
  onChangeColonnesVisibles: (visibles: Set<T>) => void;
  compact: boolean;
  onChangeCompact: (compact: boolean) => void;
  masquerValidees: boolean;
  onChangeMasquerValidees: (masquer: boolean) => void;
}

export default function TableOptionsMenu<T extends string>({
  colonnes,
  colonnesVisibles,
  onChangeColonnesVisibles,
  compact,
  onChangeCompact,
  masquerValidees,
  onChangeMasquerValidees,
}: Props<T>) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [separationMarquee, setSeparationMarquee] = useSeparationLignesMarquee();

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOuvert(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function toggleColonne(champ: T) {
    const next = new Set(colonnesVisibles);
    if (next.has(champ)) next.delete(champ);
    else next.add(champ);
    onChangeColonnesVisibles(next);
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="btn" onClick={() => setOuvert((v) => !v)}>
        Options
      </button>
      {ouvert && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            background: "var(--bg-panel)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius)",
            boxShadow: "var(--shadow-lg)",
            width: 260,
            zIndex: 50,
            fontSize: 13,
          }}
        >
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={compact} onChange={(e) => onChangeCompact(e.target.checked)} />
              Affichage compact
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={masquerValidees} onChange={(e) => onChangeMasquerValidees(e.target.checked)} />
              Masquer les caisses validées
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={separationMarquee} onChange={(e) => setSeparationMarquee(e.target.checked)} />
              Séparation des lignes plus marquée
            </label>
          </div>

          <div style={{ padding: "8px 14px 4px", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            Colonnes visibles
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto", padding: "4px 6px 10px" }}>
            {colonnes.map((c) => (
              <label
                key={c.champ}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", cursor: "pointer", borderRadius: 4 }}
              >
                <input type="checkbox" checked={colonnesVisibles.has(c.champ)} onChange={() => toggleColonne(c.champ)} />
                {c.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
