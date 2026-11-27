use crate::db::Db;
use rusqlite::{Connection, OptionalExtension};
use std::sync::Mutex;
use tauri::State;

// Rôles (décision 2026-09-30, `utilisateur.role`) : 'admin' ouvre la page Admin et écrit partout ;
// 'utilisateur' = défaut. Depuis le 2026-11-25 (ADR 0005), les droits d'un utilisateur se règlent
// par écran (table `droit_ecran`, lecture ou écriture ; pas de ligne = lecture), vérifiés par
// `refuser_sans_ecriture`, appelé par `require_lock` ; l'ancien rôle 'lecteur' est remplacé par
// « lecture partout » (migration 0054).
// Depuis le 2026-10-08, plus de mot de passe propre à Caisses : l'identité vient du compte
// intranet (commands/intranet.rs), qui ouvre aussi la session admin.
pub const ROLE_ADMIN: &str = "admin";
pub const ROLE_UTILISATEUR: &str = "utilisateur";
const ROLES: [&str; 2] = [ROLE_UTILISATEUR, ROLE_ADMIN];
/// Écrans dont l'écriture se règle par personne (clés de `section_lock`, Simulations = `affaire:{id}`).
pub const ECRANS: [&str; 6] = ["demandes", "simulations", "stock", "achats", "alertes", "controle"];
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

/// Écran d'une clé de verrou (`affaire:12` → `simulations`).
pub fn ecran_de(section_key: &str) -> &str {
    if section_key.starts_with("affaire:") {
        "simulations"
    } else {
        section_key
    }
}

fn libelle_ecran(ecran: &str) -> &str {
    match ecran {
        "demandes" => "Gestion des caisses",
        "simulations" => "Simulations",
        "stock" => "Consommable",
        "achats" => "Demandes d'achats",
        "alertes" => "Alertes",
        "controle" => "Contrôle dimensionnel",
        autre => autre,
    }
}

/// Droit d'écriture de `trigramme` sur `ecran` : toujours pour un administrateur ; sinon selon
/// `droit_ecran` (pas de ligne = lecture).
pub fn peut_ecrire(conn: &Connection, trigramme: &str, ecran: &str) -> Result<bool, String> {
    if role_de(conn, trigramme)? == ROLE_ADMIN {
        return Ok(true);
    }
    Ok(conn
        .query_row(
            "SELECT ecriture FROM droit_ecran WHERE trigramme = ?1 AND ecran = ?2",
            [trigramme, ecran],
            |r| r.get::<_, bool>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(false))
}

/// Refuse une modification sur `ecran` sans droit d'écriture.
pub fn refuser_sans_ecriture(conn: &Connection, trigramme: &str, ecran: &str) -> Result<(), String> {
    if !peut_ecrire(conn, trigramme, ecran)? {
        return Err(format!(
            "Accès en lecture seule à « {} » : vos droits ne permettent pas de le modifier.",
            libelle_ecran(ecran)
        ));
    }
    Ok(())
}

/// Écrans où `trigramme` peut écrire.
pub fn ecrans_en_ecriture(conn: &Connection, trigramme: &str) -> Result<Vec<String>, String> {
    let mut r = Vec::new();
    for e in ECRANS {
        if peut_ecrire(conn, trigramme, e)? {
            r.push(e.to_string());
        }
    }
    Ok(r)
}

#[derive(serde::Serialize)]
pub struct Droits {
    pub role: String,
    /// Écrans en écriture (les autres : lecture).
    pub ecriture: Vec<String>,
}

#[tauri::command]
pub fn get_droits(db: State<Db>, trigramme: String) -> Result<Droits, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let t = trigramme.trim().to_uppercase();
    Ok(Droits { role: role_de(conn, &t)?, ecriture: ecrans_en_ecriture(conn, &t)? })
}

