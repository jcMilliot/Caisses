mod commands;
mod config;
mod db;
mod models;
mod user_config;

use commands::affaires::{create_affaire, delete_affaire, list_affaires, update_affaire};
use commands::articles::{
    assign_articles, bulk_create_articles, create_article, delete_article, list_articles,
    update_article,
};
use commands::caisse_stock::{
    create_caisse_stock, delete_caisse_stock, list_caisses_stock, set_caisse_stock_validee, transfer_caisse_stock,
    update_caisse_stock,
};
use commands::caisses::{create_caisse, delete_caisse, link_caisse_demande_caisse, list_caisses, update_caisse};
use commands::demande_caisse::{create_demande_caisse, delete_demande_caisse, list_all_demande_caisses, update_demande_caisse};
use commands::demandes::{
    bulk_create_demandes, create_demande, delete_demande, list_demandes, set_demande_validee,
    update_demande,
};
use commands::locks::{acquire_lock, heartbeat, list_locks, release_lock, request_pen, respond_pen_request};
use commands::setup::{choose_db_folder, get_db_status, init_db, set_db_folder};
use commands::user::{get_user_status, set_trigramme};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Migration one-shot : l'identifiant d'app est passé de
            // `com.xan.caisses` à `com.caisses.app`, ce qui change le dossier
            // %APPDATA%. On récupère la config (dossier BDD + trigramme) de
            // l'ancien emplacement pour éviter de redemander à l'utilisateur.
            if let Ok(new_dir) = app.path().app_config_dir() {
                if let Some(old_dir) = new_dir
                    .parent()
                    .map(|roaming| roaming.join("com.xan.caisses"))
                {
                    if old_dir != new_dir && old_dir.is_dir() {
                        config::migrate_from(&old_dir, &new_dir);
                        user_config::migrate_from(&old_dir, &new_dir);
                    }
                }
            }
            app.manage(db::Db::empty());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_db_status,
            choose_db_folder,
            init_db,
            set_db_folder,
            list_affaires,
            create_affaire,
            update_affaire,
            delete_affaire,
            list_caisses,
            create_caisse,
            update_caisse,
            link_caisse_demande_caisse,
            delete_caisse,
            list_articles,
            create_article,
            bulk_create_articles,
            update_article,
            delete_article,
            assign_articles,
            list_demandes,
            create_demande,
            bulk_create_demandes,
            update_demande,
            delete_demande,
            set_demande_validee,
            list_all_demande_caisses,
            create_demande_caisse,
            update_demande_caisse,
            delete_demande_caisse,
            list_caisses_stock,
            create_caisse_stock,
            update_caisse_stock,
            delete_caisse_stock,
            transfer_caisse_stock,
            set_caisse_stock_validee,
            acquire_lock,
            release_lock,
            heartbeat,
            request_pen,
            respond_pen_request,
            list_locks,
            get_user_status,
            set_trigramme,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
