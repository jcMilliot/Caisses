use crate::commands::admin::{require_admin, AdminSession};
use crate::commands::backup::{ecrire, lire};
use crate::commands::restauration::{autres_postes_actifs, verifier_source, PosteId};
use crate::config;
use crate::db::{self, Db};
use std::path::Path;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

const FICHIER_BASE: &str = "caisses.sqlite3";
/// Dossier de la base choisi par un administrateur (Admin › Paramètres, 2026-10-08) : les postes
/// le suivent au démarrage. Jamais écrit automatiquement — les postes peuvent atteindre le même
/// partage par des chemins différents (lecteur réseau, jonction…).
const CLE_DOSSIER_BASE: &str = "dossier_base";
/// Erreur de `init_db` : la base a été déplacée vers un dossier inaccessible depuis ce poste.
const PREFIXE_DEPLACEE: &str = "BASE_DEPLACEE:";

#[derive(serde::Serialize)]
pub struct DbStatus {
    pub configured: bool,
    pub db_folder: Option<String>,
}

#[tauri::command]
pub fn get_db_status(app: AppHandle) -> Result<DbStatus, String> {
    let app_config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    match config::read(&app_config_dir) {
        Some(cfg) => Ok(DbStatus {
            configured: true,
            db_folder: Some(cfg.db_folder),
        }),
        None => Ok(DbStatus {
            configured: false,
            db_folder: None,
        }),
    }
}

#[tauri::command]
pub async fn choose_db_folder(app: AppHandle) -> Result<Option<String>, String> {
    let folder = app.dialog().file().blocking_pick_folder();
    Ok(folder.map(|p| p.to_string()))
}

fn meme_dossier(a: &str, b: &str) -> bool {
    let norm = |s: &str| s.trim().trim_end_matches(['\\', '/']).replace('/', "\\").to_lowercase();
    norm(a) == norm(b)
}

fn base_presente(dossier: &str) -> bool {
    Path::new(dossier.trim()).join(FICHIER_BASE).is_file()
}

#[derive(serde::Serialize)]
pub struct EtatDossier {
    pub existe: bool,
    pub base_presente: bool,
}

/// Chemin saisi à la main au premier démarrage : dossier accessible ? base déjà présente ?
#[tauri::command]
pub fn verifier_dossier_base(folder: String) -> EtatDossier {
    EtatDossier { existe: Path::new(folder.trim()).is_dir(), base_presente: base_presente(&folder) }
}

/// Ouvre la base de `dossier` puis suit le dossier réglé par un administrateur s'il est différent
/// et qu'une base s'y trouve. Renvoie le dossier vers lequel le poste a basculé, le cas échéant.
fn ouvrir_en_suivant(app: &AppHandle, db: &Db, dossier: &str) -> Result<Option<String>, String> {
    let conn = db::open_at(Path::new(dossier));
    let reglage = lire(&conn, CLE_DOSSIER_BASE)?.unwrap_or_default();
    let reglage = reglage.trim();
    if reglage.is_empty() || meme_dossier(reglage, dossier) {
        *db.0.lock().map_err(|e| e.to_string())? = Some(conn);
        return Ok(None);
    }
    if !base_presente(reglage) {
        // Ne jamais continuer sur l'ancienne base (les autres postes écrivent dans la nouvelle).
        return Err(format!("{PREFIXE_DEPLACEE}{reglage}"));
    }
    drop(conn);
    let app_config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    config::write(&app_config_dir, &config::DbConfig { db_folder: reglage.to_string() }).map_err(|e| e.to_string())?;
    *db.0.lock().map_err(|e| e.to_string())? = Some(db::open_at(Path::new(reglage)));
    Ok(Some(reglage.to_string()))
}

#[tauri::command]
pub fn init_db(app: AppHandle, db: State<Db>) -> Result<Option<String>, String> {
    let app_config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let cfg = config::read(&app_config_dir).ok_or("aucun dossier de base configuré")?;
    ouvrir_en_suivant(&app, &db, &cfg.db_folder)
}

