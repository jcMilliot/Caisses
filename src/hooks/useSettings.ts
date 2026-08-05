import { useEffect, useState } from "react";

const CLE_SEPARATION_MARQUEE = "caisses:reglages:separationLignesMarquee";

function chargerSeparationMarquee(): boolean {
  return localStorage.getItem(CLE_SEPARATION_MARQUEE) === "1";
}

function appliquerAuDocument(marquee: boolean) {
  document.documentElement.style.setProperty("--row-border-color", marquee ? "var(--row-border-color-marquee)" : "var(--border)");
}

// Appliqué au chargement du module (avant tout rendu React) pour éviter un flash de bordures
// grises au démarrage si le réglage marqué est actif.
appliquerAuDocument(chargerSeparationMarquee());

export function useSeparationLignesMarquee(): [boolean, (v: boolean) => void] {
  const [valeur, setValeur] = useState(chargerSeparationMarquee);

  useEffect(() => {
    appliquerAuDocument(valeur);
  }, [valeur]);

  function changer(v: boolean) {
    setValeur(v);
    if (v) localStorage.setItem(CLE_SEPARATION_MARQUEE, "1");
    else localStorage.removeItem(CLE_SEPARATION_MARQUEE);
  }

  return [valeur, changer];
}
