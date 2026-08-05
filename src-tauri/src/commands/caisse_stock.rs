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
    })
}

const SELECT_COLS: &str = "id, nom, longueur_mm, largeur_mm, hauteur_mm, quantite, observations, affaire_id, ordre,
    validee, demandeur, demande_le, demande_statut, demande_affaire_cible_id, demande_cible_id";

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
    get_caisse_stock(conn, id)
}

#[tauri::command]
pub fn update_caisse_stock(db: State<Db>, id: i64, caisse: NewCaisseStock, trigramme: String) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock(conn, "stock", &trigramme)?;

    let actuelle = get_caisse_stock(conn, id)?;
    if caisse.affaire_id != actuelle.affaire_id && actuelle.validee && !est_ar_caiss(&actuelle.nom) {
        return Err("Caisse déjà validée sur une affaire — non réaffectable directement, passez par une demande de réaffectation.".to_string());
    }

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
