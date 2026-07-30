use rusqlite::Connection;
use std::path::Path;
use std::sync::Mutex;

pub struct Db(pub Mutex<Option<Connection>>);

impl Db {
    pub fn empty() -> Self {
        Db(Mutex::new(None))
    }
}

/// Migrations appliquées dans l'ordre, une seule fois chacune (suivies dans `_migrations`).
/// Pour ajouter un changement de schéma : créer `migrations/000N_nom.sql` et l'ajouter ici.
const MIGRATIONS: &[(&str, &str)] = &[
    ("0001_init", include_str!("../../migrations/0001_init.sql")),
    (
        "0002_add_article_ar",
        include_str!("../../migrations/0002_add_article_ar.sql"),
    ),
    (
        "0003_add_caisse_couleur",
        include_str!("../../migrations/0003_add_caisse_couleur.sql"),
    ),
    (
        "0004_add_demande",
        include_str!("../../migrations/0004_add_demande.sql"),
    ),
    (
        "0005_add_demande_validee",
        include_str!("../../migrations/0005_add_demande_validee.sql"),
    ),
    (
        "0006_add_caisse_stock",
        include_str!("../../migrations/0006_add_caisse_stock.sql"),
    ),
    (
        "0007_add_section_lock",
        include_str!("../../migrations/0007_add_section_lock.sql"),
    ),
];

pub fn open_at(db_folder: &Path) -> Connection {
    std::fs::create_dir_all(db_folder).expect("impossible de créer le dossier de données");
    let db_path = db_folder.join("caisses.sqlite3");
    let conn = Connection::open(db_path).expect("impossible d'ouvrir la base SQLite");

    conn.pragma_update(None, "foreign_keys", "ON")
        .expect("impossible d'activer foreign_keys");

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _migrations (
            nom TEXT PRIMARY KEY,
            appliquee_le TEXT NOT NULL DEFAULT (datetime('now'))
        )",
    )
    .expect("impossible de créer la table de suivi des migrations");

    for (nom, sql) in MIGRATIONS {
        let deja_appliquee: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM _migrations WHERE nom = ?1)",
                [nom],
                |row| row.get(0),
            )
            .expect("échec de vérification de la migration");
        if deja_appliquee {
            continue;
        }
        conn.execute_batch(sql)
            .unwrap_or_else(|e| panic!("échec de la migration {nom}: {e}"));
        conn.execute("INSERT INTO _migrations (nom) VALUES (?1)", [nom])
            .expect("impossible d'enregistrer la migration appliquée");
    }

    conn
}
