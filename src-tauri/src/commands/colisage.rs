use crate::commands::caisses::PALETTE;
use crate::commands::locks::require_lock;
use crate::db::Db;
use crate::commands::articles::require_lock_for_article;
use crate::models::{CaisseColisage, ColisRangement, PieceAcceptee};
use tauri::State;

// Onglet Colisage de Simulations (2026-10-14) : caisses colisage (copies indépendantes des caisses
// de l'affaire) et rangement des colis / lettres dedans. Verrou de l'affaire pour toute écriture.

const SELECT_COLS: &str = "id, affaire_id, nom, longueur_mm, largeur_mm, hauteur_mm, couleur, source_caisse_id, ordre";

fn map_row(row: &rusqlite::Row) -> rusqlite::Result<CaisseColisage> {
    Ok(CaisseColisage {
        id: row.get(0)?,
        affaire_id: row.get(1)?,
        nom: row.get(2)?,
        longueur_mm: row.get(3)?,
        largeur_mm: row.get(4)?,
        hauteur_mm: row.get(5)?,
        couleur: row.get(6)?,
        source_caisse_id: row.get(7)?,
        ordre: row.get(8)?,
    })
}

fn verrou(conn: &rusqlite::Connection, affaire_id: i64, trigramme: &str) -> Result<(), String> {
    require_lock(conn, &format!("affaire:{affaire_id}"), trigramme)
}

fn affaire_de(conn: &rusqlite::Connection, id: i64) -> Result<i64, String> {
    conn.query_row("SELECT affaire_id FROM caisse_colisage WHERE id = ?1", [id], |r| r.get(0))
        .map_err(|e| e.to_string())
}

