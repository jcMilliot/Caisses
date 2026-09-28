import { call } from "./client";

export type FrequenceBackup = "desactivee" | "quotidienne" | "hebdomadaire";

export interface BackupConfig {
  dossier: string | null;
  frequence: FrequenceBackup;
  conservation: number;
  derniere: string | null; // UTC, datetime('now')
  dernier_poste: string | null;
  derniere_erreur: string | null;
}

export const backupApi = {
  getConfig: () => call<BackupConfig>("get_backup_config"),
  setConfig: (dossier: string | null, frequence: FrequenceBackup, conservation: number) =>
    call<BackupConfig>("set_backup_config", { dossier, frequence, conservation }),
  chooseFolder: () => call<string | null>("choose_backup_folder"),
  now: (trigramme: string) => call<string>("backup_now", { trigramme }),
  ifDue: (trigramme: string) => call<string | null>("backup_if_due", { trigramme }),
};
