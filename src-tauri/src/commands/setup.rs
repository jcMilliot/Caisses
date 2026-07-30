use crate::config;
use crate::db::{self, Db};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

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

#[tauri::command]
pub fn init_db(app: AppHandle, db: State<Db>) -> Result<(), String> {
    let app_config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let cfg = config::read(&app_config_dir).ok_or("aucun dossier de base configuré")?;
    let conn = db::open_at(std::path::Path::new(&cfg.db_folder));
    *db.0.lock().map_err(|e| e.to_string())? = Some(conn);
    Ok(())
}

#[tauri::command]
pub fn set_db_folder(app: AppHandle, db: State<Db>, folder: String) -> Result<(), String> {
    let app_config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    config::write(
        &app_config_dir,
        &config::DbConfig {
            db_folder: folder.clone(),
        },
    )
    .map_err(|e| e.to_string())?;
    let conn = db::open_at(std::path::Path::new(&folder));
    *db.0.lock().map_err(|e| e.to_string())? = Some(conn);
    Ok(())
}