fn lister(conn: &rusqlite::Connection, affaire_id: i64) -> Result<Vec<CaisseColisage>, String> {
    let mut stmt = conn
        .prepare(&format!("SELECT {SELECT_COLS} FROM caisse_colisage WHERE affaire_id = ?1 ORDER BY ordre, id"))
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([affaire_id], map_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_caisses_colisage(db: State<Db>, affaire_id: i64) -> Result<Vec<CaisseColisage>, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    lister(conn, affaire_id)
}

/// Ajoute une copie de chaque caisse de l'affaire (nom, dimensions, couleur, ordre), à la suite des
/// caisses colisage existantes.
// Copie les caisses de l'affaire (onglet Picking) pas encore copiées (2026-10-27 : appelé
// automatiquement à l'arrivée sur Colisage en cours) ; les caisses colisage existantes ne sont pas
// touchées. Une caisse colisage supprimée revient donc tant que sa caisse existe dans le Picking.
fn copier(conn: &rusqlite::Connection, affaire_id: i64, trigramme: &str) -> Result<(), String> {
    verrou(conn, affaire_id, trigramme)?;
    conn.execute(
        "INSERT INTO caisse_colisage (affaire_id, nom, longueur_mm, largeur_mm, hauteur_mm, couleur, source_caisse_id, ordre)
         SELECT affaire_id, nom, longueur_mm, largeur_mm, hauteur_mm, couleur, id,
                (SELECT COALESCE(MAX(ordre), -1) + 1 FROM caisse_colisage WHERE affaire_id = ?1) + ordre
         FROM caisse
         WHERE affaire_id = ?1
           AND id NOT IN (SELECT source_caisse_id FROM caisse_colisage WHERE affaire_id = ?1 AND source_caisse_id IS NOT NULL)
         ORDER BY ordre, id",
        [affaire_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn copier_caisses_colisage(db: State<Db>, affaire_id: i64, trigramme: String) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    copier(conn, affaire_id, &trigramme)
}

#[tauri::command]
pub fn create_caisse_colisage(
    db: State<Db>,
    affaire_id: i64,
    nom: String,
    longueur_mm: f64,
    largeur_mm: f64,
    hauteur_mm: f64,
    trigramme: String,
) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    verrou(conn, affaire_id, &trigramme)?;
    let ordre: i64 = conn
        .query_row("SELECT COALESCE(MAX(ordre), -1) + 1 FROM caisse_colisage WHERE affaire_id = ?1", [affaire_id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let couleur = PALETTE[(ordre as usize) % PALETTE.len()];
    conn.execute(
        "INSERT INTO caisse_colisage (affaire_id, nom, longueur_mm, largeur_mm, hauteur_mm, couleur, ordre)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![affaire_id, nom.trim(), longueur_mm, largeur_mm, hauteur_mm, couleur, ordre],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_caisse_colisage(
    db: State<Db>,
    id: i64,
    nom: String,
    longueur_mm: f64,
    largeur_mm: f64,
    hauteur_mm: f64,
    trigramme: String,
) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    verrou(conn, affaire_de(conn, id)?, &trigramme)?;
    conn.execute(
        "UPDATE caisse_colisage SET nom = ?1, longueur_mm = ?2, largeur_mm = ?3, hauteur_mm = ?4 WHERE id = ?5",
        rusqlite::params![nom.trim(), longueur_mm, largeur_mm, hauteur_mm, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_caisse_colisage(db: State<Db>, id: i64, trigramme: String) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    verrou(conn, affaire_de(conn, id)?, &trigramme)?;
    conn.execute("DELETE FROM caisse_colisage WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_colis_rangement(db: State<Db>, affaire_id: i64) -> Result<Vec<ColisRangement>, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let mut stmt = conn
        .prepare("SELECT tag, caisse_colisage_id FROM colis_rangement WHERE affaire_id = ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([affaire_id], |r| Ok(ColisRangement { tag: r.get(0)?, caisse_colisage_id: r.get(1)? }))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Rangement d'un colis / d'une lettre : `propose` = retour au rangement proposé (ligne effacée),
/// sinon `caisse_colisage_id` (None = « non rangé »).
fn ranger(
    conn: &rusqlite::Connection,
    affaire_id: i64,
    tag: &str,
    propose: bool,
    caisse_colisage_id: Option<i64>,
    trigramme: &str,
) -> Result<(), String> {
    verrou(conn, affaire_id, trigramme)?;
    if propose {
        conn.execute("DELETE FROM colis_rangement WHERE affaire_id = ?1 AND tag = ?2", rusqlite::params![affaire_id, tag])
    } else {
        conn.execute(
            "INSERT INTO colis_rangement (affaire_id, tag, caisse_colisage_id) VALUES (?1, ?2, ?3)
             ON CONFLICT(affaire_id, tag) DO UPDATE SET caisse_colisage_id = excluded.caisse_colisage_id",
            rusqlite::params![affaire_id, tag, caisse_colisage_id],
        )
    }
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_colis_rangement(
    db: State<Db>,
    affaire_id: i64,
    tag: String,
    propose: bool,
    caisse_colisage_id: Option<i64>,
    trigramme: String,
) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    ranger(conn, affaire_id, &tag, propose, caisse_colisage_id, &trigramme)
}

/// Pièces de l'affaire acceptées malgré une alerte : dimensions (2026-10-15) ou volume (2026-10-27).
#[tauri::command]
pub fn list_pieces_acceptees(db: State<Db>, affaire_id: i64) -> Result<Vec<PieceAcceptee>, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let mut stmt = conn
        .prepare(
            "SELECT p.article_id, p.carton, 'dimensions' FROM piece_acceptee p JOIN article a ON a.id = p.article_id WHERE a.affaire_id = ?1
             UNION ALL
             SELECT p.article_id, p.carton, 'volume' FROM piece_acceptee_volume p JOIN article a ON a.id = p.article_id WHERE a.affaire_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([affaire_id], |r| Ok(PieceAcceptee { article_id: r.get(0)?, carton: r.get(1)?, alerte: r.get(2)? }))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

// Table d'une alerte acceptable (liste figée : le nom est inséré dans la requête).
fn table_acceptation(alerte: &str) -> Result<&'static str, String> {
    match alerte {
        "dimensions" => Ok("piece_acceptee"),
        "volume" => Ok("piece_acceptee_volume"),
        _ => Err(format!("alerte inconnue : {alerte}")),
    }
}

fn accepter(conn: &rusqlite::Connection, article_id: i64, alerte: &str, carton: Option<&str>, trigramme: &str) -> Result<(), String> {
    let table = table_acceptation(alerte)?;
    require_lock_for_article(conn, article_id, trigramme)?;
    match carton {
        Some(c) => conn.execute(
            &format!(
                "INSERT INTO {table} (article_id, carton) VALUES (?1, ?2)
                 ON CONFLICT(article_id) DO UPDATE SET carton = excluded.carton"
            ),
            rusqlite::params![article_id, c],
        ),
        None => conn.execute(&format!("DELETE FROM {table} WHERE article_id = ?1"), [article_id]),
    }
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Accepte (`carton` = clé du carton actuel) ou annule (`None`) l'acceptation d'une alerte d'une
/// pièce : `alerte` = "dimensions" (ne rentre pas sur les 3 axes, passe en diagonale) ou "volume"
/// (ligne plus volumineuse que le carton, ex. pièce en sachet).
#[tauri::command]
pub fn set_piece_acceptee(
    db: State<Db>,
    article_id: i64,
    alerte: String,
    carton: Option<String>,
    trigramme: String,
) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    accepter(conn, article_id, &alerte, carton.as_deref(), &trigramme)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copie_des_caisses_et_rangement() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        crate::db::appliquer_migrations(&conn).unwrap();
        conn.execute_batch(
            "INSERT INTO affaire (id, nom, seuil_defaut) VALUES (1, 'AFFAIRE1', 70);
             INSERT INTO caisse (id, affaire_id, nom, longueur_mm, largeur_mm, hauteur_mm, couleur, ordre)
                 VALUES (10, 1, 'C1', 1000, 800, 600, '#dbeafe', 0), (11, 1, 'C2', 1200, 800, 600, '#fde2e2', 1);",
        )
        .unwrap();
        copier(&conn, 1, "AJC").unwrap();
        let caisses = lister(&conn, 1).unwrap();
        assert_eq!(caisses.len(), 2);
        assert_eq!(caisses[0].nom, "C1");
        assert_eq!(caisses[0].source_caisse_id, Some(10));
        assert_eq!(caisses[1].longueur_mm, 1200.0);

        // Copie indépendante : modifier l'originale ne change pas la copie.
        conn.execute("UPDATE caisse SET longueur_mm = 1500 WHERE id = 10", []).unwrap();
        assert_eq!(lister(&conn, 1).unwrap()[0].longueur_mm, 1000.0);

        // Nouvelle copie : seules les caisses pas encore copiées sont ajoutées.
        copier(&conn, 1, "AJC").unwrap();
        assert_eq!(lister(&conn, 1).unwrap().len(), 2);
        conn.execute(
            "INSERT INTO caisse (id, affaire_id, nom, longueur_mm, largeur_mm, hauteur_mm, couleur, ordre) VALUES (12, 1, 'C3', 900, 700, 500, '#e0f2e9', 2)",
            [],
        )
        .unwrap();
        copier(&conn, 1, "AJC").unwrap();
        let apres = lister(&conn, 1).unwrap();
        assert_eq!(apres.len(), 3);
        assert_eq!(apres[2].source_caisse_id, Some(12));
        conn.execute("DELETE FROM caisse_colisage WHERE source_caisse_id = 12", []).unwrap();
        conn.execute("DELETE FROM caisse WHERE id = 12", []).unwrap();

        // Rangement : choisi, « non rangé », retour au proposé ; caisse supprimée → proposé.
        let c2 = caisses[1].id;
        ranger(&conn, 1, "A", false, Some(c2), "AJC").unwrap();
        ranger(&conn, 1, "1", false, None, "AJC").unwrap();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM colis_rangement", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 2);
        ranger(&conn, 1, "1", true, None, "AJC").unwrap();
        conn.execute("DELETE FROM caisse_colisage WHERE id = ?1", [c2]).unwrap();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM colis_rangement", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0);
        // Pièce acceptée : enregistrée, remplacée, annulée.
        conn.execute("INSERT INTO article (id, affaire_id, ar, reference, designation, dim1_mm, dim2_mm, dim3_mm, poids_unitaire_kg, quantite, ordre) VALUES (99, 1, 'AR_X', '', '', 500, 10, 10, 1, 1, 0)", []).unwrap();
        accepter(&conn, 99, "dimensions", Some("conso:1"), "AJC").unwrap();
        accepter(&conn, 99, "dimensions", Some("libre:300x200x100"), "AJC").unwrap();
        let carton: String = conn.query_row("SELECT carton FROM piece_acceptee WHERE article_id = 99", [], |r| r.get(0)).unwrap();
        assert_eq!(carton, "libre:300x200x100");
        // Volume : acceptation à part, indépendante de celle des dimensions.
        accepter(&conn, 99, "volume", Some("conso:1"), "AJC").unwrap();
        let alertes: Vec<String> = conn
            .prepare("SELECT 'dimensions' FROM piece_acceptee UNION ALL SELECT 'volume' FROM piece_acceptee_volume")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(alertes, vec!["dimensions", "volume"]);
        assert!(accepter(&conn, 99, "autre", Some("conso:1"), "AJC").is_err());
        accepter(&conn, 99, "dimensions", None, "AJC").unwrap();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM piece_acceptee", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0);
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM piece_acceptee_volume", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);

        // Originale supprimée : la copie reste, sans source.
        conn.execute("DELETE FROM caisse WHERE id = 10", []).unwrap();
        assert_eq!(lister(&conn, 1).unwrap()[0].source_caisse_id, None);
    }
}
