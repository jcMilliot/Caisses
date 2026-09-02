use crate::commands::journal::journaliser;
use crate::commands::locks::require_lock;
use crate::db::Db;
use crate::models::{Demande, NewDemande};
use tauri::State;

fn dims(l: f64, w: f64, h: f64) -> String {
    format!("{:.2} × {:.2} × {:.2} m", l / 1000.0, w / 1000.0, h / 1000.0)
}

fn map_row(row: &rusqlite::Row) -> rusqlite::Result<Demande> {
    Ok(Demande {
        id: row.get(0)?,
        ok_pour_passer_cde: row.get(1)?,
        affaire: row.get(2)?,
        type_envoi_caisse: row.get(3)?,
        type_ouverture: row.get(4)?,
        stock: row.get(5)?,
        longueur_mm: row.get(6)?,
        largeur_mm: row.get(7)?,
        hauteur_mm: row.get(8)?,
        quantite: row.get(9)?,
        date_picking: row.get(10)?,
        date_demandee_s2c: row.get(11)?,
        moteurs: row.get(12)?,
        module_lineaire: row.get(13)?,
        terminaux: row.get(14)?,
        traitement: row.get(15)?,
        informations_supp: row.get(16)?,
        cde_passee_affaire: row.get(17)?,
        cde_passee_achat_stock: row.get(18)?,
        observations: row.get(19)?,
        contre_plaque: row.get(20)?,
        validee: row.get(21)?,
        ordre: row.get(22)?,
        caisse_stock_id: row.get(23)?,
    })
}

const SELECT_COLS: &str = "id, ok_pour_passer_cde, affaire, type_envoi_caisse, type_ouverture, stock,
    longueur_mm, largeur_mm, hauteur_mm, quantite, date_picking, date_demandee_s2c,
    moteurs, module_lineaire, terminaux, traitement, informations_supp,
    cde_passee_affaire, cde_passee_achat_stock, observations, contre_plaque, validee, ordre, caisse_stock_id";

