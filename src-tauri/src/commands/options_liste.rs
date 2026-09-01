use crate::commands::locks::require_lock;
use crate::db::Db;
use crate::models::OptionListe;
use tauri::State;

const LISTES_VALIDES: &[&str] = &["moteurs", "module_lineaire", "terminaux"];

// Colonnes portant la valeur dans les lignes existantes, par liste. `terminaux` n'existe que
// sur `demande` (pas de colonne équivalente sur `demande_caisse`). Renommer une option
// répercute la nouvelle valeur sur ces colonnes ; supprimer une option ne les touche pas
// (les lignes gardent le texte, cf. delete_option_liste).
fn colonnes_pour_liste(liste: &str) -> &'static [(&'static str, &'static str)] {
    match liste {
        "moteurs" => &[("demande", "moteurs"), ("demande_caisse", "moteurs")],
        "module_lineaire" => &[("demande", "module_lineaire"), ("demande_caisse", "module_lineaire")],
        "terminaux" => &[("demande", "terminaux")],
        _ => &[],
    }
}

fn compter_lignes_utilisant(conn: &rusqlite::Connection, liste: &str, valeur: &str) -> Result<i64, String> {
    let mut total = 0i64;
    for (table, colonne) in colonnes_pour_liste(liste) {
        let n: i64 = conn
            .query_row(
                &format!("SELECT COUNT(*) FROM {table} WHERE {colonne} = ?1"),
                [valeur],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        total += n;
    }
    Ok(total)
}

fn map_row(row: &rusqlite::Row) -> rusqlite::Result<OptionListe> {
    Ok(OptionListe {
        id: row.get(0)?,
        liste: row.get(1)?,
        valeur: row.get(2)?,
        ordre: row.get(3)?,
    })
}

#[tauri::command]
pub fn list_options_liste(db: State<Db>) -> Result<Vec<OptionListe>, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let mut stmt = conn
        .prepare("SELECT id, liste, valeur, ordre FROM option_liste ORDER BY liste, ordre, id")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_option_liste(
    db: State<Db>,
    liste: String,
    valeur: String,
    trigramme: String,
) -> Result<OptionListe, String> {
    let liste = liste.trim().to_string();
    let valeur = valeur.trim().to_string();
    if !LISTES_VALIDES.contains(&liste.as_str()) {
        return Err(format!("liste inconnue : {liste}"));
    }
    if valeur.is_empty() {
        return Err("la valeur ne peut pas être vide".into());
    }

    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock(conn, "demandes", &trigramme)?;

    let ordre: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(ordre), -1) + 1 FROM option_liste WHERE liste = ?1",
            [&liste],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO option_liste (liste, valeur, ordre) VALUES (?1, ?2, ?3)
         ON CONFLICT(liste, valeur) DO NOTHING",
        rusqlite::params![liste, valeur, ordre],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, liste, valeur, ordre FROM option_liste WHERE liste = ?1 AND valeur = ?2",
        rusqlite::params![liste, valeur],
        map_row,
    )
    .map_err(|e| e.to_string())
}

/// Nombre de lignes (`demande` + `demande_caisse`) qui utilisent encore la valeur d'une option —
/// pour l'avertissement avant suppression / avant renommage côté UI.
#[tauri::command]
pub fn count_option_liste_usage(db: State<Db>, id: i64) -> Result<i64, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let (liste, valeur): (String, String) = conn
        .query_row("SELECT liste, valeur FROM option_liste WHERE id = ?1", [id], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .map_err(|e| e.to_string())?;
    compter_lignes_utilisant(conn, &liste, &valeur)
}

/// Renomme une option ET répercute la nouvelle valeur sur toutes les lignes `demande` /
/// `demande_caisse` qui portaient l'ancienne. En une transaction. Refuse si la nouvelle valeur
/// existe déjà pour cette liste (contrainte UNIQUE).
#[tauri::command]
pub fn rename_option_liste(db: State<Db>, id: i64, valeur: String, trigramme: String) -> Result<OptionListe, String> {
    let nouvelle = valeur.trim().to_string();
    if nouvelle.is_empty() {
        return Err("la valeur ne peut pas être vide".into());
    }

    let mut guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_mut().ok_or("base de données non initialisée")?;
    require_lock(conn, "demandes", &trigramme)?;

    let (liste, ancienne): (String, String) = conn
        .query_row("SELECT liste, valeur FROM option_liste WHERE id = ?1", [id], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .map_err(|e| e.to_string())?;

    if nouvelle == ancienne {
        return conn
            .query_row("SELECT id, liste, valeur, ordre FROM option_liste WHERE id = ?1", [id], map_row)
            .map_err(|e| e.to_string());
    }

    let existe: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM option_liste WHERE liste = ?1 AND valeur = ?2 AND id != ?3)",
            rusqlite::params![liste, nouvelle, id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if existe {
        return Err(format!("« {nouvelle} » existe déjà dans cette liste."));
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE option_liste SET valeur = ?1 WHERE id = ?2",
        rusqlite::params![nouvelle, id],
    )
    .map_err(|e| e.to_string())?;
    for (table, colonne) in colonnes_pour_liste(&liste) {
        tx.execute(
            &format!("UPDATE {table} SET {colonne} = ?1 WHERE {colonne} = ?2"),
            rusqlite::params![nouvelle, ancienne],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;

    conn.query_row("SELECT id, liste, valeur, ordre FROM option_liste WHERE id = ?1", [id], map_row)
        .map_err(|e| e.to_string())
}

/// Supprime l'option seule — les lignes qui portaient la valeur la gardent en texte libre
/// (l'avertissement « X lignes l'utilisent » est fait côté UI via count_option_liste_usage).
#[tauri::command]
pub fn delete_option_liste(db: State<Db>, id: i64, trigramme: String) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock(conn, "demandes", &trigramme)?;
    conn.execute("DELETE FROM option_liste WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
