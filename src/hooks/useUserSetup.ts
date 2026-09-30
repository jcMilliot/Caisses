import { useCallback, useEffect, useState } from "react";
import { userApi } from "../data/user";

type Status = "checking" | "needs-setup" | "ready" | "error";

export function useUserSetup() {
  const [status, setStatus] = useState<Status>("checking");
  const [trigramme, setTrigrammeState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    setStatus("checking");
    try {
      const userStatus = await userApi.getUserStatus();
      if (userStatus.configured && userStatus.trigramme) {
        setTrigrammeState(userStatus.trigramme);
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
    check();
  }, [check]);

  const confirmerTrigramme = useCallback((value: string) => {
    setTrigrammeState(value.trim().toUpperCase());
    setStatus("ready");
  }, []);

  // Renvoie le code de secours d'un administrateur qui vient de créer son mot de passe : l'écran
  // l'affiche, puis appelle confirmerTrigramme. Sinon, le trigramme est confirmé tout de suite.
  const setTrigramme = useCallback(
    async (value: string, motDePasse?: string): Promise<string | null> => {
      const code = await userApi.setTrigramme(value, motDePasse);
      if (code) return code;
      confirmerTrigramme(value);
      return null;
    },
    [confirmerTrigramme],
  );

  return { status, error, trigramme, setTrigramme, confirmerTrigramme };
}
