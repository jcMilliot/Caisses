import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  body?: string;
}

// Avancement d'une mise à jour, affiché dans le bandeau de l'app (2026-10-02).
export type ProgressionMiseAJour =
  | { etape: "telechargement"; recu: number; total: number | null }
  | { etape: "installation" };

export interface PendingUpdate {
  info: UpdateInfo;
  install: (onProgression: (p: ProgressionMiseAJour) => void) => Promise<void>;
}

export const updaterApi = {
  async checkForUpdate(): Promise<PendingUpdate | null> {
    const update = await check();
    if (!update) return null;
    return {
      info: { version: update.version, currentVersion: update.currentVersion, body: update.body },
      install: async (onProgression) => {
        let recu = 0;
        let total: number | null = null;
        await update.downloadAndInstall((ev) => {
          if (ev.event === "Started") {
            total = ev.data.contentLength ?? null;
            onProgression({ etape: "telechargement", recu: 0, total });
          } else if (ev.event === "Progress") {
            recu += ev.data.chunkLength;
            onProgression({ etape: "telechargement", recu, total });
          } else {
            onProgression({ etape: "installation" });
          }
        });
        // Sous Windows, l'installeur (mode silencieux, cf. tauri.conf.json) ferme l'app puis la
        // relance lui-même : cette ligne ne sert que sur les autres systèmes.
        await relaunch();
      },
    };
  },
};
