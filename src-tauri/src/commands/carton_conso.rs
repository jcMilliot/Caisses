use crate::commands::locks::require_lock;
use crate::db::Db;
use crate::models::{CartonConso, ColisAffaire, NewCartonConso};
use tauri::State;

// Cartons consommables en stock (onglet « Cartons conso » de Conso en stock, 2026-10-14) : liste
// de référence, sans affectation, pour la future simulation avec colis. Même verrou que l'onglet
// Caisses en stock (la page entière).

const PREFIXE_NOM: &str = "AR_RAJA__";

/// Nom au format « AR_RAJA__XXXXX » (5 lettres ou chiffres) — même règle que
/// `src/domain/cartonConso.ts::nomCartonValide`.
fn nom_valide(nom: &str) -> bool {
    match nom.strip_prefix(PREFIXE_NOM) {
        Some(suite) => suite.len() == 5 && suite.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()),
        None => false,
    }
}

// Normalise le nom (majuscules, espaces retirés) puis vérifie les champs obligatoires : nom,
// dimensions intérieures et extérieures. Poids facultatif.
fn verifier_carton(carton: &NewCartonConso) -> Result<String, String> {
    let nom = carton.nom.trim().to_uppercase();
    if !nom_valide(&nom) {
        return Err(format!("Le nom du carton doit être au format « {PREFIXE_NOM}XXXXX »."));
    }
    if carton.longueur_mm <= 0.0 || carton.largeur_mm <= 0.0 || carton.hauteur_mm <= 0.0 {
        return Err("Les dimensions intérieures du carton sont obligatoires.".to_string());
    }
    if carton.ext_longueur_mm <= 0.0 || carton.ext_largeur_mm <= 0.0 || carton.ext_hauteur_mm <= 0.0 {
        return Err("Les dimensions extérieures du carton sont obligatoires.".to_string());
    }
    if carton.poids_kg < 0.0 {
        return Err("Le poids du carton ne peut pas être négatif.".to_string());
    }
    Ok(nom)
}

fn erreur_sql(e: rusqlite::Error, nom: &str) -> String {
    match e {
        rusqlite::Error::SqliteFailure(err, _) if err.code == rusqlite::ErrorCode::ConstraintViolation => {
            format!("Un carton « {nom} » existe déjà.")
        }
        e => e.to_string(),
    }
}

const SELECT_COLS: &str =
    "id, nom, longueur_mm, largeur_mm, hauteur_mm, ext_longueur_mm, ext_largeur_mm, ext_hauteur_mm, poids_kg, ordre";

fn map_row(row: &rusqlite::Row) -> rusqlite::Result<CartonConso> {
    Ok(CartonConso {
        id: row.get(0)?,
        nom: row.get(1)?,
        longueur_mm: row.get(2)?,
        largeur_mm: row.get(3)?,
        hauteur_mm: row.get(4)?,
        ext_longueur_mm: row.get(5)?,
        ext_largeur_mm: row.get(6)?,
        ext_hauteur_mm: row.get(7)?,
        poids_kg: row.get(8)?,
        ordre: row.get(9)?,
    })
}

#[tauri::command]
pub fn list_cartons_conso(db: State<Db>) -> Result<Vec<CartonConso>, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let mut stmt = conn
        .prepare(&format!("SELECT {SELECT_COLS} FROM carton_conso ORDER BY nom"))
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn creer(conn: &rusqlite::Connection, carton: &NewCartonConso, trigramme: &str) -> Result<CartonConso, String> {
    require_lock(conn, "stock", trigramme)?;
    let nom = verifier_carton(carton)?;
    conn.execute(
        "INSERT INTO carton_conso (nom, longueur_mm, largeur_mm, hauteur_mm, ext_longueur_mm, ext_largeur_mm, ext_hauteur_mm, poids_kg, ordre)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, (SELECT COALESCE(MAX(ordre), -1) + 1 FROM carton_conso))",
        rusqlite::params![
            nom,
            carton.longueur_mm,
            carton.largeur_mm,
            carton.hauteur_mm,
            carton.ext_longueur_mm,
            carton.ext_largeur_mm,
            carton.ext_hauteur_mm,
            carton.poids_kg,
        ],
    )
    .map_err(|e| erreur_sql(e, &nom))?;
    let id = conn.last_insert_rowid();
    conn.query_row(&format!("SELECT {SELECT_COLS} FROM carton_conso WHERE id = ?1"), [id], map_row)
        .map_err(|e| e.to_string())
}

