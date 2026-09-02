use crate::commands::locks::require_lock;
use crate::db::Db;
use crate::models::Caisse;
use tauri::State;

fn require_lock_for_caisse(conn: &rusqlite::Connection, caisse_id: i64, trigramme: &str) -> Result<(), String> {
    let affaire_id: i64 = conn
        .query_row("SELECT affaire_id FROM caisse WHERE id = ?1", [caisse_id], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    require_lock(conn, &format!("affaire:{}", affaire_id), trigramme)
}

/// Palette pastel attribuée automatiquement aux nouvelles caisses, dans l'ordre de création.
const PALETTE: &[&str] = &[
    "#dbeafe", "#fde2e2", "#dcfce7", "#fef3c7", "#ede9fe", "#fce7f3", "#e0f2fe", "#fee2d5",
];

fn map_row(row: &rusqlite::Row) -> rusqlite::Result<Caisse> {
    Ok(Caisse {
        id: row.get(0)?,
        affaire_id: row.get(1)?,
        nom: row.get(2)?,
        longueur_mm: row.get(3)?,
        largeur_mm: row.get(4)?,
        hauteur_mm: row.get(5)?,
        seuil_pct: row.get(6)?,
        couleur: row.get(7)?,
        ordre: row.get(8)?,
        caisse_stock_id: row.get(9)?,
        type_envoi_caisse: row.get(10)?,
        demande_caisse_id: row.get(11)?,
        demande_id: row.get(12)?,
    })
}

const SELECT_COLS: &str =
    "id, affaire_id, nom, longueur_mm, largeur_mm, hauteur_mm, seuil_pct, couleur, ordre, caisse_stock_id, type_envoi_caisse, demande_caisse_id, demande_id";

#[tauri::command]
pub fn list_caisses(db: State<Db>, affaire_id: i64) -> Result<Vec<Caisse>, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let sql = format!(
        "SELECT {} FROM caisse WHERE affaire_id = ?1 ORDER BY ordre, id",
        SELECT_COLS
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([affaire_id], map_row)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_caisse(
    db: State<Db>,
    affaire_id: i64,
    nom: String,
    longueur_mm: f64,
    largeur_mm: f64,
    hauteur_mm: f64,
    seuil_pct: Option<f64>,
    caisse_stock_id: Option<i64>,
    type_envoi_caisse: String,
    demande_caisse_id: Option<i64>,
    trigramme: String,
) -> Result<Caisse, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock(conn, &format!("affaire:{}", affaire_id), &trigramme)?;
    let ordre: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(ordre), -1) + 1 FROM caisse WHERE affaire_id = ?1",
            [affaire_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let couleur = PALETTE[(ordre as usize) % PALETTE.len()];
    conn.execute(
        "INSERT INTO caisse (affaire_id, nom, longueur_mm, largeur_mm, hauteur_mm, seuil_pct, couleur, ordre, caisse_stock_id, type_envoi_caisse, demande_caisse_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![
            affaire_id,
            nom,
            longueur_mm,
            largeur_mm,
            hauteur_mm,
            seuil_pct,
            couleur,
            ordre,
            caisse_stock_id,
            type_envoi_caisse,
            demande_caisse_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let sql = format!("SELECT {} FROM caisse WHERE id = ?1", SELECT_COLS);
    conn.query_row(&sql, [id], map_row).map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_caisse(
    db: State<Db>,
    id: i64,
    nom: String,
    longueur_mm: f64,
    largeur_mm: f64,
    hauteur_mm: f64,
    seuil_pct: Option<f64>,
    couleur: String,
    type_envoi_caisse: String,
    trigramme: String,
) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock_for_caisse(conn, id, &trigramme)?;
    conn.execute(
        "UPDATE caisse SET nom = ?1, longueur_mm = ?2, largeur_mm = ?3, hauteur_mm = ?4, seuil_pct = ?5, couleur = ?6, type_envoi_caisse = ?7
         WHERE id = ?8",
        rusqlite::params![nom, longueur_mm, largeur_mm, hauteur_mm, seuil_pct, couleur, type_envoi_caisse, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Pose a posteriori le lien vers la DemandeCaisse issue d'une synchro Simulations -> Demandes
/// (création manuelle d'une Caisse, confirmée pour être répercutée côté Demandes). Ne sert qu'à
/// cette liaison ponctuelle — le lien n'est jamais modifié une fois posé.
#[tauri::command]
pub fn link_caisse_demande_caisse(db: State<Db>, id: i64, demande_caisse_id: i64, trigramme: String) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock_for_caisse(conn, id, &trigramme)?;
    conn.execute(
        "UPDATE caisse SET demande_caisse_id = ?1 WHERE id = ?2",
        rusqlite::params![demande_caisse_id, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Lie la caisse "mère" d'une simulation à la ligne de demande dont elle est issue — pour que
/// la synchro bidirectionnelle des dimensions reste fiable même si la caisse est renommée dans
/// Simulations. Idempotent (on peut le rappeler sans effet si le lien est déjà bon).
#[tauri::command]
pub fn link_caisse_demande(db: State<Db>, id: i64, demande_id: i64, trigramme: String) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock_for_caisse(conn, id, &trigramme)?;
    conn.execute(
        "UPDATE caisse SET demande_id = ?1 WHERE id = ?2",
        rusqlite::params![demande_id, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_caisse(db: State<Db>, id: i64, trigramme: String) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock_for_caisse(conn, id, &trigramme)?;
    conn.execute("DELETE FROM caisse WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
