use crate::commands::admin::{require_admin, AdminSession};
use crate::db::Db;
use rusqlite::{Connection, OptionalExtension};
use std::path::Path;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

// Sauvegarde automatique de caisses.sqlite3 (décision 2026-09-28). Configuration partagée en base
// (table `parametre`) : n'importe quel poste ouvert qui constate que la sauvegarde est due la
// fait, après l'avoir « réservée » par un UPDATE conditionnel — un seul poste gagne, pas de
// doublon. Copie via `VACUUM INTO` : instantané cohérent même base ouverte ailleurs.

const CLE_DOSSIER: &str = "backup_dossier";
const CLE_FREQUENCE: &str = "backup_frequence"; // 'desactivee' | 'quotidienne' | 'hebdomadaire'
const CLE_CONSERVATION: &str = "backup_conservation"; // nombre de fichiers gardés
const CLE_DERNIERE: &str = "backup_derniere"; // datetime UTC de la dernière sauvegarde réussie
const CLE_DERNIER_POSTE: &str = "backup_dernier_poste";
const CLE_ERREUR: &str = "backup_derniere_erreur";

const CONSERVATION_PAR_DEFAUT: i64 = 30;
const PREFIXE_FICHIER: &str = "caisses_";
const SUFFIXE_FICHIER: &str = ".sqlite3";

pub(crate) fn lire(conn: &Connection, cle: &str) -> Result<Option<String>, String> {
    conn.query_row("SELECT valeur FROM parametre WHERE cle = ?1", [cle], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())
}

