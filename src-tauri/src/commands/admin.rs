use crate::db::Db;
use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use rusqlite::{Connection, OptionalExtension};
use std::sync::Mutex;
use tauri::State;

// Rôles (décision 2026-09-30, `utilisateur.role`) : un trigramme au rôle 'admin' exige son
// mot de passe personnel (table `compte`), créé à sa première saisie ; 'lecteur' ne peut rien
// modifier (cf. `refuser_lecteur`, appelé par `require_lock`) ; 'utilisateur' = défaut.
pub const ROLE_ADMIN: &str = "admin";
pub const ROLE_LECTEUR: &str = "lecteur";
pub const ROLE_UTILISATEUR: &str = "utilisateur";
const ROLES: [&str; 3] = [ROLE_UTILISATEUR, ROLE_LECTEUR, ROLE_ADMIN];
/// Administrateur permanent (demande de l'utilisateur, 2026-09-30) : son rôle ne peut pas changer.
pub const ADMIN_PERMANENT: &str = "AJC";

/// Rôle d'un trigramme ('utilisateur' s'il n'est pas encore connu).
pub fn role_de(conn: &Connection, trigramme: &str) -> Result<String, String> {
    Ok(conn
        .query_row("SELECT role FROM utilisateur WHERE trigramme = ?1", [trigramme], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| ROLE_UTILISATEUR.to_string()))
}

/// Refuse toute modification à un trigramme au rôle Lecteur.
pub fn refuser_lecteur(conn: &Connection, trigramme: &str) -> Result<(), String> {
    if role_de(conn, trigramme)? == ROLE_LECTEUR {
        return Err("Accès en lecture seule : le rôle Lecteur ne permet pas de modifier.".to_string());
    }
    Ok(())
}

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

/// Vérifie le mot de passe d'un administrateur, ou le crée s'il n'en a pas encore. Sans effet
/// (Ok(false)) pour un trigramme qui n'est pas administrateur.
/// Renvoie true si le trigramme est administrateur (donc si une session admin doit être ouverte).
pub fn verifier_ou_creer(conn: &Connection, trigramme: &str, mot_de_passe: Option<&str>) -> Result<bool, String> {
    if role_de(conn, trigramme)? != ROLE_ADMIN {
        return Ok(false);
    }
    match hash_de(conn, trigramme)? {
        Some(hash) => {
            let mdp = mot_de_passe.ok_or("Mot de passe requis pour ce trigramme")?;
            if verifier(mdp, &hash) {
                Ok(true)
            } else {
                Err("Mot de passe incorrect".to_string())
            }
        }
        None => {
            let mdp = mot_de_passe.ok_or("Mot de passe requis pour ce trigramme")?;
            valider_nouveau(mdp)?;
            conn.execute(
                "INSERT INTO compte (trigramme, mot_de_passe_hash) VALUES (?1, ?2)",
                rusqlite::params![trigramme, hacher(mdp)?],
            )
            .map_err(|e| e.to_string())?;
            Ok(true)
        }
    }
}

// --- Code de secours (mot de passe oublié, décision 2026-09-30) ------------------------------

// Sans caractères ambigus (0/O, 1/I/L) ; 12 caractères ≈ 59 bits.
const ALPHABET_CODE: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";

fn generer_code() -> String {
    use argon2::password_hash::rand_core::RngCore;
    let brut: String = (0..12)
        .map(|_| ALPHABET_CODE[(OsRng.next_u32() as usize) % ALPHABET_CODE.len()] as char)
        .collect();
    format!("{}-{}-{}", &brut[0..4], &brut[4..8], &brut[8..12])
}

fn normaliser_code(code: &str) -> String {
    code.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_uppercase()
}

/// Crée (ou remplace) le code de secours d'un administrateur et le renvoie en clair — c'est la
/// seule fois qu'il est visible.
pub fn creer_code_secours(conn: &Connection, trigramme: &str) -> Result<String, String> {
    let code = generer_code();
    let n = conn
        .execute(
            "UPDATE compte SET code_secours_hash = ?1 WHERE trigramme = ?2",
            rusqlite::params![hacher(&normaliser_code(&code))?, trigramme],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("Aucun mot de passe défini pour ce compte".to_string());
    }
    Ok(code)
}

pub fn mot_de_passe_defini(conn: &Connection, trigramme: &str) -> Result<bool, String> {
    Ok(hash_de(conn, trigramme)?.is_some())
}

