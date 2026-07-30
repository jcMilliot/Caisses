use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize)]
pub struct UserConfig {
    pub trigramme: String,
}

fn config_file_path(app_config_dir: &Path) -> PathBuf {
    app_config_dir.join("user-identity.json")
}

pub fn read(app_config_dir: &Path) -> Option<UserConfig> {
    let data = std::fs::read_to_string(config_file_path(app_config_dir)).ok()?;
    serde_json::from_str(&data).ok()
}

pub fn write(app_config_dir: &Path, cfg: &UserConfig) -> std::io::Result<()> {
    std::fs::create_dir_all(app_config_dir)?;
    let data = serde_json::to_string_pretty(cfg).expect("sérialisation UserConfig infaillible");
    std::fs::write(config_file_path(app_config_dir), data)
}