fn modifier(conn: &rusqlite::Connection, id: i64, carton: &NewCartonConso, trigramme: &str) -> Result<(), String> {
    require_lock(conn, "stock", trigramme)?;
    let nom = verifier_carton(carton)?;
    conn.execute(
        "UPDATE carton_conso SET nom = ?1, longueur_mm = ?2, largeur_mm = ?3, hauteur_mm = ?4,
         ext_longueur_mm = ?5, ext_largeur_mm = ?6, ext_hauteur_mm = ?7, poids_kg = ?8 WHERE id = ?9",
        rusqlite::params![
            nom,
            carton.longueur_mm,
            carton.largeur_mm,
            carton.hauteur_mm,
            carton.ext_longueur_mm,
            carton.ext_largeur_mm,
            carton.ext_hauteur_mm,
            carton.poids_kg,
            id,
        ],
    )
    .map_err(|e| erreur_sql(e, &nom))?;
    Ok(())
}

#[tauri::command]
pub fn create_carton_conso(db: State<Db>, carton: NewCartonConso, trigramme: String) -> Result<CartonConso, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    creer(conn, &carton, &trigramme)
}

#[tauri::command]
pub fn update_carton_conso(db: State<Db>, id: i64, carton: NewCartonConso, trigramme: String) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    modifier(conn, id, &carton, &trigramme)
}

