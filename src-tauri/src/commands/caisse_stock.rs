use crate::commands::journal::journaliser;
use crate::commands::locks::require_lock;
use crate::db::Db;
use crate::models::{CaisseStock, NewCaisseStock};
use tauri::State;

/// Caisse réutilisable (pool générique, affectable à plusieurs affaires simultanément) — détectée
/// par préfixe sur le nom plutôt qu'un champ dédié, convention à garder synchronisée avec
/// `src/domain/caisseStock.ts::estArCaiss`.
fn est_ar_caiss(nom: &str) -> bool {
    nom.trim().to_uppercase().starts_with("AR_CAISS")
}

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
        validee: row.get(9)?,
        demandeur: row.get(10)?,
        demande_le: row.get(11)?,
        demande_statut: row.get(12)?,
        demande_affaire_cible_id: row.get(13)?,
        demande_cible_id: row.get(14)?,
        type_ouverture: row.get(15)?,
    })
}

const SELECT_COLS: &str = "id, nom, longueur_mm, largeur_mm, hauteur_mm, quantite, observations, affaire_id, ordre,
    validee, demandeur, demande_le, demande_statut, demande_affaire_cible_id, demande_cible_id, type_ouverture";

fn get_caisse_stock(conn: &rusqlite::Connection, id: i64) -> Result<CaisseStock, String> {
    let sql = format!("SELECT {} FROM caisse_stock WHERE id = ?1", SELECT_COLS);
    conn.query_row(&sql, [id], map_row).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_caisses_stock(db: State<Db>) -> Result<Vec<CaisseStock>, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let sql = format!("SELECT {} FROM caisse_stock ORDER BY ordre, id", SELECT_COLS);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_caisse_stock(db: State<Db>, caisse: NewCaisseStock, trigramme: String) -> Result<CaisseStock, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock(conn, "stock", &trigramme)?;
    let ordre: i64 = conn
        .query_row("SELECT COALESCE(MAX(ordre), -1) + 1 FROM caisse_stock", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO caisse_stock (nom, longueur_mm, largeur_mm, hauteur_mm, quantite, observations, affaire_id, ordre, type_ouverture)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            caisse.nom,
            caisse.longueur_mm,
            caisse.largeur_mm,
            caisse.hauteur_mm,
            caisse.quantite,
            caisse.observations,
            caisse.affaire_id,
            ordre,
            caisse.type_ouverture,
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    get_caisse_stock(conn, id)
}

// Ligne de Gestion des caisses pas encore livrée / rapatriée — même règle que
// `domain/demandeOptions.ts::estDemandeValidee` / `estDemandeCaisseValidee` (texte d'observation).
const OBSERVATION_NON_LIVREE: &str = "NOT (lower(observations) LIKE '%livré%' OR lower(observations) LIKE '%livre%'
    OR lower(observations) LIKE '%rapatrié%' OR lower(observations) LIKE '%rapatrie%')";

/// Ids des demandes et sous-caisses non livrées qui utilisent cette caisse en stock.
fn lignes_liees_non_livrees(conn: &rusqlite::Connection, id: i64) -> Result<(Vec<i64>, Vec<i64>), String> {
    let ids = |sql: String| -> Result<Vec<i64>, String> {
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([id], |r| r.get(0)).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<i64>, _>>().map_err(|e| e.to_string())
    };
    let demandes = ids(format!(
        "SELECT id FROM demande WHERE caisse_stock_id = ?1 AND validee = 0 AND {OBSERVATION_NON_LIVREE}"
    ))?;
    let sous_caisses = ids(format!(
        "SELECT id FROM demande_caisse WHERE caisse_stock_id = ?1 AND {OBSERVATION_NON_LIVREE}"
    ))?;
    Ok((demandes, sous_caisses))
}

/// Nombre de lignes de Gestion des caisses non livrées qui utilisent cette caisse en stock (elles
/// reprendront ses dimensions et son type d'ouverture si on la modifie).
#[tauri::command]
pub fn count_caisse_stock_lignes_liees(db: State<Db>, id: i64) -> Result<i64, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let (demandes, sous_caisses) = lignes_liees_non_livrees(conn, id)?;
    Ok((demandes.len() + sous_caisses.len()) as i64)
}

