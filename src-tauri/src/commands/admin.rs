use crate::db::Db;
use rusqlite::{Connection, OptionalExtension};
use std::sync::Mutex;
use tauri::State;

// Rôles (décision 2026-09-30, `utilisateur.role`) : 'admin' ouvre la page Admin ; 'lecteur' ne
// peut rien modifier (cf. `refuser_lecteur`, appelé par `require_lock`) ; 'utilisateur' = défaut.
// Depuis le 2026-10-08, plus de mot de passe propre à Caisses : l'identité vient du compte
// intranet (commands/intranet.rs), qui ouvre aussi la session admin.
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

/// Session admin du processus : `Some(trigramme)` une fois l'administrateur identifié par
/// l'intranet. Vit en mémoire uniquement ; refermée par « Verrouiller » (le mot de passe intranet
/// est alors redemandé) ou à la fermeture de l'app.
#[derive(Default)]
pub struct AdminSession(pub Mutex<Option<String>>);

/// Refuse l'appel si aucune session admin n'est ouverte sur ce poste.
pub fn require_admin(session: &AdminSession) -> Result<(), String> {
    let guard = session.0.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        Ok(())
    } else {
        Err("Accès réservé à l'administrateur (connexion intranet requise)".to_string())
    }
}

/// Ouvre la session admin si `trigramme` est administrateur. Renvoie true si elle est ouverte.
pub fn ouvrir_session_si_admin(conn: &Connection, session: &AdminSession, trigramme: &str) -> Result<bool, String> {
    let admin = role_de(conn, trigramme)? == ROLE_ADMIN;
    *session.0.lock().map_err(|e| e.to_string())? = if admin { Some(trigramme.to_string()) } else { None };
    Ok(admin)
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

/// Enregistre (ou rafraîchit) le trigramme du poste dans `utilisateur`. Appelé à la connexion.
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
}

#[tauri::command]
pub fn list_utilisateurs(db: State<Db>, session: State<AdminSession>) -> Result<Vec<Utilisateur>, String> {
    require_admin(&session)?;
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let mut stmt = conn
        .prepare("SELECT trigramme, premiere_connexion, derniere_connexion, role FROM utilisateur ORDER BY derniere_connexion DESC")
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

#[tauri::command]
pub fn get_role(db: State<Db>, trigramme: String) -> Result<String, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    role_de(conn, &trigramme.trim().to_uppercase())
}

/// Change le rôle d'un trigramme (Admin › Utilisateurs). Refuse de retirer le dernier
/// administrateur, et de changer celui d'AJC.
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

/// Identité valide : trigramme de l'intranet (3 lettres) ou, pour un compte qui n'en a pas, son
/// identifiant (ex. 6 caractères) — lettres et chiffres, 2 à 10 caractères.
pub fn identite_valide(identite: &str) -> bool {
    (2..=10).contains(&identite.len()) && identite.chars().all(|c| c.is_ascii_alphanumeric())
}

/// Déclare un trigramme à l'avance (ex. futur administrateur, avant sa première connexion).
#[tauri::command]
pub fn ajouter_utilisateur(
    db: State<Db>,
    session: State<AdminSession>,
    trigramme: String,
    role: String,
) -> Result<(), String> {
    require_admin(&session)?;
    let trigramme = trigramme.trim().to_uppercase();
    if !identite_valide(&trigramme) {
        return Err("Trigramme (ou identifiant intranet) invalide : lettres et chiffres seulement".to_string());
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
    fn roles_et_dernier_admin() {
        let dir = std::env::temp_dir().join(format!("caisses-test-roles-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let conn = crate::db::open_at(&dir);
        let session = AdminSession::default();
        // AJC admin par la migration ; un inconnu est simple utilisateur.
        assert_eq!(role_de(&conn, "AJC").unwrap(), ROLE_ADMIN);
        assert_eq!(role_de(&conn, "XYZ").unwrap(), ROLE_UTILISATEUR);
        assert!(!ouvrir_session_si_admin(&conn, &session, "XYZ").unwrap());
        assert!(require_admin(&session).is_err());
        assert!(ouvrir_session_si_admin(&conn, &session, "AJC").unwrap());
        assert!(require_admin(&session).is_ok());
        // AJC : administrateur permanent.
        assert!(changer_role(&conn, "AJC", ROLE_UTILISATEUR).is_err());
        // Lecteur : modifications refusées.
        changer_role(&conn, "BCD", ROLE_LECTEUR).unwrap();
        assert!(refuser_lecteur(&conn, "BCD").is_err());
        assert!(refuser_lecteur(&conn, "XYZ").is_ok());
        assert!(crate::commands::locks::require_lock(&conn, "demandes", "BCD").is_err());
        assert!(changer_role(&conn, "BCD", "chef").is_err());
        // Dernier admin : BCD admin puis rétrogradable tant qu'AJC reste admin.
        changer_role(&conn, "BCD", ROLE_ADMIN).unwrap();
        assert!(changer_role(&conn, "BCD", ROLE_UTILISATEUR).is_ok());
        // Identités : trigramme ou identifiant intranet.
        assert!(identite_valide("AJC") && identite_valide("X12345"));
        assert!(!identite_valide("A") && !identite_valide("AB C"));
    }
}
