import { call } from "./client";

export interface DbStatus {
  configured: boolean;
  db_folder: string | null;
}

export interface EtatDossier {
  existe: boolean;
  base_presente: boolean;
}

export interface DossierBase {
  // Dossier utilisé par ce poste.
  poste: string;
  // Dossier réglé par un administrateur ('' = jamais réglé).
  reglage: string;
}

// Erreur de initDb : la base a été déplacée (Admin › Paramètres) vers un dossier inaccessible
// depuis ce poste — suivie du chemin.
export const PREFIXE_BASE_DEPLACEE = "BASE_DEPLACEE:";

export const setupApi = {
  getDbStatus: () => call<DbStatus>("get_db_status"),
  chooseDbFolder: () => call<string | null>("choose_db_folder"),
  // Renvoient le dossier vers lequel le poste a basculé (base déplacée par un admin), sinon null.
  setDbFolder: (folder: string) => call<string | null>("set_db_folder", { folder }),
  initDb: () => call<string | null>("init_db"),
  verifierDossier: (folder: string) => call<EtatDossier>("verifier_dossier_base", { folder }),
  getDossierBase: () => call<DossierBase>("get_dossier_base"),
  changerDossierBase: (nouveau: string) => call<void>("changer_dossier_base", { nouveau }),
};
