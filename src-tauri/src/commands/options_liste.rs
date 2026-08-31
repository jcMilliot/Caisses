use crate::commands::locks::require_lock;
use crate::db::Db;
use crate::models::OptionListe;
use tauri::State;

const LISTES_VALIDES: &[&str] = &["moteurs", "module_lineaire", "terminaux"];

fn map_row(row: &rusqlite::Row) -> rusqlite::Result<OptionListe> {
    Ok(OptionListe {
        id: row.get(0)?,
        liste: row.get(1)?,
        valeur: row.get(2)?,
        ordre: row.get(3)?,
    })
}

#[tauri::command]
pub fn list_options_liste(db: State<Db>) -> Result<Vec<OptionListe>, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let mut stmt = conn
        .prepare("SELECT id, liste, valeur, ordre FROM option_liste ORDER BY liste, ordre, id")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_option_liste(
    db: State<Db>,
    liste: String,
    valeur: String,
    trigramme: String,
) -> Result<OptionListe, String> {
    let liste = liste.trim().to_string();
    let valeur = valeur.trim().to_string();
    if !LISTES_VALIDES.contains(&liste.as_str()) {
        return Err(format!("liste inconnue : {liste}"));
    }
    if valeur.is_empty() {
        return Err("la valeur ne peut pas être vide".into());
    }

    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock(conn, "demandes", &trigramme)?;

    let ordre: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(ordre), -1) + 1 FROM option_liste WHERE liste = ?1",
            [&liste],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO option_liste (liste, valeur, ordre) VALUES (?1, ?2, ?3)
         ON CONFLICT(liste, valeur) DO NOTHING",
        rusqlite::params![liste, valeur, ordre],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, liste, valeur, ordre FROM option_liste WHERE liste = ?1 AND valeur = ?2",
        rusqlite::params![liste, valeur],
        map_row,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_option_liste(db: State<Db>, id: i64, trigramme: String) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock(conn, "demandes", &trigramme)?;
    conn.execute("DELETE FROM option_liste WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
