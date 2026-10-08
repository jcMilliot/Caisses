// Identité du poste : depuis le 2026-10-08, elle vient du compte intranet (connexion dans
// commands/intranet.rs) et reste mémorisée dans `user-identity.json` pour un démarrage hors ligne.
use crate::user_config;
use tauri::{AppHandle, Manager};

/// Dernière identité connue du poste (trigramme, ou identifiant intranet pour un compte sans
/// trigramme), `None` si personne ne s'est encore connecté sur ce poste.
pub fn identite_du_poste(app: &AppHandle) -> Result<Option<String>, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(user_config::read(&dir).map(|c| c.trigramme))
}

pub fn enregistrer_identite(app: &AppHandle, trigramme: &str) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    user_config::write(&dir, &user_config::UserConfig { trigramme: trigramme.to_string() }).map_err(|e| e.to_string())
}
