import { call } from "./client";
import type { Affaire } from "../domain/types";

export const affairesApi = {
  list: () => call<Affaire[]>("list_affaires"),
  // Le seuil d'alerte d'une nouvelle affaire est le seuil général (réglé dans l'Admin).
  create: (nom: string, trigramme: string) => call<Affaire>("create_affaire", { nom, trigramme }),
  update: (id: number, nom: string, trigramme: string) => call<void>("update_affaire", { id, nom, trigramme }),
  getSeuilGeneral: () => call<number>("get_seuil_general"),
  // Admin : règle le seuil général et l'applique aux affaires non livrées (renvoie leur nombre).
  setSeuilGeneral: (seuil: number) => call<number>("set_seuil_general", { seuil }),
  delete: (id: number, trigramme: string) => call<void>("delete_affaire", { id, trigramme }),
};
