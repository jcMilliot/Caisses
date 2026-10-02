import { exit, relaunch } from "@tauri-apps/plugin-process";
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

export interface FichierSauvegarde {
  nom: string;
  chemin: string;
  date: string; // "AAAA-MM-JJ HH:MM:SS", heure locale
  taille_octets: number;
}

export const backupApi = {
  getConfig: () => call<BackupConfig>("get_backup_config"),
  setConfig: (dossier: string | null, frequence: FrequenceBackup, conservation: number) =>
    call<BackupConfig>("set_backup_config", { dossier, frequence, conservation }),
  chooseFolder: () => call<string | null>("choose_backup_folder"),
  now: (trigramme: string) => call<string>("backup_now", { trigramme }),
  ifDue: (trigramme: string) => call<string | null>("backup_if_due", { trigramme }),
  // Renvoie le trigramme de l'admin qui demande la fermeture des postes (restauration), ou null.
  signalerPresence: (trigramme: string) => call<string | null>("signaler_presence", { trigramme }),
  // Restauration avec d'autres postes ouverts (2026-10-02) : demande de fermeture et attente.
  autresPostesActifs: () => call<string[]>("list_autres_postes_actifs"),
  demanderFermeture: (trigramme: string) => call<void>("demander_fermeture_postes", { trigramme }),
  annulerFermeture: () => call<void>("annuler_fermeture_postes"),
  // Poste qui accepte la demande : retiré des postes actifs, puis l'app se ferme.
  quitterPourRestauration: async () => {
    await call<void>("quitter_poste");
    await exit(0);
  },
  listSauvegardes: () => call<FichierSauvegarde[]>("list_sauvegardes"),
  chooseFichierRestauration: () => call<string | null>("choose_fichier_restauration"),
  // Renvoie le chemin de la copie de sécurité de la base remplacée.
  restaurer: (chemin: string, trigramme: string) => call<string>("restore_sauvegarde", { chemin, trigramme }),
  // Après une restauration, l'interface garde l'ancien état en mémoire : on relance l'app.
  redemarrer: () => relaunch(),
};
