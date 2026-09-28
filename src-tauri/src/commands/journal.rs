use crate::commands::admin::{require_admin, AdminSession};
use crate::db::Db;
use crate::models::JournalEntree;
use rusqlite::Connection;
use tauri::State;

/// Ajoute une entrée au journal d'audit. Best-effort : une erreur d'écriture du journal ne doit
/// jamais faire échouer l'action métier qui l'a déclenchée — on l'ignore silencieusement.
/// À appeler dans la MÊME connexion/transaction que l'action, après son succès.
pub fn journaliser(
    conn: &Connection,
    trigramme: &str,
    action: &str,
    entite: &str,
    entite_id: Option<i64>,
    details: &str,
) {
    let _ = conn.execute(
        "INSERT INTO journal (trigramme, action, entite, entite_id, details) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![trigramme, action, entite, entite_id, details],
    );
}

fn map_row(row: &rusqlite::Row) -> rusqlite::Result<JournalEntree> {
    Ok(JournalEntree {
        id: row.get(0)?,
        horodatage: row.get(1)?,
        trigramme: row.get(2)?,
        action: row.get(3)?,
        entite: row.get(4)?,
        entite_id: row.get(5)?,
        details: row.get(6)?,
    })
}

/// Liste le journal, du plus récent au plus ancien. Réservé à la session admin (page Admin,
/// mot de passe vérifié sur ce poste depuis le lancement).
#[tauri::command]
pub fn list_journal(db: State<Db>, session: State<AdminSession>, limite: Option<i64>) -> Result<Vec<JournalEntree>, String> {
    require_admin(&session)?;
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let limite = limite.unwrap_or(500).clamp(1, 5000);
    let mut stmt = conn
        .prepare(
            "SELECT id, horodatage, trigramme, action, entite, entite_id, details
             FROM journal ORDER BY horodatage DESC, id DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([limite], map_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
