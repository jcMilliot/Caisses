import { useCallback, useEffect, useState } from "react";
import { connexionApi } from "../data/user";

type Status = "checking" | "needs-setup" | "ready" | "error";

// Identité du poste (2026-10-08) : reconnexion automatique au compte intranet au démarrage ;
// écran de connexion si personne n'est encore connecté sur ce poste ou si les identifiants sont
// refusés. Intranet injoignable : dernier compte connu du poste (« hors ligne », sans Admin).
// `actif` : n'interroger qu'une fois la base ouverte — la connexion lit l'adresse de l'intranet et
// les rôles en base ; lancée trop tôt, elle échouait (« base de données non initialisée ») et
// l'app restait blanche jusqu'à un rafraîchissement (bug du 2026-10-08).
export function useUserSetup(actif: boolean) {
  const [status, setStatus] = useState<Status>("checking");
  const [trigramme, setTrigramme] = useState<string | null>(null);
  const [horsLigne, setHorsLigne] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [urlManquante, setUrlManquante] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    setStatus("checking");
    try {
      const etat = await connexionApi.auto();
      setMessage(etat.message);
      setUrlManquante(etat.url_manquante);
      if (etat.trigramme && etat.statut !== "a_identifier") {
        setTrigramme(etat.trigramme);
        setHorsLigne(etat.statut === "hors_ligne");
        setStatus("ready");
      } else {
        setStatus("needs-setup");
      }
    } catch (e) {
      setError(String(e));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (actif) check();
  }, [actif, check]);

  const confirmerConnexion = useCallback((identite: string) => {
    setTrigramme(identite);
    setHorsLigne(false);
    setStatus("ready");
  }, []);

  return { status, error, trigramme, horsLigne, message, urlManquante, confirmerConnexion, reessayer: check };
}
