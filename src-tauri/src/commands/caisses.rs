use crate::db::Db;
use crate::models::Caisse;
use tauri::State;

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
    })
}

const SELECT_COLS: &str =
    "id, affaire_id, nom, longueur_mm, largeur_mm, hauteur_mm, seuil_pct, couleur, ordre";

#[tauri::command]
pub fn list_caisses(db: State<Db>, affaire_id: i64) -> Result<Vec<Caisse>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
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
pub fn create_caisse(
    db: State<Db>,
    affaire_id: i64,
    nom: String,
    longueur_mm: f64,
    largeur_mm: f64,
    hauteur_mm: f64,
    seuil_pct: Option<f64>,
) -> Result<Caisse, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let ordre: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(ordre), -1) + 1 FROM caisse WHERE affaire_id = ?1",
            [affaire_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let couleur = PALETTE[(ordre as usize) % PALETTE.len()];
    conn.execute(
        "INSERT INTO caisse (affaire_id, nom, longueur_mm, largeur_mm, hauteur_mm, seuil_pct, couleur, ordre)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![affaire_id, nom, longueur_mm, largeur_mm, hauteur_mm, seuil_pct, couleur, ordre],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let sql = format!("SELECT {} FROM caisse WHERE id = ?1", SELECT_COLS);
    conn.query_row(&sql, [id], map_row).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_caisse(
    db: State<Db>,
    id: i64,
    nom: String,
    longueur_mm: f64,
    largeur_mm: f64,
    hauteur_mm: f64,
    seuil_pct: Option<f64>,
    couleur: String,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE caisse SET nom = ?1, longueur_mm = ?2, largeur_mm = ?3, hauteur_mm = ?4, seuil_pct = ?5, couleur = ?6
         WHERE id = ?7",
        rusqlite::params![nom, longueur_mm, largeur_mm, hauteur_mm, seuil_pct, couleur, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_caisse(db: State<Db>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM caisse WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
