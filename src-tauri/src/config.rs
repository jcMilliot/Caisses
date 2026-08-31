use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize)]
pub struct DbConfig {
    pub db_folder: String,
}

fn config_file_path(app_config_dir: &Path) -> PathBuf {
    app_config_dir.join("db-location.json")
}

pub fn read(app_config_dir: &Path) -> Option<DbConfig> {
    let data = std::fs::read_to_string(config_file_path(app_config_dir)).ok()?;
    serde_json::from_str(&data).ok()
}

pub fn write(app_config_dir: &Path, cfg: &DbConfig) -> std::io::Result<()> {
    std::fs::create_dir_all(app_config_dir)?;
    let data = serde_json::to_string_pretty(cfg).expect("sérialisation DbConfig infaillible");
    std::fs::write(config_file_path(app_config_dir), data)
}

/// Récupère `db-location.json` depuis un ancien dossier de config (changement
/// d'identifiant d'app, cf. journal 2026-08) si le dossier courant n'en a pas.
/// Best-effort : toute erreur est silencieuse, l'utilisateur retombera sur le
/// choix manuel du dossier au premier lancement.
pub fn migrate_from(old_app_config_dir: &Path, new_app_config_dir: &Path) {
    if read(new_app_config_dir).is_some() {
        return;
    }
    if let Some(cfg) = read(old_app_config_dir) {
        let _ = write(new_app_config_dir, &cfg);
    }
}
