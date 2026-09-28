import { call } from "./client";
import type { JournalEntree } from "../domain/types";

export const journalApi = {
  // Réservé à la session admin (erreur sinon).
  list: (limite?: number) => call<JournalEntree[]>("list_journal", { limite: limite ?? null }),
};
