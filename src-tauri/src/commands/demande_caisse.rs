use crate::commands::locks::require_lock;
use crate::db::Db;
use crate::models::{DemandeCaisse, NewDemandeCaisse};
use tauri::State;

const SELECT_COLS: &str = "id, demande_id, nom, type_envoi_caisse, type_ouverture, stock, date_picking, date_demandee_s2c,
    traitement, quantite, moteurs, module_lineaire, informations_supp, observations,
    cde_passee_affaire, cde_passee_achat_stock, longueur_mm, largeur_mm, hauteur_mm, poids_kg, ordre, caisse_stock_id";

fn map_row(row: &rusqlite::Row) -> rusqlite::Result<DemandeCaisse> {
    Ok(DemandeCaisse {
        id: row.get(0)?,
        demande_id: row.get(1)?,
        nom: row.get(2)?,
        type_envoi_caisse: row.get(3)?,
        type_ouverture: row.get(4)?,
        stock: row.get(5)?,
        date_picking: row.get(6)?,
        date_demandee_s2c: row.get(7)?,
        traitement: row.get(8)?,
        quantite: row.get(9)?,
        moteurs: row.get(10)?,
        module_lineaire: row.get(11)?,
        informations_supp: row.get(12)?,
        observations: row.get(13)?,
        cde_passee_affaire: row.get(14)?,
        cde_passee_achat_stock: row.get(15)?,
        longueur_mm: row.get(16)?,
        largeur_mm: row.get(17)?,
        hauteur_mm: row.get(18)?,
        poids_kg: row.get(19)?,
        ordre: row.get(20)?,
        caisse_stock_id: row.get(21)?,
    })
}

#[tauri::command]
pub fn list_all_demande_caisses(db: State<Db>) -> Result<Vec<DemandeCaisse>, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let sql = format!("SELECT {} FROM demande_caisse ORDER BY demande_id, ordre, id", SELECT_COLS);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_demande_caisse(db: State<Db>, caisse: NewDemandeCaisse, trigramme: String) -> Result<DemandeCaisse, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock(conn, "demandes", &trigramme)?;
    let ordre: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(ordre), -1) + 1 FROM demande_caisse WHERE demande_id = ?1",
            [caisse.demande_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO demande_caisse (demande_id, nom, type_envoi_caisse, type_ouverture, stock, date_picking, date_demandee_s2c,
            traitement, quantite, moteurs, module_lineaire, informations_supp, observations,
            cde_passee_affaire, cde_passee_achat_stock, longueur_mm, largeur_mm, hauteur_mm, poids_kg, ordre, caisse_stock_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
        rusqlite::params![
            caisse.demande_id,
            caisse.nom,
            caisse.type_envoi_caisse,
            caisse.type_ouverture,
            caisse.stock,
            caisse.date_picking,
            caisse.date_demandee_s2c,
            caisse.traitement,
            caisse.quantite,
            caisse.moteurs,
            caisse.module_lineaire,
            caisse.informations_supp,
            caisse.observations,
            caisse.cde_passee_affaire,
            caisse.cde_passee_achat_stock,
            caisse.longueur_mm,
            caisse.largeur_mm,
            caisse.hauteur_mm,
            caisse.poids_kg,
            ordre,
            caisse.caisse_stock_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let sql = format!("SELECT {} FROM demande_caisse WHERE id = ?1", SELECT_COLS);
    conn.query_row(&sql, [id], map_row).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_demande_caisse(db: State<Db>, id: i64, caisse: NewDemandeCaisse, trigramme: String) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock(conn, "demandes", &trigramme)?;
    conn.execute(
        "UPDATE demande_caisse SET nom = ?1, type_envoi_caisse = ?2, type_ouverture = ?3, stock = ?4,
            date_picking = ?5, date_demandee_s2c = ?6, traitement = ?7, quantite = ?8, moteurs = ?9,
            module_lineaire = ?10, informations_supp = ?11, observations = ?12,
            cde_passee_affaire = ?13, cde_passee_achat_stock = ?14, longueur_mm = ?15, largeur_mm = ?16,
            hauteur_mm = ?17, poids_kg = ?18, caisse_stock_id = ?19 WHERE id = ?20",
        rusqlite::params![
            caisse.nom,
            caisse.type_envoi_caisse,
            caisse.type_ouverture,
            caisse.stock,
            caisse.date_picking,
            caisse.date_demandee_s2c,
            caisse.traitement,
            caisse.quantite,
            caisse.moteurs,
            caisse.module_lineaire,
            caisse.informations_supp,
            caisse.observations,
            caisse.cde_passee_affaire,
            caisse.cde_passee_achat_stock,
            caisse.longueur_mm,
            caisse.largeur_mm,
            caisse.hauteur_mm,
            caisse.poids_kg,
            caisse.caisse_stock_id,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_demande_caisse(db: State<Db>, id: i64, trigramme: String) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock(conn, "demandes", &trigramme)?;
    conn.execute("DELETE FROM demande_caisse WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
