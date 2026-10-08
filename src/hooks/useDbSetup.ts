import { useCallback, useEffect, useState } from "react";
import { PREFIXE_BASE_DEPLACEE, setupApi } from "../data/setup";

type Status = "checking" | "needs-setup" | "ready" | "error";

export function useDbSetup() {
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);
  // Base déplacée par un administrateur vers un dossier inaccessible depuis ce poste : l'écran de
  // choix du dossier s'ouvre avec ce chemin et un message.
  const [deplacee, setDeplacee] = useState<string | null>(null);

  const check = useCallback(async () => {
    setStatus("checking");
    try {
      const dbStatus = await setupApi.getDbStatus();
      if (dbStatus.configured) {
        await setupApi.initDb();
        setStatus("ready");
      } else {
        setStatus("needs-setup");
      }
    } catch (e) {
      const texte = String(e);
      if (texte.startsWith(PREFIXE_BASE_DEPLACEE)) {
        setDeplacee(texte.slice(PREFIXE_BASE_DEPLACEE.length));
        setStatus("needs-setup");
        return;
      }
      setError(texte);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  // Dossier choisi (sélecteur Windows ou chemin saisi) : ouvre la base. Une erreur (dossier
  // inaccessible, base déplacée ailleurs…) est renvoyée à l'écran de choix.
  const utiliserDossier = useCallback(async (folder: string) => {
    try {
      await setupApi.setDbFolder(folder);
      setDeplacee(null);
      setStatus("ready");
    } catch (e) {
      const texte = String(e);
      if (texte.startsWith(PREFIXE_BASE_DEPLACEE)) {
        setDeplacee(texte.slice(PREFIXE_BASE_DEPLACEE.length));
        throw new Error(`La base de ce dossier a été déplacée vers ${texte.slice(PREFIXE_BASE_DEPLACEE.length)}, inaccessible depuis ce poste.`);
      }
      throw e;
    }
  }, []);

  return { status, error, deplacee, utiliserDossier };
}
