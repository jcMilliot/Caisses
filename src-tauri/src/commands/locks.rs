use crate::db::Db;
use crate::models::SectionLock;
use tauri::State;

/// Refuse l'action seulement si `section_key` est activement détenue par un AUTRE titulaire
/// que `trigramme` (verrou non expiré). Absence de verrou ou verrou expiré = libre, autorisé —
/// cohérent avec le fait qu'une ressource jamais ouverte par ce poste (ex: suppression d'une
/// affaire depuis AffairesList, sans passer par AffaireDetail) n'a pas encore de verrou à elle.
pub fn require_lock(conn: &rusqlite::Connection, section_key: &str, trigramme: &str) -> Result<(), String> {
    let sql = format!("SELECT {} FROM section_lock WHERE section_key = ?1", SELECT_COLS);
    let result = conn.query_row(&sql, [section_key], map_row);
    match result {
        Ok(lock) if lock.titulaire != trigramme && !lock.expire => Err(format!(
            "« {} » est actuellement verrouillée par {} — action refusée.",
            section_key, lock.titulaire
        )),
        _ => Ok(()),
    }
}

const SELECT_COLS: &str = "section_key, titulaire, acquis_le, dernier_battement, demandeur, demande_le, demande_statut,
    (julianday('now') - julianday(dernier_battement)) * 1440 >= 5 AS expire";

fn map_row(row: &rusqlite::Row) -> rusqlite::Result<SectionLock> {
    Ok(SectionLock {
        section_key: row.get(0)?,
        titulaire: row.get(1)?,
        acquis_le: row.get(2)?,
        dernier_battement: row.get(3)?,
        demandeur: row.get(4)?,
        demande_le: row.get(5)?,
        demande_statut: row.get(6)?,
        expire: row.get(7)?,
    })
}

#[tauri::command]
pub fn acquire_lock(db: State<Db>, section_key: String, trigramme: String) -> Result<SectionLock, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    conn.execute(
        "INSERT INTO section_lock (section_key, titulaire, acquis_le, dernier_battement)
         VALUES (?1, ?2, datetime('now'), datetime('now'))
         ON CONFLICT(section_key) DO UPDATE SET
             titulaire = excluded.titulaire,
             acquis_le = datetime('now'),
             dernier_battement = datetime('now'),
             demandeur = NULL, demande_le = NULL, demande_statut = 'aucune'
         WHERE section_lock.titulaire = excluded.titulaire
            OR (julianday('now') - julianday(section_lock.dernier_battement)) * 1440 >= 5",
        rusqlite::params![section_key, trigramme],
    )
    .map_err(|e| e.to_string())?;

    let sql = format!("SELECT {} FROM section_lock WHERE section_key = ?1", SELECT_COLS);
    conn.query_row(&sql, [&section_key], map_row).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn release_lock(db: State<Db>, section_key: String, trigramme: String) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    conn.execute(
        "DELETE FROM section_lock WHERE section_key = ?1 AND titulaire = ?2",
        rusqlite::params![section_key, trigramme],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn heartbeat(
    db: State<Db>,
    section_key: String,
    trigramme: String,
    renew: bool,
) -> Result<Option<SectionLock>, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;

    if renew {
        conn.execute(
            "UPDATE section_lock SET dernier_battement = datetime('now')
             WHERE section_key = ?1 AND titulaire = ?2",
            rusqlite::params![section_key, trigramme],
        )
        .map_err(|e| e.to_string())?;
    }

    let sql = format!("SELECT {} FROM section_lock WHERE section_key = ?1", SELECT_COLS);
    let result = conn.query_row(&sql, [&section_key], map_row);
    match result {
        Ok(lock) => Ok(Some(lock)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn request_pen(db: State<Db>, section_key: String, trigramme: String) -> Result<bool, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let affected = conn
        .execute(
            "UPDATE section_lock SET demandeur = ?2, demande_le = datetime('now'), demande_statut = 'en_attente'
             WHERE section_key = ?1 AND titulaire != ?2 AND demande_statut != 'en_attente'",
            rusqlite::params![section_key, trigramme],
        )
        .map_err(|e| e.to_string())?;
    Ok(affected > 0)
}

#[tauri::command]
pub fn respond_pen_request(
    db: State<Db>,
    section_key: String,
    trigramme: String,
    approve: bool,
) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    if approve {
        conn.execute(
            "UPDATE section_lock SET
                 titulaire = demandeur,
                 acquis_le = datetime('now'),
                 dernier_battement = datetime('now'),
                 demandeur = NULL, demande_le = NULL, demande_statut = 'aucune'
             WHERE section_key = ?1 AND titulaire = ?2 AND demandeur IS NOT NULL",
            rusqlite::params![section_key, trigramme],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "UPDATE section_lock SET demande_statut = 'refusee' WHERE section_key = ?1 AND titulaire = ?2",
            rusqlite::params![section_key, trigramme],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn list_locks(db: State<Db>) -> Result<Vec<SectionLock>, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let sql = format!("SELECT {} FROM section_lock", SELECT_COLS);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
