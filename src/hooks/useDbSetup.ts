import { useCallback, useEffect, useState } from "react";
import { setupApi } from "../data/setup";

type Status = "checking" | "needs-setup" | "ready" | "error";

export function useDbSetup() {
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);

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
      setError(String(e));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const chooseFolder = useCallback(async () => {
    const folder = await setupApi.chooseDbFolder();
    if (!folder) return false;
    await setupApi.setDbFolder(folder);
    setStatus("ready");
    return true;
  }, []);

  return { status, error, chooseFolder };
}
