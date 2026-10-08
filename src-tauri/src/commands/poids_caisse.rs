//! Estimation du poids des caisses (2026-10-08) : caisses réellement pesées (Admin › Caisses ›
//! Poids) et réglages de l'estimation (masses volumiques, épaisseurs…). Le calcul lui-même est
//! côté frontend (`domain/poidsCaisse.ts`) ; ici, seulement le stockage.

use crate::commands::admin::{require_admin, AdminSession};
use crate::commands::backup::{ecrire, lire};
use crate::db::Db;
use serde::{Deserialize, Serialize};
use tauri::State;

const CLE_REGLAGES: &str = "estimation_poids_caisse";
const MATIERES: &[&str] = &["Contreplaqué", "Bois"];

#[derive(Debug, Serialize)]
pub struct CaissePesee {
    pub id: i64,
    pub affaire: String,
    pub longueur_mm: f64,
    pub largeur_mm: f64,
    pub hauteur_mm: f64,
    pub tare_kg: f64,
    pub nb_pieds: i64,
    pub matiere: String,
    pub mousse_bache: bool,
    pub nb_renforts_longueur: i64,
    pub nb_renforts_largeur: i64,
    pub nb_tasseaux: i64,
}

#[derive(Debug, Deserialize)]
pub struct NewCaissePesee {
    pub affaire: String,
    pub longueur_mm: f64,
    pub largeur_mm: f64,
    pub hauteur_mm: f64,
    pub tare_kg: f64,
    pub nb_pieds: i64,
    pub matiere: String,
    pub mousse_bache: bool,
    pub nb_renforts_longueur: i64,
    pub nb_renforts_largeur: i64,
    pub nb_tasseaux: i64,
}

const SELECT_COLS: &str = "id, affaire, longueur_mm, largeur_mm, hauteur_mm, tare_kg, nb_pieds, matiere, mousse_bache,
    nb_renforts_longueur, nb_renforts_largeur, nb_tasseaux";

fn map_row(r: &rusqlite::Row) -> rusqlite::Result<CaissePesee> {
    Ok(CaissePesee {
        id: r.get(0)?,
        affaire: r.get(1)?,
        longueur_mm: r.get(2)?,
        largeur_mm: r.get(3)?,
        hauteur_mm: r.get(4)?,
        tare_kg: r.get(5)?,
        nb_pieds: r.get(6)?,
        matiere: r.get(7)?,
        mousse_bache: r.get(8)?,
        nb_renforts_longueur: r.get(9)?,
        nb_renforts_largeur: r.get(10)?,
        nb_tasseaux: r.get(11)?,
    })
}

fn verifier(c: &NewCaissePesee) -> Result<(), String> {
    if !(c.longueur_mm > 0.0 && c.largeur_mm > 0.0 && c.hauteur_mm > 0.0) {
        return Err("Les trois dimensions intérieures sont obligatoires".to_string());
    }
    if !(c.tare_kg > 0.0) {
        return Err("Le poids à vide (tare) est obligatoire".to_string());
    }
    if !MATIERES.contains(&c.matiere.as_str()) {
        return Err("Matière inconnue".to_string());
    }
    if c.nb_pieds < 0 || c.nb_renforts_longueur < 0 || c.nb_renforts_largeur < 0 || c.nb_tasseaux < 0 {
        return Err("Les nombres de pieds, renforts et tasseaux ne peuvent pas être négatifs".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn list_caisses_pesees(db: State<Db>) -> Result<Vec<CaissePesee>, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let mut stmt = conn
        .prepare(&format!("SELECT {SELECT_COLS} FROM caisse_pesee ORDER BY id"))
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_caisse_pesee(db: State<Db>, session: State<AdminSession>, caisse: NewCaissePesee) -> Result<(), String> {
    require_admin(&session)?;
    verifier(&caisse)?;
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    conn.execute(
        "INSERT INTO caisse_pesee (affaire, longueur_mm, largeur_mm, hauteur_mm, tare_kg, nb_pieds, matiere, mousse_bache,
                                   nb_renforts_longueur, nb_renforts_largeur, nb_tasseaux)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![
            caisse.affaire.trim(), caisse.longueur_mm, caisse.largeur_mm, caisse.hauteur_mm, caisse.tare_kg, caisse.nb_pieds,
            caisse.matiere, caisse.mousse_bache, caisse.nb_renforts_longueur, caisse.nb_renforts_largeur, caisse.nb_tasseaux,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_caisse_pesee(db: State<Db>, session: State<AdminSession>, id: i64, caisse: NewCaissePesee) -> Result<(), String> {
    require_admin(&session)?;
    verifier(&caisse)?;
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    conn.execute(
        "UPDATE caisse_pesee SET affaire = ?1, longueur_mm = ?2, largeur_mm = ?3, hauteur_mm = ?4, tare_kg = ?5,
                nb_pieds = ?6, matiere = ?7, mousse_bache = ?8, nb_renforts_longueur = ?9, nb_renforts_largeur = ?10,
                nb_tasseaux = ?11
         WHERE id = ?12",
        rusqlite::params![
            caisse.affaire.trim(), caisse.longueur_mm, caisse.largeur_mm, caisse.hauteur_mm, caisse.tare_kg, caisse.nb_pieds,
            caisse.matiere, caisse.mousse_bache, caisse.nb_renforts_longueur, caisse.nb_renforts_largeur, caisse.nb_tasseaux, id,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_caisse_pesee(db: State<Db>, session: State<AdminSession>, id: i64) -> Result<(), String> {
    require_admin(&session)?;
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    conn.execute("DELETE FROM caisse_pesee WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

/// Réglages de l'estimation (JSON, valeurs par défaut côté frontend) ; `None` = jamais réglés.
#[tauri::command]
pub fn get_reglages_poids_caisse(db: State<Db>) -> Result<Option<String>, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    lire(conn, CLE_REGLAGES)
}

#[tauri::command]
pub fn set_reglages_poids_caisse(db: State<Db>, session: State<AdminSession>, reglages: String) -> Result<(), String> {
    require_admin(&session)?;
    let valeur: serde_json::Value = serde_json::from_str(&reglages).map_err(|e| format!("Réglages illisibles : {e}"))?;
    if !valeur.is_object() {
        return Err("Réglages illisibles".to_string());
    }
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    ecrire(conn, CLE_REGLAGES, &reglages)
}
