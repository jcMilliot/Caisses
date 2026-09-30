import { useEffect } from "react";
import { backupApi } from "../data/backup";

// Signale que l'app est ouverte sur ce poste. La restauration d'une sauvegarde (page Admin) est
// refusée tant qu'un autre poste a signalé sa présence dans les 2 dernières minutes.
const INTERVALLE_MS = 30 * 1000;

export function usePresence(trigramme: string | null) {
  useEffect(() => {
    if (!trigramme) return;
    const signaler = () => {
      backupApi.signalerPresence(trigramme).catch((e) => console.warn("Présence :", e));
    };
    signaler();
    const periodique = window.setInterval(signaler, INTERVALLE_MS);
    return () => window.clearInterval(periodique);
  }, [trigramme]);
}