pub(crate) fn ecrire(conn: &Connection, cle: &str, valeur: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO parametre (cle, valeur) VALUES (?1, ?2)
         ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur",
        [cle, valeur],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
pub struct BackupConfig {
    pub dossier: Option<String>,
    pub frequence: String,
    pub conservation: i64,
    pub derniere: Option<String>,
    pub dernier_poste: Option<String>,
    pub derniere_erreur: Option<String>,
}

pub(crate) fn lire_config(conn: &Connection) -> Result<BackupConfig, String> {
    let non_vide = |v: Option<String>| v.filter(|s| !s.is_empty());
    Ok(BackupConfig {
        dossier: non_vide(lire(conn, CLE_DOSSIER)?),
        frequence: lire(conn, CLE_FREQUENCE)?.unwrap_or_else(|| "desactivee".to_string()),
        conservation: lire(conn, CLE_CONSERVATION)?
            .and_then(|v| v.parse().ok())
            .unwrap_or(CONSERVATION_PAR_DEFAUT),
        derniere: non_vide(lire(conn, CLE_DERNIERE)?),
        dernier_poste: non_vide(lire(conn, CLE_DERNIER_POSTE)?),
        derniere_erreur: non_vide(lire(conn, CLE_ERREUR)?),
    })
}

#[tauri::command]
pub fn get_backup_config(db: State<Db>, session: State<AdminSession>) -> Result<BackupConfig, String> {
    require_admin(&session)?;
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    lire_config(conn)
}

#[tauri::command]
pub fn set_backup_config(
    db: State<Db>,
    session: State<AdminSession>,
    dossier: Option<String>,
    frequence: String,
    conservation: i64,
) -> Result<BackupConfig, String> {
    require_admin(&session)?;
    if !["desactivee", "quotidienne", "hebdomadaire"].contains(&frequence.as_str()) {
        return Err(format!("Fréquence inconnue : {frequence}"));
    }
    if !(1..=365).contains(&conservation) {
        return Err("Le nombre de sauvegardes conservées doit être entre 1 et 365".to_string());
    }
    let dossier = dossier.map(|d| d.trim().to_string()).unwrap_or_default();
    if frequence != "desactivee" && dossier.is_empty() {
        return Err("Choisir un dossier de sauvegarde avant d'activer la sauvegarde automatique".to_string());
    }
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    ecrire(conn, CLE_DOSSIER, &dossier)?;
    ecrire(conn, CLE_FREQUENCE, &frequence)?;
    ecrire(conn, CLE_CONSERVATION, &conservation.to_string())?;
    lire_config(conn)
}

#[tauri::command]
pub async fn choose_backup_folder(app: AppHandle, session: State<'_, AdminSession>) -> Result<Option<String>, String> {
    require_admin(&session)?;
    let folder = app.dialog().file().blocking_pick_folder();
    Ok(folder.map(|p| p.to_string()))
}

/// Clé de tri chronologique (`AAAA-MM-JJ_HH-MM-SS`) d'un nom de sauvegarde
/// `caisses_JJ-MM-AAAA_HH-MM-SS.sqlite3`, ou `None` si le nom ne suit pas ce format.
pub(crate) fn cle_chronologique(nom: &str) -> Option<String> {
    let horodatage = nom.strip_prefix(PREFIXE_FICHIER)?.strip_suffix(SUFFIXE_FICHIER)?;
    let (date, heure) = horodatage.split_once('_')?;
    let parties: Vec<&str> = date.split('-').collect();
    let chiffres = |s: &str, n: usize| s.len() == n && s.bytes().all(|b| b.is_ascii_digit());
    let heures: Vec<&str> = heure.split('-').collect();
    match (parties.as_slice(), heures.as_slice()) {
        ([j, m, a], [h, mi, s])
            if chiffres(j, 2) && chiffres(m, 2) && chiffres(a, 4)
                && chiffres(h, 2) && chiffres(mi, 2) && chiffres(s, 2) =>
        {
            Some(format!("{a}-{m}-{j}_{heure}"))
        }
        _ => None,
    }
}

/// Copie la base dans le dossier de sauvegarde puis supprime les plus anciennes au-delà de la
/// conservation. Ne touche qu'aux fichiers `caisses_JJ-MM-AAAA_HH-MM-SS.sqlite3` du dossier.
fn sauvegarder(conn: &Connection, dossier: &str, conservation: i64) -> Result<String, String> {
    let dossier = Path::new(dossier);
    if !dossier.is_dir() {
        return Err(format!("Dossier de sauvegarde inaccessible : {}", dossier.display()));
    }
    let horodatage: String = conn
        .query_row("SELECT strftime('%d-%m-%Y_%H-%M-%S', 'now', 'localtime')", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let cible = dossier.join(format!("{PREFIXE_FICHIER}{horodatage}{SUFFIXE_FICHIER}"));
    let cible_str = cible.to_string_lossy().to_string();
    conn.execute("VACUUM INTO ?1", [&cible_str])
        .map_err(|e| format!("Échec de la copie vers {cible_str} : {e}"))?;

    // Rétention : le jour vient en premier dans le nom, l'ordre alphabétique n'est donc pas
    // l'ordre chronologique — on trie sur la date relue dans le nom.
    let mut fichiers: Vec<_> = std::fs::read_dir(dossier)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
        .filter_map(|e| cle_chronologique(&e.file_name().to_string_lossy()).map(|cle| (cle, e.path())))
        .collect();
    fichiers.sort();
    let en_trop = fichiers.len().saturating_sub(conservation.max(1) as usize);
    for (_, f) in fichiers.into_iter().take(en_trop) {
        let _ = std::fs::remove_file(f);
    }
    Ok(cible_str)
}

/// Exécute la sauvegarde en notant le résultat en base (date + poste, ou erreur).
fn executer_et_noter(conn: &Connection, trigramme: &str, cfg: &BackupConfig) -> Result<String, String> {
    let dossier = cfg.dossier.as_deref().ok_or("Aucun dossier de sauvegarde configuré")?;
    match sauvegarder(conn, dossier, cfg.conservation) {
        Ok(chemin) => {
            let _ = conn.execute(
                "INSERT INTO parametre (cle, valeur) VALUES (?1, datetime('now'))
                 ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur",
                [CLE_DERNIERE],
            );
            let _ = ecrire(conn, CLE_DERNIER_POSTE, trigramme);
            let _ = ecrire(conn, CLE_ERREUR, "");
            Ok(chemin)
        }
        Err(e) => {
            let _ = ecrire(conn, CLE_ERREUR, &format!("[{trigramme}] {e}"));
            Err(e)
        }
    }
}

/// Sauvegarde immédiate, depuis la page Admin.
#[tauri::command]
pub async fn backup_now(
    db: State<'_, Db>,
    session: State<'_, AdminSession>,
    trigramme: String,
) -> Result<String, String> {
    require_admin(&session)?;
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let cfg = lire_config(conn)?;
    executer_et_noter(conn, &trigramme, &cfg)
}

/// Appelé périodiquement par chaque poste. Fait la sauvegarde si elle est due et qu'aucun autre
/// poste ne l'a déjà prise. Renvoie le chemin du fichier créé, ou None si rien à faire.
#[tauri::command]
pub async fn backup_if_due(db: State<'_, Db>, trigramme: String) -> Result<Option<String>, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let cfg = lire_config(conn)?;
    // Échéance en jours calendaires locaux : quotidienne = pas encore faite aujourd'hui,
    // hebdomadaire = dernière il y a 7 jours ou plus.
    let condition = match cfg.frequence.as_str() {
        "quotidienne" => "date(valeur, 'localtime') < date('now', 'localtime')",
        "hebdomadaire" => "date(valeur, 'localtime') <= date('now', 'localtime', '-7 days')",
        _ => return Ok(None),
    };
    if cfg.dossier.is_none() {
        return Ok(None);
    }
    let precedente = lire(conn, CLE_DERNIERE)?;
    // Réservation atomique : seul le poste dont l'UPDATE modifie la ligne fait la sauvegarde.
    // Une valeur vide (jamais sauvegardé) compte comme due.
    conn.execute(
        "INSERT OR IGNORE INTO parametre (cle, valeur) VALUES (?1, '')",
        [CLE_DERNIERE],
    )
    .map_err(|e| e.to_string())?;
    let reserve = conn
        .execute(
            &format!(
                "UPDATE parametre SET valeur = datetime('now')
                 WHERE cle = ?1 AND (valeur = '' OR {condition})"
            ),
            [CLE_DERNIERE],
        )
        .map_err(|e| e.to_string())?;
    if reserve == 0 {
        return Ok(None);
    }
    match executer_et_noter(conn, &trigramme, &cfg) {
        Ok(chemin) => Ok(Some(chemin)),
        Err(e) => {
            // Échec : on rend la main pour qu'un autre poste (ou le prochain passage) réessaie.
            let _ = ecrire(conn, CLE_DERNIERE, precedente.as_deref().unwrap_or(""));
            Err(e)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::admin::verifier_ou_creer;

    fn base(nom: &str) -> Connection {
        let dir = std::env::temp_dir().join(format!("caisses-test-{nom}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        crate::db::open_at(&dir)
    }

    #[test]
    fn mot_de_passe_admin_cree_puis_verifie() {
        let conn = base("mdp");
        assert!(verifier_ou_creer(&conn, "AJC", None).is_err());
        assert!(verifier_ou_creer(&conn, "AJC", Some("court")).is_err());
        assert!(verifier_ou_creer(&conn, "AJC", Some("secret123")).unwrap());
        assert!(verifier_ou_creer(&conn, "AJC", Some("mauvais1")).is_err());
        assert!(verifier_ou_creer(&conn, "AJC", Some("secret123")).unwrap());
        assert!(!verifier_ou_creer(&conn, "XYZ", None).unwrap());
    }

    #[test]
    fn sauvegarde_reservee_une_seule_fois_par_jour_et_retention() {
        let conn = base("backup");
        let dossier = std::env::temp_dir().join(format!("caisses-backup-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dossier);
        std::fs::create_dir_all(&dossier).unwrap();
        ecrire(&conn, CLE_DOSSIER, &dossier.to_string_lossy()).unwrap();
        ecrire(&conn, CLE_FREQUENCE, "quotidienne").unwrap();
        ecrire(&conn, CLE_CONSERVATION, "2").unwrap();

        let cfg = lire_config(&conn).unwrap();
        // Premier passage : réservé (valeur vide), second : déjà fait aujourd'hui.
        conn.execute("INSERT OR IGNORE INTO parametre (cle, valeur) VALUES (?1, '')", [CLE_DERNIERE]).unwrap();
        let sql = "UPDATE parametre SET valeur = datetime('now') WHERE cle = ?1 AND (valeur = '' OR date(valeur, 'localtime') < date('now', 'localtime'))";
        assert_eq!(conn.execute(sql, [CLE_DERNIERE]).unwrap(), 1);
        assert_eq!(conn.execute(sql, [CLE_DERNIERE]).unwrap(), 0);

        // Rétention : 3 fichiers anciens + 1 nouveau → il en reste 2, dont le nouveau. Le plus
        // récent des anciens (01-02-2020) est alphabétiquement le premier : vérifie le tri par date.
        for n in ["caisses_15-01-2020_00-00-00.sqlite3", "caisses_31-01-2020_00-00-00.sqlite3", "caisses_01-02-2020_00-00-00.sqlite3", "caisses_notes.sqlite3", "autre.txt"] {
            std::fs::write(dossier.join(n), b"x").unwrap();
        }
        let chemin = executer_et_noter(&conn, "AJC", &cfg).unwrap();
        let mut restants: Vec<_> = std::fs::read_dir(&dossier).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().to_string()).collect();
        restants.sort();
        assert_eq!(restants.len(), 4, "{restants:?}");
        assert!(restants.contains(&"autre.txt".to_string()));
        assert!(restants.contains(&"caisses_notes.sqlite3".to_string()));
        assert!(restants.contains(&"caisses_01-02-2020_00-00-00.sqlite3".to_string()));
        assert!(std::path::Path::new(&chemin).is_file());
        assert_eq!(lire_config(&conn).unwrap().dernier_poste.as_deref(), Some("AJC"));
    }
}
