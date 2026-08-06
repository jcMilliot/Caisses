import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { toBlob } from "html-to-image";
import type { AfficheCaisse } from "../domain/affiches";
import { rendreAfficheHtml, rendreAfficheTexte } from "../domain/affiches";
import logoUrl from "../assets/logo.png";

interface Props {
  affiche: AfficheCaisse;
  trigrammesConnus: string[];
  trigrammeParDefaut: string;
  selectionnee: boolean;
  onToggleSelection: (v: boolean) => void;
  onContrePlaqueChange: (v: boolean) => Promise<void>;
  onMarqueeEnvoyee: () => void;
  readOnly: boolean;
}

export interface AfficheCaisseCardHandle {
  capturerPng: () => Promise<Blob | null>;
}

function aujourdhuiIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Chargé une seule fois (l'affiche doit rester autoportée en base64 pour survivre au copier-coller
// dans un client mail — une URL locale à l'appli ne fonctionnerait pas une fois collée ailleurs).
let logoDataUrlPromise: Promise<string> | null = null;
function chargerLogoDataUrl(): Promise<string> {
  if (!logoDataUrlPromise) {
    logoDataUrlPromise = fetch(logoUrl)
      .then((r) => r.blob())
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          }),
      );
  }
  return logoDataUrlPromise;
}

const AfficheCaisseCard = forwardRef<AfficheCaisseCardHandle, Props>(function AfficheCaisseCard(
  { affiche, trigrammesConnus, trigrammeParDefaut, selectionnee, onToggleSelection, onContrePlaqueChange, onMarqueeEnvoyee, readOnly },
  ref,
) {
  const [demandeur, setDemandeur] = useState(trigrammeParDefaut);
  const [dateDemande, setDateDemande] = useState(aujourdhuiIso());
  const [copie, setCopie] = useState(false);
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>(undefined);
  const apercuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let annule = false;
    chargerLogoDataUrl().then((url) => {
      if (!annule) setLogoDataUrl(url);
    });
    return () => {
      annule = true;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    capturerPng: async () => {
      if (!apercuRef.current) return null;
      try {
        return await toBlob(apercuRef.current, { pixelRatio: 2 });
      } catch {
        return null;
      }
    },
  }));

  async function handleCopier() {
    const texte = rendreAfficheTexte(affiche, demandeur, dateDemande);

    if (apercuRef.current) {
      try {
        const blob = await toBlob(apercuRef.current, { pixelRatio: 2 });
        if (blob) {
          await navigator.clipboard.write([
            new ClipboardItem({
              "image/png": blob,
              "text/plain": new Blob([texte], { type: "text/plain" }),
            }),
          ]);
          setCopie(true);
          setTimeout(() => setCopie(false), 2000);
          return;
        }
      } catch {
        // repli texte ci-dessous si la génération/copie d'image échoue
      }
    }

    await navigator.clipboard.writeText(texte);
    setCopie(true);
    setTimeout(() => setCopie(false), 2000);
  }

  return (
    <div
      className="panel"
      style={{
        padding: 20,
        marginBottom: 18,
        display: "flex",
        gap: 28,
        flexWrap: "wrap",
        borderRadius: 16,
        outline: selectionnee ? "2px solid var(--accent)" : undefined,
        outlineOffset: -2,
      }}
    >
      <div style={{ minWidth: 200, display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={selectionnee} onChange={(e) => onToggleSelection(e.target.checked)} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            {affiche.affaire}
          </span>
        </label>

        <div>
          <label style={labelStyle}>Demandeur</label>
          <select
            value={demandeur}
            onChange={(e) => setDemandeur(e.target.value)}
            disabled={readOnly}
            style={inputStyle}
          >
            {!trigrammesConnus.includes(demandeur) && <option value={demandeur}>{demandeur}</option>}
            {trigrammesConnus.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Date de la demande</label>
          <input
            type="date"
            value={dateDemande}
            onChange={(e) => setDateDemande(e.target.value)}
            disabled={readOnly}
            style={inputStyle}
          />
        </div>

        <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6, cursor: readOnly ? "default" : "pointer" }}>
          <input
            type="checkbox"
            checked={affiche.contrePlaque}
            disabled={readOnly}
            onChange={(e) => onContrePlaqueChange(e.target.checked)}
          />
          Contre-plaqué
        </label>

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={handleCopier}>
            {copie ? "Copié !" : "Copier"}
          </button>
          <button className="btn btn-sm" onClick={onMarqueeEnvoyee} disabled={readOnly}>
            Marquée comme envoyée
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 380, overflowX: "auto" }}>
        <div
          ref={apercuRef}
          style={{ display: "inline-block", minWidth: 480 }}
          dangerouslySetInnerHTML={{ __html: rendreAfficheHtml(affiche, demandeur, dateDemande, logoDataUrl) }}
        />
      </div>
    </div>
  );
});

export default AfficheCaisseCard;

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11.5,
  fontWeight: 600,
  color: "var(--text-muted)",
  marginBottom: 3,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius)",
  font: "inherit",
  fontSize: 13,
};
