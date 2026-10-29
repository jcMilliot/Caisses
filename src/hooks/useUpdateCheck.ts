import { useCallback, useEffect, useRef, useState } from "react";
import { updaterApi, type PendingUpdate, type ProgressionMiseAJour } from "../data/updater";

// Recherche de mise à jour au démarrage puis toutes les 30 min (une version publiée pendant que
// l'app est ouverte est signalée sans redémarrer). Tout passe par la barre en haut de l'app
// (BandeauMiseAJour) : disponibilité + « Mettre à jour », puis téléchargement et installation.
// Plus de « Plus tard » depuis le 2026-10-29 : la barre reste affichée.
const INTERVALLE_MS = 30 * 60 * 1000;

export function useUpdateCheck(enabled: boolean) {
  const [update, setUpdate] = useState<PendingUpdate | null>(null);
  const [progression, setProgression] = useState<ProgressionMiseAJour | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const enCoursRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const verifier = () => {
      updaterApi
        .checkForUpdate()
        .then((u) => {
          if (!u) return;
          // Pendant une installation, on ne remplace pas la mise à jour en cours.
          setUpdate((prev) => (enCoursRef.current ? prev : u));
        })
        .catch(() => {
          // Pas de mise à jour ou serveur injoignable : ne pas gêner l'utilisateur.
        });
    };
    verifier();
    const id = window.setInterval(verifier, INTERVALLE_MS);
    return () => window.clearInterval(id);
  }, [enabled]);

  const confirmInstall = useCallback(async () => {
    if (!update) return;
    setErreur(null);
    enCoursRef.current = true;
    setProgression({ etape: "telechargement", recu: 0, total: null });
    try {
      await update.install(setProgression);
    } catch (e) {
      enCoursRef.current = false;
      setProgression(null);
      setErreur(String(e));
    }
  }, [update]);

  return {
    update,
    afficherBandeau: update !== null,
    progression,
    erreur,
    confirmInstall,
  };
}
