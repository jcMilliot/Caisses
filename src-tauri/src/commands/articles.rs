use crate::db::Db;
use crate::models::{Article, NewArticle};
use tauri::State;

fn map_row(row: &rusqlite::Row) -> rusqlite::Result<Article> {
    Ok(Article {
        id: row.get(0)?,
        affaire_id: row.get(1)?,
        caisse_id: row.get(2)?,
        ar: row.get(3)?,
        reference: row.get(4)?,
        designation: row.get(5)?,
        dim1_mm: row.get(6)?,
        dim2_mm: row.get(7)?,
        dim3_mm: row.get(8)?,
        poids_unitaire_kg: row.get(9)?,
        quantite: row.get(10)?,
        ordre: row.get(11)?,
    })
}

const SELECT_COLS: &str = "id, affaire_id, caisse_id, ar, reference, designation, dim1_mm, dim2_mm, dim3_mm, poids_unitaire_kg, quantite, ordre";

#[tauri::command]
pub fn list_articles(db: State<Db>, affaire_id: i64) -> Result<Vec<Article>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let sql = format!(
        "SELECT {} FROM article WHERE affaire_id = ?1 ORDER BY ordre, id",
        SELECT_COLS
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([affaire_id], map_row)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_article(db: State<Db>, affaire_id: i64, article: NewArticle) -> Result<Article, String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let id = insert_article(&mut conn, affaire_id, &article)?;
    let sql = format!("SELECT {} FROM article WHERE id = ?1", SELECT_COLS);
    conn.query_row(&sql, [id], map_row).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn bulk_create_articles(
    db: State<Db>,
    affaire_id: i64,
    articles: Vec<NewArticle>,
) -> Result<Vec<Article>, String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut ids = Vec::with_capacity(articles.len());
    {
        let mut ordre: i64 = tx
            .query_row(
                "SELECT COALESCE(MAX(ordre), -1) + 1 FROM article WHERE affaire_id = ?1",
                [affaire_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        for a in &articles {
            tx.execute(
                "INSERT INTO article (affaire_id, ar, reference, designation, dim1_mm, dim2_mm, dim3_mm, poids_unitaire_kg, quantite, ordre)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                rusqlite::params![
                    affaire_id,
                    a.ar,
                    a.reference,
                    a.designation,
                    a.dim1_mm,
                    a.dim2_mm,
                    a.dim3_mm,
                    a.poids_unitaire_kg,
                    a.quantite,
                    ordre,
                ],
            )
            .map_err(|e| e.to_string())?;
            ids.push(tx.last_insert_rowid());
            ordre += 1;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;

    let sql = format!("SELECT {} FROM article WHERE id = ?1", SELECT_COLS);
    let mut result = Vec::with_capacity(ids.len());
    for id in ids {
        result.push(conn.query_row(&sql, [id], map_row).map_err(|e| e.to_string())?);
    }
    Ok(result)
}

fn insert_article(
    conn: &mut rusqlite::Connection,
    affaire_id: i64,
    article: &NewArticle,
) -> Result<i64, String> {
    let ordre: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(ordre), -1) + 1 FROM article WHERE affaire_id = ?1",
            [affaire_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO article (affaire_id, ar, reference, designation, dim1_mm, dim2_mm, dim3_mm, poids_unitaire_kg, quantite, ordre)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![
            affaire_id,
            article.ar,
            article.reference,
            article.designation,
            article.dim1_mm,
            article.dim2_mm,
            article.dim3_mm,
            article.poids_unitaire_kg,
            article.quantite,
            ordre,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn update_article(
    db: State<Db>,
    id: i64,
    ar: String,
    reference: String,
    designation: String,
    dim1_mm: f64,
    dim2_mm: f64,
    dim3_mm: f64,
    poids_unitaire_kg: f64,
    quantite: i64,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE article SET ar = ?1, reference = ?2, designation = ?3, dim1_mm = ?4, dim2_mm = ?5,
         dim3_mm = ?6, poids_unitaire_kg = ?7, quantite = ?8 WHERE id = ?9",
        rusqlite::params![
            ar,
            reference,
            designation,
            dim1_mm,
            dim2_mm,
            dim3_mm,
            poids_unitaire_kg,
            quantite,
            id
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_article(db: State<Db>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM article WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Assigne une liste d'articles à une caisse (ou les désassigne si caisse_id est None).
#[tauri::command]
pub fn assign_articles(db: State<Db>, article_ids: Vec<i64>, caisse_id: Option<i64>) -> Result<(), String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for id in article_ids {
        tx.execute(
            "UPDATE article SET caisse_id = ?1 WHERE id = ?2",
            rusqlite::params![caisse_id, id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