#[tauri::command]
pub fn list_demandes(db: State<Db>) -> Result<Vec<Demande>, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let sql = format!("SELECT {} FROM demande ORDER BY ordre, id", SELECT_COLS);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn insert_demande(conn: &rusqlite::Connection, d: &NewDemande, ordre: i64) -> Result<i64, String> {
    conn.execute(
        "INSERT INTO demande (
            ok_pour_passer_cde, affaire, type_envoi_caisse, type_ouverture, stock,
            longueur_mm, largeur_mm, hauteur_mm, quantite, date_picking, date_demandee_s2c,
            moteurs, module_lineaire, terminaux, traitement, informations_supp,
            cde_passee_affaire, cde_passee_achat_stock, observations, contre_plaque, ordre, caisse_stock_id
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)",
        rusqlite::params![
            d.ok_pour_passer_cde,
            d.affaire,
            d.type_envoi_caisse,
            d.type_ouverture,
            d.stock,
            d.longueur_mm,
            d.largeur_mm,
            d.hauteur_mm,
            d.quantite,
            d.date_picking,
            d.date_demandee_s2c,
            d.moteurs,
            d.module_lineaire,
            d.terminaux,
            d.traitement,
            d.informations_supp,
            d.cde_passee_affaire,
            d.cde_passee_achat_stock,
            d.observations,
            d.contre_plaque,
            ordre,
            d.caisse_stock_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn create_demande(db: State<Db>, demande: NewDemande, trigramme: String) -> Result<Demande, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock(conn, "demandes", &trigramme)?;
    let ordre: i64 = conn
        .query_row("SELECT COALESCE(MAX(ordre), -1) + 1 FROM demande", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    let id = insert_demande(conn, &demande, ordre)?;
    journaliser(
        conn,
        &trigramme,
        "creation",
        "demande",
        Some(id),
        &format!(
            "Caisse « {} » — {}",
            demande.affaire,
            dims(demande.longueur_mm, demande.largeur_mm, demande.hauteur_mm)
        ),
    );
    let sql = format!("SELECT {} FROM demande WHERE id = ?1", SELECT_COLS);
    conn.query_row(&sql, [id], map_row).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn bulk_create_demandes(db: State<Db>, demandes: Vec<NewDemande>, trigramme: String) -> Result<Vec<Demande>, String> {
    let mut guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_mut().ok_or("base de données non initialisée")?;
    require_lock(conn, "demandes", &trigramme)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut ids = Vec::with_capacity(demandes.len());
    {
        let mut ordre: i64 = tx
            .query_row("SELECT COALESCE(MAX(ordre), -1) + 1 FROM demande", [], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        for d in &demandes {
            tx.execute(
                "INSERT INTO demande (
                    ok_pour_passer_cde, affaire, type_envoi_caisse, type_ouverture, stock,
                    longueur_mm, largeur_mm, hauteur_mm, quantite, date_picking, date_demandee_s2c,
                    moteurs, module_lineaire, terminaux, traitement, informations_supp,
                    cde_passee_affaire, cde_passee_achat_stock, observations, contre_plaque, ordre, caisse_stock_id
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)",
                rusqlite::params![
                    d.ok_pour_passer_cde,
                    d.affaire,
                    d.type_envoi_caisse,
                    d.type_ouverture,
                    d.stock,
                    d.longueur_mm,
                    d.largeur_mm,
                    d.hauteur_mm,
                    d.quantite,
                    d.date_picking,
                    d.date_demandee_s2c,
                    d.moteurs,
                    d.module_lineaire,
                    d.terminaux,
                    d.traitement,
                    d.informations_supp,
                    d.cde_passee_affaire,
                    d.cde_passee_achat_stock,
                    d.observations,
                    d.contre_plaque,
                    ordre,
                    d.caisse_stock_id,
                ],
            )
            .map_err(|e| e.to_string())?;
            let nid = tx.last_insert_rowid();
            journaliser(
                &tx,
                &trigramme,
                "creation",
                "demande",
                Some(nid),
                &format!(
                    "Caisse « {} » — {} (collage Excel)",
                    d.affaire,
                    dims(d.longueur_mm, d.largeur_mm, d.hauteur_mm)
                ),
            );
            ids.push(nid);
            ordre += 1;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;

    let sql = format!("SELECT {} FROM demande WHERE id = ?1", SELECT_COLS);
    let mut result = Vec::with_capacity(ids.len());
    for id in ids {
        result.push(conn.query_row(&sql, [id], map_row).map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_demande(db: State<Db>, id: i64, demande: NewDemande, trigramme: String) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock(conn, "demandes", &trigramme)?;
    let avant: Option<(String, f64, f64, f64)> = conn
        .query_row(
            "SELECT affaire, longueur_mm, largeur_mm, hauteur_mm FROM demande WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .ok();
    conn.execute(
        "UPDATE demande SET
            ok_pour_passer_cde = ?1, affaire = ?2, type_envoi_caisse = ?3, type_ouverture = ?4, stock = ?5,
            longueur_mm = ?6, largeur_mm = ?7, hauteur_mm = ?8, quantite = ?9, date_picking = ?10,
            date_demandee_s2c = ?11, moteurs = ?12, module_lineaire = ?13, terminaux = ?14, traitement = ?15,
            informations_supp = ?16, cde_passee_affaire = ?17, cde_passee_achat_stock = ?18, observations = ?19,
            contre_plaque = ?20, caisse_stock_id = ?21
        WHERE id = ?22",
        rusqlite::params![
            demande.ok_pour_passer_cde,
            demande.affaire,
            demande.type_envoi_caisse,
            demande.type_ouverture,
            demande.stock,
            demande.longueur_mm,
            demande.largeur_mm,
            demande.hauteur_mm,
            demande.quantite,
            demande.date_picking,
            demande.date_demandee_s2c,
            demande.moteurs,
            demande.module_lineaire,
            demande.terminaux,
            demande.traitement,
            demande.informations_supp,
            demande.cde_passee_affaire,
            demande.cde_passee_achat_stock,
            demande.observations,
            demande.contre_plaque,
            demande.caisse_stock_id,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;
    if let Some((affaire_avant, la, wa, ha)) = avant {
        let change_dims = (la - demande.longueur_mm).abs() > 0.5
            || (wa - demande.largeur_mm).abs() > 0.5
            || (ha - demande.hauteur_mm).abs() > 0.5;
        if change_dims {
            journaliser(
                conn,
                &trigramme,
                "modification_dimensions",
                "demande",
                Some(id),
                &format!(
                    "Caisse « {} » : {} → {}",
                    affaire_avant,
                    dims(la, wa, ha),
                    dims(demande.longueur_mm, demande.largeur_mm, demande.hauteur_mm)
                ),
            );
        }
    }
    Ok(())
}

#[tauri::command]
pub fn delete_demande(db: State<Db>, id: i64, trigramme: String) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock(conn, "demandes", &trigramme)?;
    let affaire: Option<String> = conn
        .query_row("SELECT affaire FROM demande WHERE id = ?1", [id], |row| row.get(0))
        .ok();
    conn.execute("DELETE FROM demande WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    journaliser(
        conn,
        &trigramme,
        "suppression",
        "demande",
        Some(id),
        &format!("Caisse « {} »", affaire.unwrap_or_default()),
    );
    Ok(())
}

#[tauri::command]
pub fn set_demande_validee(db: State<Db>, id: i64, validee: bool, trigramme: String) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock(conn, "demandes", &trigramme)?;
    conn.execute("UPDATE demande SET validee = ?1 WHERE id = ?2", rusqlite::params![validee, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
