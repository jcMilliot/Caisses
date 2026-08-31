import { call } from "./client";
import type { OptionListe, ListeOption } from "../domain/types";

export const optionsListeApi = {
  list: () => call<OptionListe[]>("list_options_liste"),
  create: (liste: ListeOption, valeur: string, trigramme: string) =>
    call<OptionListe>("create_option_liste", { liste, valeur, trigramme }),
  delete: (id: number, trigramme: string) => call<void>("delete_option_liste", { id, trigramme }),
};
