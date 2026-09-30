use crate::commands::admin::{require_admin, AdminSession};
use crate::commands::backup::{ecrire, lire};
use crate::db::Db;
use tauri::State;

// Textes de la page Documentation modifiés par un administrateur (décision 2026-09-30) : un
// objet JSON { clé: texte } en table `parametre`, qui ne contient que les textes différents du
// contenu par défaut (src/domain/documentation.ts) — une mise à jour du texte par défaut dans le
// code reste donc visible pour tout ce qui n'a pas été modifié.
const CLE_TEXTES: &str = "documentation_textes";

#[tauri::command]
pub fn get_documentation_textes(db: State<Db>) -> Result<String, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    Ok(lire(conn, CLE_TEXTES)?.unwrap_or_else(|| "{}".to_string()))
}

#[tauri::command]
pub fn set_documentation_textes(db: State<Db>, session: State<AdminSession>, textes: String) -> Result<(), String> {
    require_admin(&session)?;
    serde_json::from_str::<std::collections::HashMap<String, String>>(&textes)
        .map_err(|e| format!("Textes invalides : {e}"))?;
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    ecrire(conn, CLE_TEXTES, &textes)
}
