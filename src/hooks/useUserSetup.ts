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

  const setTrigramme = useCallback(async (value: string) => {
    await userApi.setTrigramme(value);
    setTrigrammeState(value.trim().toUpperCase());
    setStatus("ready");
  }, []);

  return { status, error, trigramme, setTrigramme };
}