#[tauri::command]
pub fn set_db_folder(app: AppHandle, db: State<Db>, folder: String) -> Result<Option<String>, String> {
    let folder = folder.trim().to_string();
    if !Path::new(&folder).is_dir() {
        return Err(format!("Dossier introuvable ou inaccessible : {folder}"));
    }
    let app_config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    config::write(&app_config_dir, &config::DbConfig { db_folder: folder.clone() }).map_err(|e| e.to_string())?;
    ouvrir_en_suivant(&app, &db, &folder)
}

#[derive(serde::Serialize)]
pub struct DossierBase {
    /// Dossier utilisé par ce poste.
    pub poste: String,
    /// Dossier réglé par un administrateur (vide = jamais réglé).
    pub reglage: String,
}

#[tauri::command]
pub fn get_dossier_base(app: AppHandle, db: State<Db>) -> Result<DossierBase, String> {
    let app_config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let poste = config::read(&app_config_dir).map(|c| c.db_folder).unwrap_or_default();
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    Ok(DossierBase { poste, reglage: lire(conn, CLE_DOSSIER_BASE)?.unwrap_or_default() })
}

/// Admin › Paramètres : change le dossier de la base pour tous les postes. Une base déjà présente
/// dans le nouveau dossier est reprise telle quelle ; sinon la base actuelle y est copiée (refusé
/// tant qu'un autre poste a l'app ouverte, pour ne rien perdre). Le réglage est écrit dans les deux
/// bases : les autres postes basculent à leur prochain démarrage. L'ancienne base reste en place.
#[tauri::command]
pub fn changer_dossier_base(
    app: AppHandle,
    db: State<Db>,
    session: State<AdminSession>,
    poste: State<PosteId>,
    nouveau: String,
) -> Result<(), String> {
    require_admin(&session)?;
    let nouveau = nouveau.trim().to_string();
    if !Path::new(&nouveau).is_dir() {
        return Err(format!("Dossier introuvable ou inaccessible : {nouveau}"));
    }
    let app_config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let actuel = config::read(&app_config_dir).map(|c| c.db_folder).unwrap_or_default();
    let mut guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    if meme_dossier(&nouveau, &actuel) {
        return ecrire(conn, CLE_DOSSIER_BASE, &nouveau);
    }
    let cible = Path::new(&nouveau).join(FICHIER_BASE);
    if cible.is_file() {
        verifier_source(&cible)?;
    } else {
        let autres = autres_postes_actifs(conn, &poste.0)?;
        if !autres.is_empty() {
            return Err(format!(
                "Copie impossible : l'app est ouverte sur d'autres postes ({}). Les fermer puis réessayer.",
                autres.join(", ")
            ));
        }
        conn.execute("VACUUM INTO ?1", [cible.to_string_lossy().to_string()])
            .map_err(|e| format!("Échec de la copie de la base vers {nouveau} : {e}"))?;
    }
    // Les deux bases pointent vers le nouveau dossier : les postes encore sur l'ancienne basculent,
    // et la nouvelle ne les renvoie pas en arrière.
    ecrire(conn, CLE_DOSSIER_BASE, &nouveau)?;
    let nouvelle = db::open_at(Path::new(&nouveau));
    ecrire(&nouvelle, CLE_DOSSIER_BASE, &nouveau)?;
    config::write(&app_config_dir, &config::DbConfig { db_folder: nouveau }).map_err(|e| e.to_string())?;
    *guard = Some(nouvelle);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn comparaison_des_dossiers() {
        assert!(meme_dossier(r"S:\Caisses\", r"s:\caisses"));
        assert!(meme_dossier("S:/Caisses", r"S:\Caisses"));
        assert!(!meme_dossier(r"S:\Caisses", r"\\serveur\Caisses"));
    }
}