/// Mot de passe oublié : vérifie le code de secours, remplace le mot de passe et renvoie un
/// nouveau code (l'ancien ne sert plus).
pub fn reinitialiser_avec_code(conn: &Connection, trigramme: &str, code: &str, nouveau: &str) -> Result<String, String> {
    if role_de(conn, trigramme)? != ROLE_ADMIN {
        return Err("Ce trigramme n'a pas d'accès administrateur".to_string());
    }
    let hash_code: Option<String> = conn
        .query_row("SELECT code_secours_hash FROM compte WHERE trigramme = ?1", [trigramme], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();
    let hash_code = hash_code.ok_or("Aucun code de secours pour ce compte : demandez à un autre administrateur de réinitialiser le mot de passe")?;
    if !verifier(&normaliser_code(code), &hash_code) {
        return Err("Code de secours incorrect".to_string());
    }
    valider_nouveau(nouveau)?;
    conn.execute(
        "UPDATE compte SET mot_de_passe_hash = ?1, modifie_le = datetime('now') WHERE trigramme = ?2",
        rusqlite::params![hacher(nouveau)?, trigramme],
    )
    .map_err(|e| e.to_string())?;
    creer_code_secours(conn, trigramme)
}

#[tauri::command]
pub async fn reinitialiser_mot_de_passe_par_code(
    db: State<'_, Db>,
    trigramme: String,
    code: String,
    nouveau: String,
) -> Result<String, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    reinitialiser_avec_code(conn, &trigramme.trim().to_uppercase(), &code, &nouveau)
}

/// Nouveau code de secours pour l'administrateur connecté (l'ancien ne sert plus).
#[tauri::command]
pub async fn regenerer_code_secours(db: State<'_, Db>, session: State<'_, AdminSession>) -> Result<String, String> {
    let trigramme = session
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("Accès réservé à l'administrateur (mot de passe requis)")?;
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    creer_code_secours(conn, &trigramme)
}

/// Un administrateur efface le mot de passe d'un autre administrateur, qui en recréera un (avec
/// un nouveau code de secours) à sa prochaine saisie.
#[tauri::command]
pub fn reinitialiser_mot_de_passe_admin(db: State<Db>, session: State<AdminSession>, trigramme: String) -> Result<(), String> {
    let courant = session
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("Accès réservé à l'administrateur (mot de passe requis)")?;
    let trigramme = trigramme.trim().to_uppercase();
    if trigramme == courant {
        return Err("Pour votre propre compte, utilisez « Changer le mot de passe ».".to_string());
    }
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    conn.execute("DELETE FROM compte WHERE trigramme = ?1", [&trigramme])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(serde::Serialize)]
pub struct CompteStatus {
    /// Ce trigramme exige un mot de passe.
    pub requiert_mot_de_passe: bool,
    /// Un mot de passe existe déjà (sinon il sera créé à la saisie).
    pub mot_de_passe_defini: bool,
    /// Un code de secours existe (sinon « Mot de passe oublié ? » est impossible).
    pub code_secours_defini: bool,
}

