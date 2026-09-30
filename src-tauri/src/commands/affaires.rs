use crate::commands::locks::require_lock;
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
pub fn create_affaire(db: State<Db>, nom: String, trigramme: String) -> Result<Affaire, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    crate::commands::admin::refuser_lecteur(conn, &trigramme)?;
    // Seuil d'alerte = seuil général réglé dans l'Admin (plus de saisie à la création).
    let seuil = seuil_general(conn)?;
    conn.execute(
        "INSERT INTO affaire (nom, seuil_defaut) VALUES (?1, ?2)",
        rusqlite::params![nom, seuil],
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
pub fn update_affaire(db: State<Db>, id: i64, nom: String, trigramme: String) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock(conn, &format!("affaire:{}", id), &trigramme)?;
    // Le seuil ne se modifie plus ici : uniquement via le seuil général de l'Admin.
    conn.execute(
        "UPDATE affaire SET nom = ?1 WHERE id = ?2",
        rusqlite::params![nom, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_affaire(db: State<Db>, id: i64, trigramme: String) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock(conn, &format!("affaire:{}", id), &trigramme)?;
    conn.execute("DELETE FROM affaire WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// --- Seuil d'alerte général (Admin, décision 2026-09-30) ------------------------------------

const CLE_SEUIL_GENERAL: &str = "seuil_alerte_general";
const SEUIL_GENERAL_DEFAUT: f64 = 70.0;

// Affaire « livrée » = une demande de même nom (comparaison trim + insensible à la casse, comme
// `memeNomAffaire`) ou liée à une de ses caisses est livrée / rapatriée — même règle que
// `estDemandeValidee`. Les caisses d'une même affaire sont commandées ensemble : une seule
// demande livrée suffit. Une affaire sans demande liée n'est jamais « livrée ».
const AFFAIRE_LIVREE: &str = "EXISTS (
    SELECT 1 FROM demande d
    WHERE (lower(trim(d.affaire)) = lower(trim(affaire.nom))
           OR d.id IN (SELECT c.demande_id FROM caisse c WHERE c.affaire_id = affaire.id))
      AND (d.validee = 1 OR lower(d.observations) LIKE '%livré%' OR lower(d.observations) LIKE '%livre%'
           OR lower(d.observations) LIKE '%rapatrié%' OR lower(d.observations) LIKE '%rapatrie%'))";

pub(crate) fn seuil_general(conn: &rusqlite::Connection) -> Result<f64, String> {
    Ok(crate::commands::backup::lire(conn, CLE_SEUIL_GENERAL)?
        .and_then(|v| v.parse().ok())
        .unwrap_or(SEUIL_GENERAL_DEFAUT))
}

#[tauri::command]
pub fn get_seuil_general(db: State<Db>) -> Result<f64, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    seuil_general(conn)
}

/// Règle le seuil général et l'applique (en écrasant leur valeur) à toutes les affaires dont
/// la caisse n'est pas encore livrée. Renvoie le nombre d'affaires mises à jour.
#[tauri::command]
pub fn set_seuil_general(
    db: State<Db>,
    session: State<crate::commands::admin::AdminSession>,
    seuil: f64,
) -> Result<usize, String> {
    crate::commands::admin::require_admin(&session)?;
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    appliquer_seuil_general(conn, seuil)
}

fn appliquer_seuil_general(conn: &rusqlite::Connection, seuil: f64) -> Result<usize, String> {
    if !(1.0..=100.0).contains(&seuil) {
        return Err("Le seuil doit être compris entre 1 et 100 %".to_string());
    }
    crate::commands::backup::ecrire(conn, CLE_SEUIL_GENERAL, &seuil.to_string())?;
    conn.execute(
        &format!("UPDATE affaire SET seuil_defaut = ?1 WHERE NOT {AFFAIRE_LIVREE}"),
        [seuil],
    )
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seuil_general_applique_aux_affaires_non_livrees() {
        let dir = std::env::temp_dir().join(format!("caisses-test-seuil-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let conn = crate::db::open_at(&dir);
        conn.execute_batch(
            "INSERT INTO affaire (id, nom, seuil_defaut) VALUES (1, 'LIVREE01', 70), (2, 'ENCOURS1', 55), (3, 'SIMUSEUL', 70), (4, 'LIEEID01', 70);
             INSERT INTO demande (id, affaire, validee, observations) VALUES (10, 'livree01 ', 0, 'Livré'), (11, 'ENCOURS1', 0, ''), (12, 'AUTRENOM', 1, '');
             INSERT INTO caisse (id, affaire_id, nom, longueur_mm, largeur_mm, hauteur_mm, demande_id) VALUES (20, 4, 'C', 1, 1, 1, 12);",
        )
        .unwrap();
        assert_eq!(seuil_general(&conn).unwrap(), 70.0);
        assert_eq!(appliquer_seuil_general(&conn, 80.0).unwrap(), 2);
        let seuil = |id: i64| -> f64 { conn.query_row("SELECT seuil_defaut FROM affaire WHERE id = ?1", [id], |r| r.get(0)).unwrap() };
        assert_eq!(seuil(1), 70.0, "livrée (même nom) : inchangée");
        assert_eq!(seuil(2), 80.0, "en cours : écrasée");
        assert_eq!(seuil(3), 80.0, "sans demande : mise à jour");
        assert_eq!(seuil(4), 70.0, "livrée (lien caisse.demande_id) : inchangée");
        assert_eq!(seuil_general(&conn).unwrap(), 80.0);
        assert!(appliquer_seuil_general(&conn, 0.0).is_err());
    }
}
