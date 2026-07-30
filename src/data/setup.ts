import { call } from "./client";

export interface DbStatus {
  configured: boolean;
  db_folder: string | null;
}

export const setupApi = {
  getDbStatus: () => call<DbStatus>("get_db_status"),
  chooseDbFolder: () => call<string | null>("choose_db_folder"),
  setDbFolder: (folder: string) => call<void>("set_db_folder", { folder }),
  initDb: () => call<void>("init_db"),
};
