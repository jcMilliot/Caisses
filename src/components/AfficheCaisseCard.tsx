import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { toBlob } from "html-to-image";
import type { AfficheCaisse } from "../domain/affiches";
import { rendreAfficheHtml, rendreAfficheTexte, texteIntroductionMail, mettreEnEvidenceS2C, MENTION_SOUDURE_4C, couleurAffiche, libelleCategorie } from "../domain/affiches";
import { estCaisse4C } from "../domain/demandeOptions";
import logoUrl from "../assets/logo.png";

interface Props {
  affiche: AfficheCaisse;
  selectionnee: boolean;
  onToggleSelection: (v: boolean) => void;
  onContrePlaqueChange: (v: boolean) => Promise<void>;
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

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// html-to-image capture le DOM tel quel — si une <img> (le logo, injecté en base64 via
// dangerouslySetInnerHTML) n'a pas fini de décoder ET d'être peinte au moment du snapshot, le
// rendu est vide ou tronqué (d'où le "ça marche à la 2e copie"). On force decode() sur TOUTES
// les images (img.complete peut être true avant le premier paint), puis on laisse passer deux
// frames pour que le layout soit stabilisé.
async function attendreImagesDecodees(conteneur: HTMLElement): Promise<void> {
  const images = Array.from(conteneur.querySelectorAll("img"));
  await Promise.all(images.map((img) => img.decode().catch(() => undefined)));
  await raf();
  await raf();
}

// Capture PNG robuste : html-to-image renvoie parfois un blob null/tronqué au premier appel
// (images pas encore peintes) — d'où le "ça marche à la 2e copie". On attend le décodage +
// deux frames, puis on retente jusqu'à 4 fois avec une pause croissante avant d'abandonner.
async function capturerAvecRetries(conteneur: HTMLElement | null): Promise<Blob | null> {
  if (!conteneur) return null;
  await attendreImagesDecodees(conteneur);
  for (let tentative = 0; tentative < 4; tentative++) {
    try {
      const blob = await toBlob(conteneur, { pixelRatio: 1.2, cacheBust: true });
      if (blob && blob.size > 1000) return blob;
    } catch {
      // on retente
    }
    await pause(120 * (tentative + 1));
    await raf();
  }
  return null;
}

const AfficheCaisseCard = forwardRef<AfficheCaisseCardHandle, Props>(function AfficheCaisseCard(
  { affiche, selectionnee, onToggleSelection, onContrePlaqueChange, readOnly },
  ref,
) {
  // Demandeur = qui a coché « OK pour être commandée » (plus de choix manuel, 2026-09-30).
  const demandeur = affiche.okCdePar;
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
    capturerPng: () => capturerAvecRetries(apercuRef.current),
  }));

  async function handleCopier() {
    const intro = texteIntroductionMail(1);
    const est4C = estCaisse4C(affiche.typeEnvoiCaisse);
    // Une seule caisse copiée : s'il s'agit d'une 4C, la mention suit directement l'intro
    // puisqu'il n'y a pas d'affiche d'un autre type avant elle.
    const texte = [intro, ...(est4C ? [MENTION_SOUDURE_4C] : []), rendreAfficheTexte(affiche, demandeur, dateDemande)].join("\n\n");

    if (apercuRef.current) {
      try {
        const blob = await capturerAvecRetries(apercuRef.current);
        if (blob) {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          const versHtml = (t: string) =>
            t
              .split("\n")
              .map((ligne) => `<div>${ligne ? mettreEnEvidenceS2C(ligne) : "&nbsp;"}</div>`)
              .join("");
          const html = `${versHtml(intro)}${est4C ? versHtml(MENTION_SOUDURE_4C) : ""}<img src="${dataUrl}" alt="" style="display:block;max-width:100%;margin-top:12px;" />`;
          await navigator.clipboard.write([
            new ClipboardItem({
              "text/html": new Blob([html], { type: "text/html" }),
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

  const couleur = couleurAffiche(affiche.typeEnvoiCaisse);

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
        borderLeft: `5px solid ${couleur}`,
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

        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            fontWeight: 700,
            color: "var(--text-muted)",
            width: "fit-content",
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: couleur, border: "1px solid rgba(0,0,0,0.12)" }} />
          {libelleCategorie(affiche.typeEnvoiCaisse)}
        </span>

        <div>
          <label style={labelStyle}>Demandeur</label>
          <div
            style={{
              display: "inline-block",
              padding: "3px 12px",
              borderRadius: "var(--radius)",
              background: demandeur ? "var(--ok-bg)" : "transparent",
              border: demandeur ? "1px solid var(--ok-border)" : "none",
              color: demandeur ? "var(--ok-text)" : "var(--text-muted)",
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: "0.04em",
            }}
          >
            {demandeur || "—"}
          </div>
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
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 380, overflowX: "auto" }}>
        <div
          ref={apercuRef}
          style={{ display: "inline-block" }}
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
