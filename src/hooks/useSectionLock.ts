import { useCallback, useEffect, useRef, useState } from "react";
import { locksApi } from "../data/locks";
import type { SectionLock } from "../domain/types";

const POLL_INTERVAL_MS = 7_000;
const INACTIVITY_TIMEOUT_MS = 5 * 60_000;

type Status = "acquiring" | "held" | "readonly" | "error";
type OutgoingRequestStatus = "none" | "pending" | "denied";

export function useSectionLock(sectionKey: string, trigramme: string) {
  const [status, setStatus] = useState<Status>("acquiring");
  const [holderTrigramme, setHolderTrigramme] = useState<string | null>(null);
  const [incomingRequest, setIncomingRequest] = useState<string | null>(null);
  const [outgoingRequestStatus, setOutgoingRequestStatus] = useState<OutgoingRequestStatus>("none");

  const isHolderRef = useRef(false);
  const lastActivityRef = useRef(Date.now());
  const lastDenialSeenRef = useRef<string | null>(null);

  const applyLock = useCallback(
    (lock: SectionLock | null) => {
      if (!lock) {
        isHolderRef.current = false;
        setStatus("acquiring");
        setHolderTrigramme(null);
        setIncomingRequest(null);
        return;
      }
      const isHolder = lock.titulaire === trigramme;
      isHolderRef.current = isHolder;
      setStatus(isHolder ? "held" : "readonly");
      setHolderTrigramme(lock.titulaire);

      if (isHolder && lock.demandeur && lock.demande_statut === "en_attente") {
        setIncomingRequest(lock.demandeur);
      } else {
        setIncomingRequest(null);
      }

      if (!isHolder && lock.demande_statut === "refusee" && lock.demandeur === trigramme) {
        if (lastDenialSeenRef.current !== lock.demande_le) {
          lastDenialSeenRef.current = lock.demande_le;
          setOutgoingRequestStatus("denied");
        }
      } else if (!isHolder && lock.demande_statut === "en_attente" && lock.demandeur === trigramme) {
        setOutgoingRequestStatus("pending");
      } else if (isHolder) {
        setOutgoingRequestStatus("none");
      }
    },
    [trigramme],
  );

  useEffect(() => {
    let cancelled = false;

    async function acquire() {
      try {
        const lock = await locksApi.acquire(sectionKey, trigramme);
        if (!cancelled) applyLock(lock);
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    acquire();

    function onActivity() {
      lastActivityRef.current = Date.now();
    }
    window.addEventListener("mousemove", onActivity);
    window.addEventListener("keydown", onActivity);
    window.addEventListener("click", onActivity);

    const interval = setInterval(async () => {
      const renew = isHolderRef.current && Date.now() - lastActivityRef.current < INACTIVITY_TIMEOUT_MS;
      try {
        const lock = await locksApi.heartbeat(sectionKey, trigramme, renew);
        if (!cancelled) applyLock(lock);
      } catch {
        // Échec de poll ponctuel : ignoré, retenté au tick suivant.
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("click", onActivity);
      clearInterval(interval);
      if (isHolderRef.current) {
        locksApi.release(sectionKey, trigramme);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey, trigramme]);

  const requestPen = useCallback(async () => {
    const ok = await locksApi.requestPen(sectionKey, trigramme);
    setOutgoingRequestStatus(ok ? "pending" : "none");
  }, [sectionKey, trigramme]);

  const approveRequest = useCallback(async () => {
    await locksApi.respondPenRequest(sectionKey, trigramme, true);
    setIncomingRequest(null);
  }, [sectionKey, trigramme]);

  const denyRequest = useCallback(async () => {
    await locksApi.respondPenRequest(sectionKey, trigramme, false);
    setIncomingRequest(null);
  }, [sectionKey, trigramme]);

  return {
    status,
    holderTrigramme,
    incomingRequest,
    approveRequest,
    denyRequest,
    outgoingRequestStatus,
    requestPen,
  };
}
