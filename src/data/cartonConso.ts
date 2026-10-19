import { call } from "./client";
import type { CartonConso, NewCartonConso } from "../domain/types";

export const cartonConsoApi = {
  list: () => call<CartonConso[]>("list_cartons_conso"),
  create: (carton: NewCartonConso, trigramme: string) => call<CartonConso>("create_carton_conso", { carton, trigramme }),
  update: (id: number, carton: NewCartonConso, trigramme: string) => call<void>("update_carton_conso", { id, carton, trigramme }),
  delete: (id: number, trigramme: string) => call<void>("delete_carton_conso", { id, trigramme }),
};
