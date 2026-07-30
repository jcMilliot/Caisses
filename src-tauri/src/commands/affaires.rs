use crate::db::Db;
use crate::models::Affaire;
use tauri::State;

#[tauri::command]
pub fn list_affaires(db: State<Db>) -> Result<Vec<Affaire>, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let mut stmt = conn
        .prepare("SELECT id, nom, date_creation, seuil_defaut FROM affaire ORDER BY date_creation DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Affaire {
                id: row.get(0)?,
                nom: row.get(1)?,
                date_creation: row.get(2)?,
                seuil_defaut: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_affaire(db: State<Db>, nom: String, seuil_defaut: f64) -> Result<Affaire, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    conn.execute(
        "INSERT INTO affaire (nom, seuil_defaut) VALUES (?1, ?2)",
        rusqlite::params![nom, seuil_defaut],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, nom, date_creation, seuil_defaut FROM affaire WHERE id = ?1",
        [id],
        |row| {
            Ok(Affaire {
                id: row.get(0)?,
                nom: row.get(1)?,
                date_creation: row.get(2)?,
                seuil_defaut: row.get(3)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_affaire(
    db: State<Db>,
    id: i64,
    nom: String,
    seuil_defaut: f64,
) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    conn.execute(
        "UPDATE affaire SET nom = ?1, seuil_defaut = ?2 WHERE id = ?3",
        rusqlite::params![nom, seuil_defaut, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_affaire(db: State<Db>, id: i64) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    conn.execute("DELETE FROM affaire WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