/// Admin › Utilisateurs : lecture ou écriture sur un écran.
pub fn changer_droit(conn: &Connection, trigramme: &str, ecran: &str, ecriture: bool) -> Result<(), String> {
    if !ECRANS.contains(&ecran) {
        return Err(format!("Écran inconnu : {ecran}"));
    }
    conn.execute(
        "INSERT INTO droit_ecran (trigramme, ecran, ecriture) VALUES (?1, ?2, ?3)
         ON CONFLICT(trigramme, ecran) DO UPDATE SET ecriture = excluded.ecriture",
        rusqlite::params![trigramme, ecran, ecriture],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_droit_ecran(
    db: State<Db>,
    session: State<AdminSession>,
    trigramme: String,
    ecran: String,
    ecriture: bool,
) -> Result<(), String> {
    require_admin(&session)?;
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    changer_droit(conn, &trigramme.trim().to_uppercase(), &ecran, ecriture)
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

/// Refuse l'appel si la session admin ouverte n'est pas celle d'AJC (réglages réservés à
/// l'administrateur permanent, ex. « Coller depuis Excel », 2026-10-14).
pub fn require_admin_permanent(session: &AdminSession) -> Result<(), String> {
    let guard = session.0.lock().map_err(|e| e.to_string())?;
    if guard.as_deref() == Some(ADMIN_PERMANENT) {
        Ok(())
    } else {
        Err(format!("Réglage réservé à {ADMIN_PERMANENT}."))
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
    /// 'utilisateur' | 'admin'
    pub role: String,
    /// Écrans en écriture (tous pour un administrateur).
    pub ecriture: Vec<String>,
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
                ecriture: Vec::new(),
            })
        })
        .map_err(|e| e.to_string())?;
    let mut liste = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    for u in &mut liste {
        u.ecriture = ecrans_en_ecriture(conn, &u.trigramme)?;
    }
    Ok(liste)
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
    fn migration_0054_garde_les_droits_existants() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE utilisateur (trigramme TEXT PRIMARY KEY, role TEXT NOT NULL DEFAULT 'utilisateur');
             INSERT INTO utilisateur VALUES ('AJC', 'admin'), ('BCD', 'utilisateur'), ('EFG', 'lecteur');",
        )
        .unwrap();
        conn.execute_batch(include_str!("../../../migrations/0054_add_droit_ecran.sql")).unwrap();
        assert_eq!(ecrans_en_ecriture(&conn, "BCD").unwrap().len(), ECRANS.len()); // utilisateur : écriture partout
        assert!(ecrans_en_ecriture(&conn, "EFG").unwrap().is_empty()); // ex-lecteur : lecture partout
        assert_eq!(role_de(&conn, "EFG").unwrap(), ROLE_UTILISATEUR);
        assert_eq!(ecrans_en_ecriture(&conn, "AJC").unwrap().len(), ECRANS.len());
        assert!(ecrans_en_ecriture(&conn, "NOUVEAU").unwrap().is_empty()); // nouvelle personne : lecture
    }

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
        // Droits par écran : lecture par défaut, écriture réglée par écran ; admin partout.
        changer_role(&conn, "BCD", ROLE_UTILISATEUR).unwrap();
        assert!(crate::commands::locks::require_lock(&conn, "demandes", "BCD").is_err());
        changer_droit(&conn, "BCD", "demandes", true).unwrap();
        changer_droit(&conn, "BCD", "simulations", true).unwrap();
        assert!(crate::commands::locks::require_lock(&conn, "demandes", "BCD").is_ok());
        assert!(crate::commands::locks::require_lock(&conn, "affaire:7", "BCD").is_ok());
        assert!(crate::commands::locks::require_lock(&conn, "controle", "BCD").is_err());
        changer_droit(&conn, "BCD", "demandes", false).unwrap();
        assert!(crate::commands::locks::require_lock(&conn, "demandes", "BCD").is_err());
        assert_eq!(ecrans_en_ecriture(&conn, "BCD").unwrap(), ["simulations"]);
        assert_eq!(ecrans_en_ecriture(&conn, "AJC").unwrap().len(), ECRANS.len());
        assert!(changer_droit(&conn, "BCD", "admin", true).is_err());
        assert!(changer_role(&conn, "BCD", "lecteur").is_err());
        assert!(changer_role(&conn, "BCD", "chef").is_err());
        // Dernier admin : BCD admin puis rétrogradable tant qu'AJC reste admin.
        changer_role(&conn, "BCD", ROLE_ADMIN).unwrap();
        assert!(changer_role(&conn, "BCD", ROLE_UTILISATEUR).is_ok());
        // Identités : trigramme ou identifiant intranet.
        assert!(identite_valide("AJC") && identite_valide("X12345"));
        assert!(!identite_valide("A") && !identite_valide("AB C"));
    }
}
