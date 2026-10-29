use crate::commands::locks::require_lock;
use crate::db::Db;
use serde::Serialize;
use tauri::State;

// Envoi en partiel (2026-10-29) : date de livraison des lignes de Gestion des caisses, écrite par
// l'enregistrement automatique de Gestion des caisses au passage « Livré » / « Non livré ». Sert à
// regrouper les caisses par livraison dans Colisage en cours (calcul côté frontend,
// `domain/envois.ts`).

#[derive(Debug, Serialize)]
pub struct LivraisonLigne {
    pub table_ligne: String,
    pub ligne_id: i64,
    pub livree_le: String,
}

#[tauri::command]
pub fn list_livraisons(db: State<Db>) -> Result<Vec<LivraisonLigne>, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    lister(conn)
}

fn lister(conn: &rusqlite::Connection) -> Result<Vec<LivraisonLigne>, String> {
    let mut stmt = conn
        .prepare("SELECT table_ligne, ligne_id, livree_le FROM livraison_ligne")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok(LivraisonLigne { table_ligne: row.get(0)?, ligne_id: row.get(1)?, livree_le: row.get(2)? }))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

// `livree_le` : AAAA-MM-JJ HH:MM:SS (heure locale du poste), ou None pour effacer.
fn enregistrer(
    conn: &rusqlite::Connection,
    table_ligne: &str,
    ligne_id: i64,
    livree_le: Option<&str>,
    trigramme: &str,
) -> Result<(), String> {
    require_lock(conn, "demandes", trigramme)?;
    if table_ligne != "demande" && table_ligne != "demande_caisse" {
        return Err(format!("Table inconnue : « {table_ligne} »."));
    }
    match livree_le.map(str::trim).filter(|d| !d.is_empty()) {
        None => conn
            .execute(
                "DELETE FROM livraison_ligne WHERE table_ligne = ?1 AND ligne_id = ?2",
                rusqlite::params![table_ligne, ligne_id],
            )
            .map(|_| ()),
        Some(date) => conn
            .execute(
                "INSERT INTO livraison_ligne (table_ligne, ligne_id, livree_le) VALUES (?1, ?2, ?3)
                 ON CONFLICT(table_ligne, ligne_id) DO UPDATE SET livree_le = excluded.livree_le",
                rusqlite::params![table_ligne, ligne_id, date],
            )
            .map(|_| ()),
    }
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_livraison(
    db: State<Db>,
    table_ligne: String,
    ligne_id: i64,
    livree_le: Option<String>,
    trigramme: String,
) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    enregistrer(conn, &table_ligne, ligne_id, livree_le.as_deref(), &trigramme)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn date_enregistree_effacee_et_supprimee_avec_la_ligne() {
        let dir = std::env::temp_dir().join(format!("caisses-test-livraison-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let conn = crate::db::open_at(&dir);
        conn.execute_batch(
            "INSERT INTO demande (id, affaire) VALUES (10, 'AFFAIRE1');
             INSERT INTO demande_caisse (id, demande_id) VALUES (20, 10), (21, 10);",
        )
        .unwrap();
        enregistrer(&conn, "demande", 10, Some("2026-10-29 10:00:00"), "AJC").unwrap();
        enregistrer(&conn, "demande_caisse", 20, Some("2026-10-29 10:00:00"), "AJC").unwrap();
        enregistrer(&conn, "demande_caisse", 21, Some("2026-11-12 09:00:00"), "AJC").unwrap();
        enregistrer(&conn, "demande_caisse", 21, Some("2026-11-13 09:00:00"), "AJC").unwrap();
        assert!(enregistrer(&conn, "caisse", 1, Some("2026-10-29"), "AJC").is_err());
        let dates = lister(&conn).unwrap();
        assert_eq!(dates.len(), 3);
        assert!(dates.iter().any(|l| l.ligne_id == 21 && l.livree_le == "2026-11-13 09:00:00"));

        enregistrer(&conn, "demande_caisse", 20, None, "AJC").unwrap();
        assert_eq!(lister(&conn).unwrap().len(), 2);
        conn.execute("DELETE FROM demande WHERE id = 10", []).unwrap();
        assert!(lister(&conn).unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
