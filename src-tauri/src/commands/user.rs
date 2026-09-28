use crate::commands::admin::{self, AdminSession};
use crate::db::Db;
use crate::user_config;
use tauri::{AppHandle, Manager, State};

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

/// Enregistre le trigramme du poste. Un trigramme protégé (AJC, ou tout trigramme ayant un
/// compte) exige son mot de passe — créé au premier choix pour AJC — et ouvre alors la session
/// admin pour ce lancement.
#[tauri::command]
pub async fn set_trigramme(
    app: AppHandle,
    db: State<'_, Db>,
    session: State<'_, AdminSession>,
    trigramme: String,
    mot_de_passe: Option<String>,
) -> Result<(), String> {
    let trigramme = trigramme.trim().to_uppercase();
    if trigramme.len() != 3 || !trigramme.chars().all(|c| c.is_ascii_alphabetic()) {
        return Err("Le trigramme doit contenir exactement 3 lettres".to_string());
    }
    let protege = {
        let guard = db.0.lock().map_err(|e| e.to_string())?;
        let conn = guard.as_ref().ok_or("base de données non initialisée")?;
        let protege = admin::verifier_ou_creer(conn, &trigramme, mot_de_passe.as_deref())?;
        let _ = admin::noter_connexion(conn, &trigramme);
        protege
    };
    let app_config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    user_config::write(&app_config_dir, &user_config::UserConfig { trigramme: trigramme.clone() })
        .map_err(|e| e.to_string())?;
    if protege {
        *session.0.lock().map_err(|e| e.to_string())? = Some(trigramme);
    }
    Ok(())
}
