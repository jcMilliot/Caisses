use crate::commands::admin::{require_admin, AdminSession};
use crate::commands::locks::require_lock;
use crate::db::Db;
use crate::models::NewArticle;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::State;

// Lignes écartées au collage Excel d'articles (Simulations) parce que leur AR ne commence ni par
// « AR » ni par « ZR » (décision 2026-09-30). Gardées avec l'affaire et affichées sous le tableau
// (« Ces lignes n'ont pas été collées ») ; seuls les administrateurs peuvent les modifier, les
// ajouter au tableau d'articles ou les supprimer.

#[derive(Debug, Serialize)]
pub struct ArticleNonColle {
    pub id: i64,
    pub affaire_id: i64,
    pub ar: String,
    pub reference: String,
    pub designation: String,
    pub dim1_mm: f64,
    pub dim2_mm: f64,
    pub dim3_mm: f64,
    pub poids_unitaire_kg: f64,
    pub quantite: i64,
    /// Ligne telle que collée (colonnes séparées par des tabulations, y compris les colonnes en
    /// trop), pour l'afficher entière.
    pub ligne_brute: String,
    pub cree_le: String,
    pub cree_par: String,
}

#[derive(Debug, Deserialize)]
pub struct NewArticleNonColle {
    #[serde(flatten)]
    pub article: NewArticle,
    pub ligne_brute: String,
}

const SELECT_COLS: &str = "id, affaire_id, ar, reference, designation, dim1_mm, dim2_mm, dim3_mm,
    poids_unitaire_kg, quantite, ligne_brute, cree_le, cree_par";

fn map_row(row: &rusqlite::Row) -> rusqlite::Result<ArticleNonColle> {
    Ok(ArticleNonColle {
        id: row.get(0)?,
        affaire_id: row.get(1)?,
        ar: row.get(2)?,
        reference: row.get(3)?,
        designation: row.get(4)?,
        dim1_mm: row.get(5)?,
        dim2_mm: row.get(6)?,
        dim3_mm: row.get(7)?,
        poids_unitaire_kg: row.get(8)?,
        quantite: row.get(9)?,
        ligne_brute: row.get(10)?,
        cree_le: row.get(11)?,
        cree_par: row.get(12)?,
    })
}

