import { useEffect } from "react";
import { backupApi } from "../data/backup";

// Intervalle entre deux vérifications « sauvegarde due ? ». La réservation côté Rust garantit
// qu'un seul poste fait la sauvegarde ; ici on se contente de demander régulièrement.
const INTERVALLE_MS = 30 * 60 * 1000;
// Premier passage un peu après le démarrage, pour ne pas ralentir l'ouverture de l'app.
const DELAI_INITIAL_MS = 60 * 1000;

export function useBackupAuto(trigramme: string | null) {
  useEffect(() => {
    if (!trigramme) return;
    const verifier = () => {
      // Silencieux : l'erreur éventuelle est notée en base et affichée dans la page Admin.
      backupApi.ifDue(trigramme).catch((e) => console.warn("Sauvegarde automatique :", e));
    };
    const initial = window.setTimeout(verifier, DELAI_INITIAL_MS);
    const periodique = window.setInterval(verifier, INTERVALLE_MS);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(periodique);
    };
  }, [trigramme]);
}
