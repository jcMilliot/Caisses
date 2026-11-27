import { useCallback, useEffect, useRef, useState } from "react";
import { locksApi } from "../data/locks";
import type { SectionLock } from "../domain/types";

const POLL_INTERVAL_MS = 7_000;
const INACTIVITY_TIMEOUT_MS = 5 * 60_000;

type Status = "acquiring" | "held" | "readonly" | "error";

// Droits par écran du poste (2026-11-25, définis par App avant l'affichage des écrans, relus à
// chaque changement d'écran) : sur un écran sans droit d'écriture, l'écran reste en lecture seule
// et ne prend jamais le verrou — il ne bloque personne. Garde réelle côté Rust (`require_lock`).
let ecransEcriture = new Set<string>();
export function definirDroitsEcriture(ecrans: string[]) {
  ecransEcriture = new Set(ecrans);
}
/** Écran d'une clé de verrou (`affaire:12` → `simulations`), comme `admin.rs::ecran_de`. */
export function ecranDe(sectionKey: string): string {
  return sectionKey.startsWith("affaire:") ? "simulations" : sectionKey;
}
export function peutEcrire(sectionKey: string): boolean {
  return ecransEcriture.has(ecranDe(sectionKey));
}
type OutgoingRequestStatus = "none" | "pending" | "denied";

export function useSectionLock(sectionKey: string, trigramme: string) {
  const lectureSeule = !peutEcrire(sectionKey);
  const [status, setStatus] = useState<Status>(lectureSeule ? "readonly" : "acquiring");
  const [holderTrigramme, setHolderTrigramme] = useState<string | null>(null);
  const [incomingRequest, setIncomingRequest] = useState<string | null>(null);
  const [outgoingRequestStatus, setOutgoingRequestStatus] = useState<OutgoingRequestStatus>("none");
  // Verrou libre (libéré ou expiré) alors que l'écran est en lecture seule : l'écran ne le
  // reprend pas de lui-même (ses données peuvent être périmées) — bouton « Prendre la main ».
  const [verrouLibre, setVerrouLibre] = useState(false);

  const isHolderRef = useRef(false);
  const lastActivityRef = useRef(Date.now());
  const lastDenialSeenRef = useRef<string | null>(null);

  const applyLock = useCallback(
    (lock: SectionLock | null) => {
      if (!lock) {
        isHolderRef.current = false;
        setStatus("readonly");
        setHolderTrigramme(null);
        setIncomingRequest(null);
        setVerrouLibre(true);
        return;
      }
      const isHolder = lock.titulaire === trigramme;
      isHolderRef.current = isHolder;
      setStatus(isHolder ? "held" : "readonly");
      setHolderTrigramme(lock.titulaire);
      setVerrouLibre(!isHolder && lock.expire);

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
    if (lectureSeule) return;
    let cancelled = false;

    async function acquire() {
      try {
        const lock = await locksApi.acquire(sectionKey, trigramme);
        if (!cancelled) applyLock(lock);
      } catch {
        if (!cancelled) {
          setStatus("error");
          setVerrouLibre(true);
        }
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
        let lock = await locksApi.heartbeat(sectionKey, trigramme, renew);
        // Notre demande d'écriture est restée sans réponse et le titulaire est injoignable
        // (>= 90 s des deux côtés) : on reprend la main automatiquement, sans attendre les 5 min
        // d'expiration du verrou lui-même.
        if (
          lock &&
          !cancelled &&
          lock.demande_expiree &&
          lock.demandeur === trigramme &&
          lock.titulaire !== trigramme
        ) {
          lock = await locksApi.claimExpiredPen(sectionKey, trigramme);
        }
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

  // Renvoie vrai si le verrou a été pris (sinon un autre poste l'a pris entre-temps, affiché).
  const prendreLaMain = useCallback(async () => {
    try {
      const lock = await locksApi.acquire(sectionKey, trigramme);
      applyLock(lock);
      return lock.titulaire === trigramme;
    } catch {
      return false;
    }
  }, [sectionKey, trigramme, applyLock]);

  const approveRequest = useCallback(async () => {
    await locksApi.respondPenRequest(sectionKey, trigramme, true);
    setIncomingRequest(null);
  }, [sectionKey, trigramme]);

  const denyRequest = useCallback(async () => {
    await locksApi.respondPenRequest(sectionKey, trigramme, false);
    setIncomingRequest(null);
  }, [sectionKey, trigramme]);

  return {
    lectureSeule,
    status,
    holderTrigramme,
    incomingRequest,
    approveRequest,
    denyRequest,
    outgoingRequestStatus,
    requestPen,
    verrouLibre,
    prendreLaMain,
  };
}
