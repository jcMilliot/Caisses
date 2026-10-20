use crate::commands::locks::require_lock;
use crate::db::Db;
use crate::models::DemandeAlerte;
use tauri::State;

// Page « Alertes » (2026-10-19) : date d'expédition anticipée + commentaire par ligne mère de
// Gestion des caisses. La date anticipée remplace la date de picking pour l'alerte « À
// commander », « à commander / à rapatrier cette semaine » (calcul côté frontend,
// `domain/caissesACommander.ts`). Verrou propre « alertes », indépendant de « demandes ».

/// '' ou AAAA-MM-JJ.
fn date_valide(date: &str) -> bool {
    if date.is_empty() {
        return true;
    }
    let b = date.as_bytes();
    b.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && b.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
}

#[tauri::command]
pub fn list_demande_alertes(db: State<Db>) -> Result<Vec<DemandeAlerte>, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    lister(conn)
}

fn lister(conn: &rusqlite::Connection) -> Result<Vec<DemandeAlerte>, String> {
    let mut stmt = conn
        .prepare("SELECT demande_id, date_anticipee, commentaire FROM demande_alerte")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(DemandeAlerte { demande_id: row.get(0)?, date_anticipee: row.get(1)?, commentaire: row.get(2)? })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

// Date et commentaire vides → la ligne est supprimée (pas de ligne = rien de saisi).
fn enregistrer(
    conn: &rusqlite::Connection,
    demande_id: i64,
    date_anticipee: &str,
    commentaire: &str,
    trigramme: &str,
) -> Result<(), String> {
    require_lock(conn, "alertes", trigramme)?;
    let date = date_anticipee.trim();
    if !date_valide(date) {
        return Err(format!("Date anticipée invalide : « {date} »."));
    }
    let commentaire = commentaire.trim();
    if date.is_empty() && commentaire.is_empty() {
        conn.execute("DELETE FROM demande_alerte WHERE demande_id = ?1", [demande_id])
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    conn.execute(
        "INSERT INTO demande_alerte (demande_id, date_anticipee, commentaire) VALUES (?1, ?2, ?3)
         ON CONFLICT(demande_id) DO UPDATE SET date_anticipee = excluded.date_anticipee, commentaire = excluded.commentaire",
        rusqlite::params![demande_id, date, commentaire],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_demande_alerte(
    db: State<Db>,
    demande_id: i64,
    date_anticipee: String,
    commentaire: String,
    trigramme: String,
) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    enregistrer(conn, demande_id, &date_anticipee, &commentaire, &trigramme)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enregistrement_effacement_suppression_demande() {
        let dir = std::env::temp_dir().join(format!("caisses-test-alerte-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let conn = crate::db::open_at(&dir);
        conn.execute("INSERT INTO demande (id, affaire) VALUES (1, 'AFFAIRE1')", []).unwrap();

        enregistrer(&conn, 1, "2026-11-02", "", "AJC").unwrap();
        enregistrer(&conn, 1, "2026-11-02", " client pressé ", "AJC").unwrap();
        let a = lister(&conn).unwrap();
        assert_eq!(a.len(), 1);
        assert_eq!((a[0].date_anticipee.as_str(), a[0].commentaire.as_str()), ("2026-11-02", "client pressé"));

        // Date mal formée refusée.
        assert!(enregistrer(&conn, 1, "02/11/2026", "", "AJC").is_err());

        // Tout vidé → plus de ligne.
        enregistrer(&conn, 1, "", "", "AJC").unwrap();
        assert!(lister(&conn).unwrap().is_empty());

        // Verrou pris par un autre poste → refusé.
        conn.execute(
            "INSERT INTO section_lock (section_key, titulaire, acquis_le, dernier_battement)
             VALUES ('alertes', 'FBA', datetime('now'), datetime('now'))",
            [],
        )
        .unwrap();
        assert!(enregistrer(&conn, 1, "2026-11-02", "", "AJC").is_err());
        enregistrer(&conn, 1, "2026-11-02", "", "FBA").unwrap();

        // Demande supprimée → alerte supprimée avec elle.
        conn.execute("DELETE FROM demande WHERE id = 1", []).unwrap();
        assert!(lister(&conn).unwrap().is_empty());

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
