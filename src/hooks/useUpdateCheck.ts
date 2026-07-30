import { useCallback, useEffect, useState } from "react";
import { updaterApi, type PendingUpdate } from "../data/updater";

export function useUpdateCheck(enabled: boolean) {
  const [update, setUpdate] = useState<PendingUpdate | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    updaterApi
      .checkForUpdate()
      .then(setUpdate)
      .catch(() => {
        // Pas de mise à jour disponible ou serveur injoignable : ne pas gêner l'utilisateur.
      });
  }, [enabled]);

  const confirmInstall = useCallback(async () => {
    if (!update) return;
    setInstalling(true);
    try {
      await update.install();
    } finally {
      setInstalling(false);
    }
  }, [update]);

  const dismiss = useCallback(() => setUpdate(null), []);

  return { update, installing, confirmInstall, dismiss };
}
