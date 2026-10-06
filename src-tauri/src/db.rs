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
    (
        "0008_add_demande_caisse",
        include_str!("../../migrations/0008_add_demande_caisse.sql"),
    ),
    (
        "0009_add_demande_caisse_traitement",
        include_str!("../../migrations/0009_add_demande_caisse_traitement.sql"),
    ),
    (
        "0010_add_demande_caisse_champs_supplementaires",
        include_str!("../../migrations/0010_add_demande_caisse_champs_supplementaires.sql"),
    ),
    (
        "0011_add_caisse_stock_links",
        include_str!("../../migrations/0011_add_caisse_stock_links.sql"),
    ),
    (
        "0012_add_caisse_stock_validee_et_reaffectation",
        include_str!("../../migrations/0012_add_caisse_stock_validee_et_reaffectation.sql"),
    ),
    (
        "0013_add_caisse_stock_demande_cible",
        include_str!("../../migrations/0013_add_caisse_stock_demande_cible.sql"),
    ),
    (
        "0014_add_caisse_type_envoi_et_demande_caisse_id",
        include_str!("../../migrations/0014_add_caisse_type_envoi_et_demande_caisse_id.sql"),
    ),
    (
        "0015_add_contre_plaque",
        include_str!("../../migrations/0015_add_contre_plaque.sql"),
    ),
    (
        "0016_add_option_liste",
        include_str!("../../migrations/0016_add_option_liste.sql"),
    ),
    (
        "0017_seed_option_liste",
        include_str!("../../migrations/0017_seed_option_liste.sql"),
    ),
    (
        "0018_seed_modules_lineaires",
        include_str!("../../migrations/0018_seed_modules_lineaires.sql"),
    ),
    (
        "0019_add_journal",
        include_str!("../../migrations/0019_add_journal.sql"),
    ),
    (
        "0020_add_caisse_demande_id",
        include_str!("../../migrations/0020_add_caisse_demande_id.sql"),
    ),
    (
        "0021_add_demande_caisse_terminaux",
        include_str!("../../migrations/0021_add_demande_caisse_terminaux.sql"),
    ),
    (
        "0022_add_compte_utilisateur_parametre",
        include_str!("../../migrations/0022_add_compte_utilisateur_parametre.sql"),
    ),
    (
        "0023_add_poste_actif",
        include_str!("../../migrations/0023_add_poste_actif.sql"),
    ),
    (
        "0024_add_caisse_stock_type_ouverture",
        include_str!("../../migrations/0024_add_caisse_stock_type_ouverture.sql"),
    ),
    (
        "0025_ouverture_4c_par_dessus",
        include_str!("../../migrations/0025_ouverture_4c_par_dessus.sql"),
    ),
    (
        "0026_add_demande_ok_cde_par",
        include_str!("../../migrations/0026_add_demande_ok_cde_par.sql"),
    ),
    (
        "0027_seuil_general",
        include_str!("../../migrations/0027_seuil_general.sql"),
    ),
    (
        "0028_add_utilisateur_role",
        include_str!("../../migrations/0028_add_utilisateur_role.sql"),
    ),
    (
        "0029_add_article_non_colle",
        include_str!("../../migrations/0029_add_article_non_colle.sql"),
    ),
    (
        "0030_add_compte_code_secours",
        include_str!("../../migrations/0030_add_compte_code_secours.sql"),
    ),
    (
        "0031_add_suivi_stock_ar_caiss",
        include_str!("../../migrations/0031_add_suivi_stock_ar_caiss.sql"),
    ),
    (
        "0032_type_envoi_mer_4c",
        include_str!("../../migrations/0032_type_envoi_mer_4c.sql"),
    ),
    (
        "0033_add_caisse_stock_matiere",
        include_str!("../../migrations/0033_add_caisse_stock_matiere.sql"),
    ),
    (
        "0034_lier_caisses_meres",
        include_str!("../../migrations/0034_lier_caisses_meres.sql"),
    ),
    (
        "0035_add_caisse_stock_dims_exterieures",
        include_str!("../../migrations/0035_add_caisse_stock_dims_exterieures.sql"),
    ),
];

pub fn open_at(db_folder: &Path) -> Connection {
    std::fs::create_dir_all(db_folder).expect("impossible de créer le dossier de données");
    let db_path = db_folder.join("caisses.sqlite3");
    let conn = Connection::open(db_path).expect("impossible d'ouvrir la base SQLite");

    conn.pragma_update(None, "foreign_keys", "ON")
        .expect("impossible d'activer foreign_keys");

    appliquer_migrations(&conn).unwrap_or_else(|e| panic!("{e}"));

    // Purge du journal d'audit au démarrage (le trigger AFTER INSERT couvre le cas courant ;
    // ceci gère une base restée longtemps sans écriture). Ignoré si la table n'existe pas encore.
    let _ = conn.execute("DELETE FROM journal WHERE horodatage < datetime('now', '-2 months')", []);

    conn
}

/// Applique les migrations absentes de `_migrations`. Appelé à l'ouverture de la base, et après
/// la restauration d'une sauvegarde (qui peut dater d'un schéma plus ancien).
pub fn appliquer_migrations(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _migrations (
            nom TEXT PRIMARY KEY,
            appliquee_le TEXT NOT NULL DEFAULT (datetime('now'))
        )",
    )
    .map_err(|e| format!("impossible de créer la table de suivi des migrations : {e}"))?;

    for (nom, sql) in MIGRATIONS {
        let deja_appliquee: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM _migrations WHERE nom = ?1)",
                [nom],
                |row| row.get(0),
            )
            .map_err(|e| format!("échec de vérification de la migration {nom} : {e}"))?;
        if deja_appliquee {
            continue;
        }
        conn.execute_batch(sql)
            .map_err(|e| format!("échec de la migration {nom} : {e}"))?;
        conn.execute("INSERT INTO _migrations (nom) VALUES (?1)", [nom])
            .map_err(|e| format!("impossible d'enregistrer la migration {nom} : {e}"))?;
    }
    Ok(())
}