#[tauri::command]
pub fn get_compte_status(db: State<Db>, trigramme: String) -> Result<CompteStatus, String> {
    let trigramme = trigramme.trim().to_uppercase();
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let code_secours_defini: bool = conn
        .query_row(
            "SELECT code_secours_hash IS NOT NULL FROM compte WHERE trigramme = ?1",
            [&trigramme],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(false);
    Ok(CompteStatus {
        requiert_mot_de_passe: role_de(conn, &trigramme)? == ROLE_ADMIN,
        mot_de_passe_defini: hash_de(conn, &trigramme)?.is_some(),
        code_secours_defini,
    })
}

/// Ouvre la session admin (page Admin). Crée le mot de passe s'il n'existe pas encore, et renvoie
/// alors le code de secours à afficher (une seule fois).
#[tauri::command]
pub async fn admin_unlock(
    db: State<'_, Db>,
    session: State<'_, AdminSession>,
    trigramme: String,
    mot_de_passe: String,
) -> Result<Option<String>, String> {
    let trigramme = trigramme.trim().to_uppercase();
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let creation = !mot_de_passe_defini(conn, &trigramme)?;
    if !verifier_ou_creer(conn, &trigramme, Some(&mot_de_passe))? {
        return Err("Ce trigramme n'a pas d'accès administrateur".to_string());
    }
    ouvrir_session(&session, &trigramme)?;
    Ok(if creation { Some(creer_code_secours(conn, &trigramme)?) } else { None })
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
    /// 'utilisateur' | 'lecteur' | 'admin'
    pub role: String,
    /// Administrateur ayant déjà créé son mot de passe.
    pub mot_de_passe_defini: bool,
}

#[tauri::command]
pub fn list_utilisateurs(db: State<Db>, session: State<AdminSession>) -> Result<Vec<Utilisateur>, String> {
    require_admin(&session)?;
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let mut stmt = conn
        .prepare(
            "SELECT u.trigramme, u.premiere_connexion, u.derniere_connexion, u.role, c.trigramme IS NOT NULL
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
                mot_de_passe_defini: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_role(db: State<Db>, trigramme: String) -> Result<String, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    role_de(conn, &trigramme.trim().to_uppercase())
}

/// Change le rôle d'un trigramme (Admin › Utilisateurs). Refuse de retirer le dernier
/// administrateur. Un admin rétrogradé perd son mot de passe (recréé s'il redevient admin).
pub fn changer_role(conn: &Connection, trigramme: &str, role: &str) -> Result<(), String> {
    if !ROLES.contains(&role) {
        return Err(format!("Rôle inconnu : {role}"));
    }
    if trigramme == ADMIN_PERMANENT && role != ROLE_ADMIN {
        return Err(format!("{ADMIN_PERMANENT} reste toujours administrateur."));
    }
    if role != ROLE_ADMIN && role_de(conn, trigramme)? == ROLE_ADMIN {
        let nb_admins: i64 = conn
            .query_row("SELECT COUNT(*) FROM utilisateur WHERE role = ?1", [ROLE_ADMIN], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if nb_admins <= 1 {
            return Err("Impossible de retirer le dernier administrateur.".to_string());
        }
        conn.execute("DELETE FROM compte WHERE trigramme = ?1", [trigramme])
            .map_err(|e| e.to_string())?;
    }
    conn.execute(
        "INSERT INTO utilisateur (trigramme, role) VALUES (?1, ?2)
         ON CONFLICT(trigramme) DO UPDATE SET role = excluded.role",
        [trigramme, role],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_role_utilisateur(
    db: State<Db>,
    session: State<AdminSession>,
    trigramme: String,
    role: String,
) -> Result<(), String> {
    require_admin(&session)?;
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    changer_role(conn, &trigramme.trim().to_uppercase(), &role)
}

/// Déclare un trigramme à l'avance (ex. futur administrateur, avant son premier lancement).
#[tauri::command]
pub fn ajouter_utilisateur(
    db: State<Db>,
    session: State<AdminSession>,
    trigramme: String,
    role: String,
) -> Result<(), String> {
    require_admin(&session)?;
    let trigramme = trigramme.trim().to_uppercase();
    if trigramme.len() != 3 || !trigramme.chars().all(|c| c.is_ascii_alphabetic()) {
        return Err("Le trigramme doit contenir exactement 3 lettres".to_string());
    }
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let existe: bool = conn
        .query_row("SELECT EXISTS(SELECT 1 FROM utilisateur WHERE trigramme = ?1)", [&trigramme], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if existe {
        return Err(format!("{trigramme} est déjà dans la liste"));
    }
    changer_role(conn, &trigramme, &role)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roles_mot_de_passe_et_dernier_admin() {
        let dir = std::env::temp_dir().join(format!("caisses-test-roles-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let conn = crate::db::open_at(&dir);
        // AJC admin par la migration ; un inconnu est simple utilisateur, sans mot de passe.
        assert_eq!(role_de(&conn, "AJC").unwrap(), ROLE_ADMIN);
        assert_eq!(role_de(&conn, "XYZ").unwrap(), ROLE_UTILISATEUR);
        assert!(!verifier_ou_creer(&conn, "XYZ", None).unwrap());
        // AJC : administrateur permanent.
        assert!(changer_role(&conn, "AJC", ROLE_UTILISATEUR).is_err());
        // Nouvel admin : mot de passe exigé, créé à la première saisie.
        changer_role(&conn, "BCD", ROLE_ADMIN).unwrap();
        assert!(verifier_ou_creer(&conn, "BCD", None).is_err());
        assert!(verifier_ou_creer(&conn, "BCD", Some("secret123")).unwrap());
        assert!(verifier_ou_creer(&conn, "BCD", Some("mauvais1")).is_err());
        // Rétrogradé en lecteur : mot de passe supprimé, modifications refusées.
        changer_role(&conn, "BCD", ROLE_LECTEUR).unwrap();
        assert!(hash_de(&conn, "BCD").unwrap().is_none());
        assert!(refuser_lecteur(&conn, "BCD").is_err());
        assert!(refuser_lecteur(&conn, "XYZ").is_ok());
        assert!(crate::commands::locks::require_lock(&conn, "demandes", "BCD").is_err());
        assert!(changer_role(&conn, "BCD", "chef").is_err());
        // Code de secours : réinitialisation du mot de passe, puis l'ancien code ne sert plus.
        changer_role(&conn, "CDE", ROLE_ADMIN).unwrap();
        verifier_ou_creer(&conn, "CDE", Some("secret123")).unwrap();
        let code = creer_code_secours(&conn, "CDE").unwrap();
        assert!(reinitialiser_avec_code(&conn, "CDE", "AAAA-BBBB-CCCC", "nouveau123").is_err());
        let nouveau_code = reinitialiser_avec_code(&conn, "CDE", &code.to_lowercase().replace('-', " "), "nouveau123").unwrap();
        assert!(verifier_ou_creer(&conn, "CDE", Some("nouveau123")).unwrap());
        assert!(reinitialiser_avec_code(&conn, "CDE", &code, "autre1234").is_err());
        assert!(reinitialiser_avec_code(&conn, "CDE", &nouveau_code, "court").is_err());
        // Dernier admin (hors AJC) : BCD redevient admin, puis AJC reste le seul → BCD rétrogradable.
        changer_role(&conn, "BCD", ROLE_ADMIN).unwrap();
        assert!(changer_role(&conn, "BCD", ROLE_UTILISATEUR).is_ok());
        assert!(changer_role(&conn, "AJC", ROLE_ADMIN).is_ok());
    }
}
