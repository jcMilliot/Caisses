use crate::db::Db;
use crate::models::{CaisseStock, NewCaisseStock};
use tauri::State;

fn map_row(row: &rusqlite::Row) -> rusqlite::Result<CaisseStock> {
    Ok(CaisseStock {
        id: row.get(0)?,
        nom: row.get(1)?,
        longueur_mm: row.get(2)?,
        largeur_mm: row.get(3)?,
        hauteur_mm: row.get(4)?,
        quantite: row.get(5)?,
        observations: row.get(6)?,
        affaire_id: row.get(7)?,
        ordre: row.get(8)?,
    })
}

const SELECT_COLS: &str =
    "id, nom, longueur_mm, largeur_mm, hauteur_mm, quantite, observations, affaire_id, ordre";

#[tauri::command]
pub fn list_caisses_stock(db: State<Db>) -> Result<Vec<CaisseStock>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let sql = format!("SELECT {} FROM caisse_stock ORDER BY ordre, id", SELECT_COLS);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_caisse_stock(db: State<Db>, caisse: NewCaisseStock) -> Result<CaisseStock, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let ordre: i64 = conn
        .query_row("SELECT COALESCE(MAX(ordre), -1) + 1 FROM caisse_stock", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO caisse_stock (nom, longueur_mm, largeur_mm, hauteur_mm, quantite, observations, affaire_id, ordre)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            caisse.nom,
            caisse.longueur_mm,
            caisse.largeur_mm,
            caisse.hauteur_mm,
            caisse.quantite,
            caisse.observations,
            caisse.affaire_id,
            ordre,
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let sql = format!("SELECT {} FROM caisse_stock WHERE id = ?1", SELECT_COLS);
    conn.query_row(&sql, [id], map_row).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_caisse_stock(db: State<Db>, id: i64, caisse: NewCaisseStock) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE caisse_stock SET nom = ?1, longueur_mm = ?2, largeur_mm = ?3, hauteur_mm = ?4,
         quantite = ?5, observations = ?6, affaire_id = ?7 WHERE id = ?8",
        rusqlite::params![
            caisse.nom,
            caisse.longueur_mm,
            caisse.largeur_mm,
            caisse.hauteur_mm,
            caisse.quantite,
            caisse.observations,
            caisse.affaire_id,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_caisse_stock(db: State<Db>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM caisse_stock WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