/// Modifie une caisse en stock. Si ses dimensions ou son type d'ouverture changent, les lignes
/// non livrées qui l'utilisent (demandes, sous-caisses) et leurs caisses Simulations liées les
/// reprennent (décision 2026-09-28) — l'UI a confirmé au préalable avec le nombre de lignes.
#[tauri::command]
pub fn update_caisse_stock(db: State<Db>, id: i64, caisse: NewCaisseStock, trigramme: String) -> Result<(), String> {
    let mut guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_mut().ok_or("base de données non initialisée")?;
    modifier_caisse_stock(conn, id, &caisse, &trigramme)
}

fn modifier_caisse_stock(conn: &mut rusqlite::Connection, id: i64, caisse: &NewCaisseStock, trigramme: &str) -> Result<(), String> {
    require_lock(conn, "stock", trigramme)?;

    let actuelle = get_caisse_stock(conn, id)?;
    if caisse.affaire_id != actuelle.affaire_id && actuelle.validee && !est_ar_caiss(&actuelle.nom) {
        return Err("Caisse déjà validée sur une affaire — non réaffectable directement, passez par une demande de réaffectation.".to_string());
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE caisse_stock SET nom = ?1, longueur_mm = ?2, largeur_mm = ?3, hauteur_mm = ?4,
         quantite = ?5, observations = ?6, affaire_id = ?7, type_ouverture = ?8 WHERE id = ?9",
        rusqlite::params![
            caisse.nom,
            caisse.longueur_mm,
            caisse.largeur_mm,
            caisse.hauteur_mm,
            caisse.quantite,
            caisse.observations,
            caisse.affaire_id,
            caisse.type_ouverture,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;

    let dims_changees = caisse.longueur_mm != actuelle.longueur_mm
        || caisse.largeur_mm != actuelle.largeur_mm
        || caisse.hauteur_mm != actuelle.hauteur_mm;
    if dims_changees || caisse.type_ouverture != actuelle.type_ouverture {
        let (demandes, sous_caisses) = lignes_liees_non_livrees(&tx, id)?;
        // (table, colonne de lien de la caisse Simulations, entité du journal, ids)
        for (table, lien, entite, ids) in [
            ("demande", "demande_id", "demande", &demandes),
            ("demande_caisse", "demande_caisse_id", "demande_caisse", &sous_caisses),
        ] {
            for &ligne in ids {
                tx.execute(
                    &format!("UPDATE {table} SET longueur_mm = ?1, largeur_mm = ?2, hauteur_mm = ?3, type_ouverture = ?4 WHERE id = ?5"),
                    rusqlite::params![caisse.longueur_mm, caisse.largeur_mm, caisse.hauteur_mm, caisse.type_ouverture, ligne],
                )
                .map_err(|e| e.to_string())?;
                tx.execute(
                    &format!("UPDATE caisse SET longueur_mm = ?1, largeur_mm = ?2, hauteur_mm = ?3 WHERE {lien} = ?4 AND caisse_stock_id = ?5"),
                    rusqlite::params![caisse.longueur_mm, caisse.largeur_mm, caisse.hauteur_mm, ligne, id],
                )
                .map_err(|e| e.to_string())?;
                if dims_changees {
                    journaliser(
                        &tx,
                        trigramme,
                        "modification_dimensions",
                        entite,
                        Some(ligne),
                        &format!(
                            "Repris de la caisse en stock « {} » : {} × {} × {} mm",
                            caisse.nom, caisse.longueur_mm, caisse.largeur_mm, caisse.hauteur_mm
                        ),
                    );
                }
            }
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_caisse_stock(db: State<Db>, id: i64, trigramme: String) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock(conn, "stock", &trigramme)?;
    conn.execute("DELETE FROM caisse_stock WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Initiée depuis Demandes (sélection du menu Stock), après confirmation de l'utilisateur en cas
/// de conflit. Transfert immédiat, sans étape d'approbation séparée : retire le lien de l'ancien
/// propriétaire (demande ou sous-ligne) — la nouvelle demande a déjà posé son propre
/// caisse_stock_id côté frontend avant cet appel. Ne touche jamais caisse_stock.affaire_id,
/// réservé au lien réel avec Simulations posé plus tard.
#[tauri::command]
pub fn transfer_caisse_stock(db: State<Db>, caisse_stock_id: i64, demande_cible_id: i64, trigramme: String) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock(conn, "demandes", &trigramme)?;

    let row = get_caisse_stock(conn, caisse_stock_id)?;
    if est_ar_caiss(&row.nom) {
        return Err("Une caisse AR_CAISS est réutilisable, aucune réaffectation nécessaire.".to_string());
    }

    conn.execute(
        "UPDATE demande SET caisse_stock_id = NULL WHERE caisse_stock_id = ?1 AND id != ?2",
        rusqlite::params![caisse_stock_id, demande_cible_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE demande_caisse SET caisse_stock_id = NULL WHERE caisse_stock_id = ?1 AND demande_id != ?2",
        rusqlite::params![caisse_stock_id, demande_cible_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Appelée uniquement en cascade depuis la validation d'une Demande (le verrou "demandes" a déjà
/// été vérifié dans la même action utilisateur) — pas de vérification de verrou "stock" ici.
/// No-op silencieux pour les AR_CAISS, jamais marquées validées (pool toujours disponible).
#[tauri::command]
pub fn set_caisse_stock_validee(db: State<Db>, id: i64, validee: bool, trigramme: String) -> Result<(), String> {
    let _ = trigramme;
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;

    let row = get_caisse_stock(conn, id)?;
    if est_ar_caiss(&row.nom) {
        return Ok(());
    }

    conn.execute("UPDATE caisse_stock SET validee = ?1 WHERE id = ?2", rusqlite::params![validee, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modification_repercutee_sur_les_lignes_non_livrees() {
        let dir = std::env::temp_dir().join(format!("caisses-test-stock-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let mut conn = crate::db::open_at(&dir);
        conn.execute_batch(
            "INSERT INTO caisse_stock (id, nom, longueur_mm, largeur_mm, hauteur_mm, quantite, observations, ordre)
                 VALUES (1, 'CAISSE A', 1000, 800, 600, 1, '', 0);
             INSERT INTO demande (id, affaire, caisse_stock_id, longueur_mm, largeur_mm, hauteur_mm, type_ouverture, observations, validee)
                 VALUES (10, 'AFFAIRE1', 1, 1000, 800, 600, 'Par dessus', '', 0),
                        (11, 'AFFAIRE2', 1, 1000, 800, 600, 'Par dessus', 'Livré', 1);
             INSERT INTO demande_caisse (id, demande_id, caisse_stock_id, longueur_mm, largeur_mm, hauteur_mm, type_ouverture, observations)
                 VALUES (20, 10, 1, 1000, 800, 600, 'Par dessus', ''),
                        (21, 11, 1, 1000, 800, 600, 'Par dessus', 'Livré');
             INSERT INTO affaire (id, nom) VALUES (1, 'AFFAIRE1');
             INSERT INTO caisse (id, affaire_id, nom, longueur_mm, largeur_mm, hauteur_mm, demande_id, caisse_stock_id)
                 VALUES (30, 1, 'AFFAIRE1', 1000, 800, 600, 10, 1);",
        )
        .unwrap();
        let mut modifiee = versnew(&get_caisse_stock(&conn, 1).unwrap());
        modifiee.longueur_mm = 1200.0;
        modifiee.type_ouverture = "Par devant".to_string();
        modifier_caisse_stock(&mut conn, 1, &modifiee, "AJC").unwrap();

        let ligne = |sql: &str| -> (f64, String) { conn.query_row(sql, [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap() };
        assert_eq!(ligne("SELECT longueur_mm, type_ouverture FROM demande WHERE id = 10"), (1200.0, "Par devant".into()));
        assert_eq!(ligne("SELECT longueur_mm, type_ouverture FROM demande WHERE id = 11"), (1000.0, "Par dessus".into()));
        assert_eq!(ligne("SELECT longueur_mm, type_ouverture FROM demande_caisse WHERE id = 20"), (1200.0, "Par devant".into()));
        assert_eq!(ligne("SELECT longueur_mm, type_ouverture FROM demande_caisse WHERE id = 21"), (1000.0, "Par dessus".into()));
        let simu: f64 = conn.query_row("SELECT longueur_mm FROM caisse WHERE id = 30", [], |r| r.get(0)).unwrap();
        assert_eq!(simu, 1200.0);
        assert_eq!(lignes_liees_non_livrees(&conn, 1).unwrap(), (vec![10], vec![20]));
    }

    fn versnew(c: &CaisseStock) -> NewCaisseStock {
        NewCaisseStock {
            nom: c.nom.clone(),
            longueur_mm: c.longueur_mm,
            largeur_mm: c.largeur_mm,
            hauteur_mm: c.hauteur_mm,
            quantite: c.quantite,
            observations: c.observations.clone(),
            affaire_id: c.affaire_id,
            type_ouverture: c.type_ouverture.clone(),
        }
    }
}