fn affaire_de(conn: &Connection, id: i64) -> Result<i64, String> {
    conn.query_row("SELECT affaire_id FROM article_non_colle WHERE id = ?1", [id], |r| r.get(0))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_articles_non_colles(db: State<Db>, affaire_id: i64) -> Result<Vec<ArticleNonColle>, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let mut stmt = conn
        .prepare(&format!("SELECT {SELECT_COLS} FROM article_non_colle WHERE affaire_id = ?1 ORDER BY id"))
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([affaire_id], map_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Enregistre les lignes refusées au collage (par la personne qui colle, pas besoin d'être admin).
#[tauri::command]
pub fn create_articles_non_colles(
    db: State<Db>,
    affaire_id: i64,
    lignes: Vec<NewArticleNonColle>,
    trigramme: String,
) -> Result<(), String> {
    let mut guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_mut().ok_or("base de données non initialisée")?;
    require_lock(conn, &format!("affaire:{affaire_id}"), &trigramme)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for l in &lignes {
        let a = &l.article;
        tx.execute(
            "INSERT INTO article_non_colle (affaire_id, ar, reference, designation, dim1_mm, dim2_mm, dim3_mm,
                 poids_unitaire_kg, quantite, ligne_brute, cree_par)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                affaire_id, a.ar, a.reference, a.designation, a.dim1_mm, a.dim2_mm, a.dim3_mm,
                a.poids_unitaire_kg, a.quantite, l.ligne_brute, trigramme
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_article_non_colle(
    db: State<Db>,
    session: State<AdminSession>,
    id: i64,
    article: NewArticle,
    trigramme: String,
) -> Result<(), String> {
    require_admin(&session)?;
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock(conn, &format!("affaire:{}", affaire_de(conn, id)?), &trigramme)?;
    conn.execute(
        "UPDATE article_non_colle SET ar = ?1, reference = ?2, designation = ?3, dim1_mm = ?4, dim2_mm = ?5,
             dim3_mm = ?6, poids_unitaire_kg = ?7, quantite = ?8 WHERE id = ?9",
        rusqlite::params![
            article.ar, article.reference, article.designation, article.dim1_mm, article.dim2_mm,
            article.dim3_mm, article.poids_unitaire_kg, article.quantite, id
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_article_non_colle(db: State<Db>, session: State<AdminSession>, id: i64, trigramme: String) -> Result<(), String> {
    require_admin(&session)?;
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock(conn, &format!("affaire:{}", affaire_de(conn, id)?), &trigramme)?;
    conn.execute("DELETE FROM article_non_colle WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Ajoute la ligne au tableau d'articles de l'affaire (en fin de liste) et la retire des lignes
/// non collées.
pub fn integrer(conn: &mut Connection, id: i64) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO article (affaire_id, ar, reference, designation, dim1_mm, dim2_mm, dim3_mm, poids_unitaire_kg, quantite, ordre)
         SELECT affaire_id, ar, reference, designation, dim1_mm, dim2_mm, dim3_mm, poids_unitaire_kg, quantite,
                (SELECT COALESCE(MAX(ordre), -1) + 1 FROM article a WHERE a.affaire_id = n.affaire_id)
         FROM article_non_colle n WHERE n.id = ?1",
        [id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM article_non_colle WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn integrer_article_non_colle(db: State<Db>, session: State<AdminSession>, id: i64, trigramme: String) -> Result<(), String> {
    require_admin(&session)?;
    let mut guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_mut().ok_or("base de données non initialisée")?;
    require_lock(conn, &format!("affaire:{}", affaire_de(conn, id)?), &trigramme)?;
    integrer(conn, id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ligne_non_collee_integree_au_tableau() {
        let dir = std::env::temp_dir().join(format!("caisses-test-noncolle-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let mut conn = crate::db::open_at(&dir);
        conn.execute_batch(
            "INSERT INTO affaire (id, nom) VALUES (1, 'AFFAIRE1');
             INSERT INTO article (affaire_id, ar, reference, designation, dim1_mm, dim2_mm, dim3_mm, poids_unitaire_kg, quantite, ordre)
                 VALUES (1, 'AR_A', '', '', 1, 1, 1, 1, 1, 0);
             INSERT INTO article_non_colle (id, affaire_id, ar, reference, designation, dim1_mm, dim2_mm, dim3_mm, poids_unitaire_kg, quantite, ligne_brute, cree_par)
                 VALUES (5, 1, 'TA0001', 'REF', 'Désig', 10, 20, 30, 0.5, 2, 'TA0001\tREF', 'AJC');",
        )
        .unwrap();
        integrer(&mut conn, 5).unwrap();
        let (ar, ordre, qte): (String, i64, i64) = conn
            .query_row("SELECT ar, ordre, quantite FROM article WHERE ar = 'TA0001'", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap();
        assert_eq!((ar.as_str(), ordre, qte), ("TA0001", 1, 2));
        let restantes: i64 = conn.query_row("SELECT COUNT(*) FROM article_non_colle", [], |r| r.get(0)).unwrap();
        assert_eq!(restantes, 0);
        // Supprimer l'affaire supprime ses lignes non collées.
        conn.execute("INSERT INTO article_non_colle (affaire_id, ligne_brute, cree_par) VALUES (1, 'X', 'AJC')", []).unwrap();
        conn.execute("DELETE FROM affaire WHERE id = 1", []).unwrap();
        let restantes: i64 = conn.query_row("SELECT COUNT(*) FROM article_non_colle", [], |r| r.get(0)).unwrap();
        assert_eq!(restantes, 0);
    }
}
