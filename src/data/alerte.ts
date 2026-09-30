import { call } from "./client";

export const alerteApi = {
  // Pastille rouge sur l'icône de l'app dans la barre des tâches Windows.
  definirBarreDesTaches: (active: boolean) => call<void>("set_alerte_barre_taches", { active }),
};
