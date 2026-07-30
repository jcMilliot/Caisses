use crate::user_config;
use tauri::{AppHandle, Manager};

#[derive(serde::Serialize)]
pub struct UserStatus {
    pub configured: bool,
    pub trigramme: Option<String>,
}

#[tauri::command]
pub fn get_user_status(app: AppHandle) -> Result<UserStatus, String> {
    let app_config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    match user_config::read(&app_config_dir) {
        Some(cfg) => Ok(UserStatus {
            configured: true,
            trigramme: Some(cfg.trigramme),
        }),
        None => Ok(UserStatus {
            configured: false,
            trigramme: None,
        }),
    }
}

#[tauri::command]
pub fn set_trigramme(app: AppHandle, trigramme: String) -> Result<(), String> {
    let trigramme = trigramme.trim().to_uppercase();
    if trigramme.len() != 3 || !trigramme.chars().all(|c| c.is_ascii_alphabetic()) {
        return Err("Le trigramme doit contenir exactement 3 lettres".to_string());
    }
    let app_config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    user_config::write(&app_config_dir, &user_config::UserConfig { trigramme }).map_err(|e| e.to_string())
}
