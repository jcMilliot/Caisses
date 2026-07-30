mod commands;
mod config;
mod db;
mod models;

use commands::affaires::{create_affaire, delete_affaire, list_affaires, update_affaire};
use commands::articles::{
    assign_articles, bulk_create_articles, create_article, delete_article, list_articles,
    update_article,
};
use commands::caisse_stock::{
    create_caisse_stock, delete_caisse_stock, list_caisses_stock, update_caisse_stock,
};
use commands::caisses::{create_caisse, delete_caisse, list_caisses, update_caisse};
use commands::demandes::{
    bulk_create_demandes, create_demande, delete_demande, list_demandes, set_demande_validee,
    update_demande,
};
use commands::setup::{choose_db_folder, get_db_status, init_db, set_db_folder};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
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
            list_caisses_stock,
            create_caisse_stock,
            update_caisse_stock,
            delete_caisse_stock,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
