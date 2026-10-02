import { useEffect, useState } from "react";
import { backupApi } from "../data/backup";

// Signale que l'app est ouverte sur ce poste. La restauration d'une sauvegarde (page Admin) est
// refusée tant qu'un autre poste a signalé sa présence dans les 2 dernières minutes. Renvoie le
// trigramme de l'administrateur qui demande la fermeture des postes pour restaurer, ou null.
const INTERVALLE_MS = 30 * 1000;

export function usePresence(trigramme: string | null): string | null {
  const [demandeFermeture, setDemandeFermeture] = useState<string | null>(null);
  useEffect(() => {
    if (!trigramme) return;
    const signaler = () => {
      backupApi
        .signalerPresence(trigramme)
        .then(setDemandeFermeture)
        .catch((e) => console.warn("Présence :", e));
    };
    signaler();
    const periodique = window.setInterval(signaler, INTERVALLE_MS);
    return () => window.clearInterval(periodique);
  }, [trigramme]);
  return demandeFermeture;
}
