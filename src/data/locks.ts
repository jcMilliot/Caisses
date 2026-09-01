import { call } from "./client";
import type { SectionLock } from "../domain/types";

export const locksApi = {
  acquire: (sectionKey: string, trigramme: string) =>
    call<SectionLock>("acquire_lock", { sectionKey, trigramme }),
  release: (sectionKey: string, trigramme: string) =>
    call<void>("release_lock", { sectionKey, trigramme }),
  heartbeat: (sectionKey: string, trigramme: string, renew: boolean) =>
    call<SectionLock | null>("heartbeat", { sectionKey, trigramme, renew }),
  requestPen: (sectionKey: string, trigramme: string) =>
    call<boolean>("request_pen", { sectionKey, trigramme }),
  respondPenRequest: (sectionKey: string, trigramme: string, approve: boolean) =>
    call<void>("respond_pen_request", { sectionKey, trigramme, approve }),
  claimExpiredPen: (sectionKey: string, trigramme: string) =>
    call<SectionLock>("claim_expired_pen", { sectionKey, trigramme }),
  list: () => call<SectionLock[]>("list_locks"),
};