#[tauri::command]
pub fn delete_carton_conso(db: State<Db>, id: i64, trigramme: String) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock(conn, "stock", &trigramme)?;
    conn.execute("DELETE FROM carton_conso WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

/// Cartons choisis pour les colis de l'affaire (onglet Colisage de Simulations).
#[tauri::command]
pub fn list_colis_affaire(db: State<Db>, affaire_id: i64) -> Result<Vec<ColisAffaire>, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let mut stmt = conn
        .prepare(
            "SELECT tag, carton_conso_id, libre_longueur_mm, libre_largeur_mm, libre_hauteur_mm, libre_poids_kg
             FROM colis_affaire WHERE affaire_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([affaire_id], |r| {
            Ok(ColisAffaire {
                tag: r.get(0)?,
                carton_conso_id: r.get(1)?,
                libre_longueur_mm: r.get(2)?,
                libre_largeur_mm: r.get(3)?,
                libre_hauteur_mm: r.get(4)?,
                libre_poids_kg: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn choisir_carton(conn: &rusqlite::Connection, affaire_id: i64, tag: &str, carton_conso_id: Option<i64>, trigramme: &str) -> Result<(), String> {
    require_lock(conn, &format!("affaire:{affaire_id}"), trigramme)?;
    match carton_conso_id {
        Some(carton) => conn.execute(
            "INSERT INTO colis_affaire (affaire_id, tag, carton_conso_id) VALUES (?1, ?2, ?3)
             ON CONFLICT(affaire_id, tag) DO UPDATE SET carton_conso_id = excluded.carton_conso_id,
                 libre_longueur_mm = 0, libre_largeur_mm = 0, libre_hauteur_mm = 0, libre_poids_kg = 0",
            rusqlite::params![affaire_id, tag, carton],
        ),
        None => conn.execute(
            "DELETE FROM colis_affaire WHERE affaire_id = ?1 AND tag = ?2",
            rusqlite::params![affaire_id, tag],
        ),
    }
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Carton libre (récup, non géré dans Conso en stock) pour un colis : dimensions extérieures
/// obligatoires, poids facultatif (2026-10-15).
fn choisir_carton_libre(
    conn: &rusqlite::Connection,
    affaire_id: i64,
    tag: &str,
    dims: [f64; 3],
    poids_kg: f64,
    trigramme: &str,
) -> Result<(), String> {
    require_lock(conn, &format!("affaire:{affaire_id}"), trigramme)?;
    if dims.iter().any(|d| *d <= 0.0) {
        return Err("Les dimensions extérieures du carton libre sont obligatoires.".to_string());
    }
    conn.execute(
        "INSERT INTO colis_affaire (affaire_id, tag, carton_conso_id, libre_longueur_mm, libre_largeur_mm, libre_hauteur_mm, libre_poids_kg)
         VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6)
         ON CONFLICT(affaire_id, tag) DO UPDATE SET carton_conso_id = NULL, libre_longueur_mm = excluded.libre_longueur_mm,
             libre_largeur_mm = excluded.libre_largeur_mm, libre_hauteur_mm = excluded.libre_hauteur_mm,
             libre_poids_kg = excluded.libre_poids_kg",
        rusqlite::params![affaire_id, tag, dims[0], dims[1], dims[2], poids_kg.max(0.0)],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_colis_carton_libre(
    db: State<Db>,
    affaire_id: i64,
    tag: String,
    longueur_mm: f64,
    largeur_mm: f64,
    hauteur_mm: f64,
    poids_kg: f64,
    trigramme: String,
) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    choisir_carton_libre(conn, affaire_id, &tag, [longueur_mm, largeur_mm, hauteur_mm], poids_kg, &trigramme)
}

/// Choisit (ou retire, `None`) le carton d'un colis de l'affaire.
#[tauri::command]
pub fn set_colis_carton(
    db: State<Db>,
    affaire_id: i64,
    tag: String,
    carton_conso_id: Option<i64>,
    trigramme: String,
) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    choisir_carton(conn, affaire_id, &tag, carton_conso_id, &trigramme)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn carton(nom: &str) -> NewCartonConso {
        NewCartonConso {
            nom: nom.to_string(),
            longueur_mm: 400.0,
            largeur_mm: 300.0,
            hauteur_mm: 200.0,
            ext_longueur_mm: 410.0,
            ext_largeur_mm: 310.0,
            ext_hauteur_mm: 210.0,
            poids_kg: 0.0,
        }
    }

    #[test]
    fn creation_format_unicite_dimensions() {
        let dir = std::env::temp_dir().join(format!("caisses-test-carton-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let conn = crate::db::open_at(&dir);

        // Nom normalisé en majuscules.
        let c = creer(&conn, &carton(" ar_raja__00012 "), "AJC").unwrap();
        assert_eq!(c.nom, "AR_RAJA__00012");
        // Format refusé.
        assert!(creer(&conn, &carton("AR_RAJA_00013"), "AJC").is_err());
        assert!(creer(&conn, &carton("AR_RAJA__0001"), "AJC").is_err());
        assert!(creer(&conn, &carton("CARTON"), "AJC").is_err());
        // Doublon refusé (casse ignorée).
        let err = creer(&conn, &carton("AR_RAJA__00012"), "AJC").unwrap_err();
        assert!(err.contains("existe déjà"), "{err}");
        // Dimensions extérieures obligatoires.
        let mut sans_ext = carton("AR_RAJA__00014");
        sans_ext.ext_hauteur_mm = 0.0;
        assert!(creer(&conn, &sans_ext, "AJC").is_err());

        // Modification, y compris vers un nom déjà pris.
        let autre = creer(&conn, &carton("AR_RAJA__00015"), "AJC").unwrap();
        let mut m = carton("AR_RAJA__00015");
        m.poids_kg = 0.35;
        modifier(&conn, autre.id, &m, "AJC").unwrap();
        assert!(modifier(&conn, autre.id, &carton("AR_RAJA__00012"), "AJC").is_err());

        // Carton d'un colis : choisi, remplacé, puis supprimé de Conso en stock → choix retiré.
        conn.execute("INSERT INTO affaire (id, nom, seuil_defaut) VALUES (1, 'AFFAIRE1', 70)", []).unwrap();
        choisir_carton(&conn, 1, "2", Some(c.id), "AJC").unwrap();
        choisir_carton(&conn, 1, "2", Some(autre.id), "AJC").unwrap();
        let choisi: i64 = conn.query_row("SELECT carton_conso_id FROM colis_affaire WHERE tag = '2'", [], |r| r.get(0)).unwrap();
        assert_eq!(choisi, autre.id);
        conn.execute("DELETE FROM carton_conso WHERE id = ?1", [autre.id]).unwrap();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM colis_affaire", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0);
        choisir_carton(&conn, 1, "3", Some(c.id), "AJC").unwrap();
        choisir_carton(&conn, 1, "3", None, "AJC").unwrap();

        // Carton libre : dimensions obligatoires ; remplace un carton conso et inversement ; non
        // touché par la suppression d'un carton conso.
        assert!(choisir_carton_libre(&conn, 1, "4", [300.0, 0.0, 200.0], 0.0, "AJC").is_err());
        choisir_carton(&conn, 1, "4", Some(c.id), "AJC").unwrap();
        choisir_carton_libre(&conn, 1, "4", [300.0, 250.0, 200.0], 0.4, "AJC").unwrap();
        let (conso, l): (Option<i64>, f64) = conn
            .query_row("SELECT carton_conso_id, libre_longueur_mm FROM colis_affaire WHERE tag = '4'", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!((conso, l), (None, 300.0));
        conn.execute("DELETE FROM carton_conso WHERE id = ?1", [c.id]).unwrap();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM colis_affaire", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
        choisir_carton(&conn, 1, "4", None, "AJC").unwrap();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM colis_affaire", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0);

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
