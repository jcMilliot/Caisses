import { call } from "./client";
import type { OptionListe, ListeOption } from "../domain/types";

export const optionsListeApi = {
  list: () => call<OptionListe[]>("list_options_liste"),
  create: (liste: ListeOption, valeur: string, trigramme: string) =>
    call<OptionListe>("create_option_liste", { liste, valeur, trigramme }),
  rename: (id: number, valeur: string, trigramme: string) =>
    call<OptionListe>("rename_option_liste", { id, valeur, trigramme }),
  countUsage: (id: number) => call<number>("count_option_liste_usage", { id }),
  delete: (id: number, trigramme: string) => call<void>("delete_option_liste", { id, trigramme }),
};
