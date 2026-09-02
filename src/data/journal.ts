import { call } from "./client";
import type { JournalEntree } from "../domain/types";

export const journalApi = {
  list: (trigramme: string, limite?: number) =>
    call<JournalEntree[]>("list_journal", { trigramme, limite: limite ?? null }),
  peutLire: (trigramme: string) => call<boolean>("peut_lire_journal", { trigramme }),
};
