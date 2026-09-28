use crate::db::Db;
use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use rusqlite::{Connection, OptionalExtension};
use std::sync::Mutex;
use tauri::State;

// Trigramme administrateur (décision 2026-09-28) : choisir ce trigramme exige un mot de passe,
// créé au premier choix s'il n'existe pas encore en base. Tout autre trigramme ayant une ligne
// dans `compte` exige aussi le sien.
pub const TRIGRAMME_ADMIN: &str = "AJC";

const LONGUEUR_MIN_MOT_DE_PASSE: usize = 6;

/// Session admin du processus : `Some(trigramme)` une fois le mot de passe vérifié. Vit en
/// mémoire uniquement → redemandé à chaque lancement de l'app.
#[derive(Default)]
pub struct AdminSession(pub Mutex<Option<String>>);

/// Refuse l'appel si aucune session admin n'est ouverte sur ce poste.
pub fn require_admin(session: &AdminSession) -> Result<(), String> {
    let guard = session.0.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        Ok(())
    } else {
        Err("Accès réservé à l'administrateur (mot de passe requis)".to_string())
    }
}

fn ouvrir_session(session: &AdminSession, trigramme: &str) -> Result<(), String> {
    *session.0.lock().map_err(|e| e.to_string())? = Some(trigramme.to_string());
    Ok(())
}

fn hash_de(conn: &Connection, trigramme: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT mot_de_passe_hash FROM compte WHERE trigramme = ?1",
        [trigramme],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn hacher(mot_de_passe: &str) -> Result<String, String> {
    let sel = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(mot_de_passe.as_bytes(), &sel)
        .map(|h| h.to_string())
        .map_err(|e| e.to_string())
}

fn verifier(mot_de_passe: &str, hash: &str) -> bool {
    PasswordHash::new(hash)
        .map(|h| Argon2::default().verify_password(mot_de_passe.as_bytes(), &h).is_ok())
        .unwrap_or(false)
}

fn valider_nouveau(mot_de_passe: &str) -> Result<(), String> {
    if mot_de_passe.chars().count() < LONGUEUR_MIN_MOT_DE_PASSE {
        return Err(format!(
            "Le mot de passe doit contenir au moins {LONGUEUR_MIN_MOT_DE_PASSE} caractères"
        ));
    }
    Ok(())
}

/// Vérifie le mot de passe d'un trigramme protégé, ou le crée s'il s'agit du trigramme admin et
/// qu'aucun n'est encore défini. Sans effet (Ok) pour un trigramme non protégé.
/// Renvoie true si le trigramme est protégé (donc si une session admin doit être ouverte).
pub fn verifier_ou_creer(conn: &Connection, trigramme: &str, mot_de_passe: Option<&str>) -> Result<bool, String> {
    match hash_de(conn, trigramme)? {
        Some(hash) => {
            let mdp = mot_de_passe.ok_or("Mot de passe requis pour ce trigramme")?;
            if verifier(mdp, &hash) {
                Ok(true)
            } else {
                Err("Mot de passe incorrect".to_string())
            }
        }
        None if trigramme == TRIGRAMME_ADMIN => {
            let mdp = mot_de_passe.ok_or("Mot de passe requis pour ce trigramme")?;
            valider_nouveau(mdp)?;
            conn.execute(
                "INSERT INTO compte (trigramme, mot_de_passe_hash) VALUES (?1, ?2)",
                rusqlite::params![trigramme, hacher(mdp)?],
            )
            .map_err(|e| e.to_string())?;
            Ok(true)
        }
        None => Ok(false),
    }
}

#[derive(serde::Serialize)]
pub struct CompteStatus {
    /// Ce trigramme exige un mot de passe.
    pub requiert_mot_de_passe: bool,
    /// Un mot de passe existe déjà (sinon il sera créé à la saisie).
    pub mot_de_passe_defini: bool,
}

#[tauri::command]
pub fn get_compte_status(db: State<Db>, trigramme: String) -> Result<CompteStatus, String> {
    let trigramme = trigramme.trim().to_uppercase();
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let defini = hash_de(conn, &trigramme)?.is_some();
    Ok(CompteStatus {
        requiert_mot_de_passe: defini || trigramme == TRIGRAMME_ADMIN,
        mot_de_passe_defini: defini,
    })
}

/// Ouvre la session admin (page Admin). Crée le mot de passe s'il n'existe pas encore.
#[tauri::command]
pub async fn admin_unlock(
    db: State<'_, Db>,
    session: State<'_, AdminSession>,
    trigramme: String,
    mot_de_passe: String,
) -> Result<(), String> {
    let trigramme = trigramme.trim().to_uppercase();
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    if !verifier_ou_creer(conn, &trigramme, Some(&mot_de_passe))? {
        return Err("Ce trigramme n'a pas d'accès administrateur".to_string());
    }
    ouvrir_session(&session, &trigramme)
}

#[tauri::command]
pub fn admin_session_active(session: State<AdminSession>) -> Result<bool, String> {
    Ok(session.0.lock().map_err(|e| e.to_string())?.is_some())
}

#[tauri::command]
pub fn admin_lock(session: State<AdminSession>) -> Result<(), String> {
    *session.0.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

#[tauri::command]
pub async fn change_mot_de_passe(
    db: State<'_, Db>,
    session: State<'_, AdminSession>,
    ancien: String,
    nouveau: String,
) -> Result<(), String> {
    let trigramme = session
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("Accès réservé à l'administrateur (mot de passe requis)")?;
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let hash = hash_de(conn, &trigramme)?.ok_or("Aucun mot de passe défini pour ce compte")?;
    if !verifier(&ancien, &hash) {
        return Err("Mot de passe actuel incorrect".to_string());
    }
    valider_nouveau(&nouveau)?;
    conn.execute(
        "UPDATE compte SET mot_de_passe_hash = ?1, modifie_le = datetime('now') WHERE trigramme = ?2",
        rusqlite::params![hacher(&nouveau)?, trigramme],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Enregistre (ou rafraîchit) le trigramme du poste dans `utilisateur`. Appelé au démarrage.
pub fn noter_connexion(conn: &Connection, trigramme: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO utilisateur (trigramme) VALUES (?1)
         ON CONFLICT(trigramme) DO UPDATE SET derniere_connexion = datetime('now')",
        [trigramme],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn enregistrer_connexion(db: State<Db>, trigramme: String) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    noter_connexion(conn, &trigramme.trim().to_uppercase())
}

#[derive(serde::Serialize)]
pub struct Utilisateur {
    pub trigramme: String,
    pub premiere_connexion: String,
    pub derniere_connexion: String,
    /// Rôle du compte protégé (ex. "admin"), None pour un trigramme simple.
    pub role: Option<String>,
}

#[tauri::command]
pub fn list_utilisateurs(db: State<Db>, session: State<AdminSession>) -> Result<Vec<Utilisateur>, String> {
    require_admin(&session)?;
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let mut stmt = conn
        .prepare(
            "SELECT u.trigramme, u.premiere_connexion, u.derniere_connexion, c.role
             FROM utilisateur u LEFT JOIN compte c ON c.trigramme = u.trigramme
             ORDER BY u.derniere_connexion DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Utilisateur {
                trigramme: row.get(0)?,
                premiere_connexion: row.get(1)?,
                derniere_connexion: row.get(2)?,
                role: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
