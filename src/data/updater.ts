import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  body?: string;
}

export interface PendingUpdate {
  info: UpdateInfo;
  install: () => Promise<void>;
}

export const updaterApi = {
  async checkForUpdate(): Promise<PendingUpdate | null> {
    const update = await check();
    if (!update) return null;
    return {
      info: { version: update.version, currentVersion: update.currentVersion, body: update.body },
      install: async () => {
        await update.downloadAndInstall();
        await relaunch();
      },
    };
  },
};
