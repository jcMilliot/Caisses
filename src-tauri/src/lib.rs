mod commands;
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
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("impossible de résoudre le dossier de données de l'app");
            app.manage(db::init(app_data_dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
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
