import { call } from "./client";
import type { Affaire } from "../domain/types";

export const affairesApi = {
  list: () => call<Affaire[]>("list_affaires"),
  create: (nom: string, seuil_defaut: number) =>
    call<Affaire>("create_affaire", { nom, seuilDefaut: seuil_defaut }),
  update: (id: number, nom: string, seuil_defaut: number) =>
    call<void>("update_affaire", { id, nom, seuilDefaut: seuil_defaut }),
  delete: (id: number) => call<void>("delete_affaire", { id }),
};
