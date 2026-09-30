use crate::commands::admin::{require_admin, AdminSession};
use crate::commands::backup::{cle_chronologique, lire_config};
use crate::commands::journal::journaliser;
use crate::db::Db;
use rand_core::{OsRng, RngCore};
use rusqlite::{Connection, DatabaseName, OpenFlags};
use std::path::Path;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

// Restauration d'une sauvegarde depuis la page Admin (décision 2026-09-28, cf. ADR 0003).
// Remplacer la base pendant qu'un autre poste l'utilise risquerait de la corrompre (partage
// réseau) : chaque poste signale sa présence (`poste_actif`) et la restauration est refusée tant
// qu'un autre poste a battu récemment. La base actuelle est copiée juste avant, et les comptes
// (mot de passe AJC) et la configuration de sauvegarde sont conservés — ce sont des réglages,
// pas des données métier, et une vieille sauvegarde les ferait revenir en arrière.

/// Délai au-delà duquel un poste qui ne bat plus est considéré comme fermé. Les postes battent
/// toutes les 30 s (`usePresence`).
const DELAI_PRESENCE: &str = "-2 minutes";

/// Identifiant de ce poste, tiré au hasard au lancement de l'app (état Tauri, jamais persisté).
pub struct PosteId(pub String);

impl Default for PosteId {
    fn default() -> Self {
        PosteId(format!("{:016x}{:016x}", OsRng.next_u64(), OsRng.next_u64()))
    }
}

#[tauri::command]
pub fn signaler_presence(db: State<Db>, poste: State<PosteId>, trigramme: String) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    conn.execute(
        "INSERT INTO poste_actif (poste_id, trigramme, dernier_battement) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(poste_id) DO UPDATE SET trigramme = excluded.trigramme, dernier_battement = excluded.dernier_battement",
        [&poste.0, &trigramme],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(serde::Serialize)]
pub struct FichierSauvegarde {
    pub nom: String,
    pub chemin: String,
    /// `AAAA-MM-JJ HH:MM:SS`, heure locale (relue dans le nom du fichier).
    pub date: String,
    pub taille_octets: u64,
}

/// Sauvegardes présentes dans le dossier configuré, de la plus récente à la plus ancienne.
#[tauri::command]
pub fn list_sauvegardes(db: State<Db>, session: State<AdminSession>) -> Result<Vec<FichierSauvegarde>, String> {
    require_admin(&session)?;
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let Some(dossier) = lire_config(conn)?.dossier else {
        return Ok(Vec::new());
    };
    let entrees = std::fs::read_dir(&dossier).map_err(|e| format!("Dossier de sauvegarde inaccessible : {e}"))?;
    let mut fichiers: Vec<(String, FichierSauvegarde)> = entrees
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
        .filter_map(|e| {
            let nom = e.file_name().to_string_lossy().to_string();
            let cle = cle_chronologique(&nom)?;
            let date = cle.replacen('_', " ", 1);
            let date = format!("{} {}", &date[..10], date[11..].replace('-', ":"));
            Some((
                cle,
                FichierSauvegarde {
                    nom,
                    chemin: e.path().to_string_lossy().to_string(),
                    date,
                    taille_octets: e.metadata().map(|m| m.len()).unwrap_or(0),
                },
            ))
        })
        .collect();
    fichiers.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(fichiers.into_iter().map(|(_, f)| f).collect())
}

#[tauri::command]
pub async fn choose_fichier_restauration(app: AppHandle, session: State<'_, AdminSession>) -> Result<Option<String>, String> {
    require_admin(&session)?;
    let fichier = app
        .dialog()
        .file()
        .add_filter("Base Caisses", &["sqlite3"])
        .blocking_pick_file();
    Ok(fichier.map(|p| p.to_string()))
}

/// Trigrammes des autres postes qui ont l'app ouverte (battement récent).
fn autres_postes_actifs(conn: &Connection, poste_id: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT DISTINCT trigramme FROM poste_actif
             WHERE poste_id <> ?1 AND dernier_battement >= datetime('now', '{DELAI_PRESENCE}')
             ORDER BY trigramme"
        ))
        .map_err(|e| e.to_string())?;
    let lignes = stmt
        .query_map([poste_id], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<String>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(lignes)
}

/// Vérifie que le fichier est une base SQLite saine et qu'il s'agit bien d'une base Caisses.
fn verifier_source(source: &Path) -> Result<(), String> {
    let src = Connection::open_with_flags(source, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| format!("Impossible d'ouvrir le fichier : {e}"))?;
    let controle: String = src
        .query_row("PRAGMA quick_check", [], |r| r.get(0))
        .map_err(|_| "Ce fichier n'est pas une base SQLite valide".to_string())?;
    if controle != "ok" {
        return Err(format!("Le fichier est endommagé ({controle})"));
    }
    let est_caisses: bool = src
        .query_row(
            "SELECT COUNT(*) = 2 FROM sqlite_master WHERE type = 'table' AND name IN ('_migrations', 'affaire')",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !est_caisses {
        return Err("Ce fichier n'est pas une base de l'application Caisses".to_string());
    }
    Ok(())
}

type Compte = (String, String, String, String, String, Option<String>);

fn lire_comptes(conn: &Connection) -> Result<Vec<Compte>, String> {
    let mut stmt = conn
        .prepare("SELECT trigramme, mot_de_passe_hash, role, cree_le, modifie_le, code_secours_hash FROM compte")
        .map_err(|e| e.to_string())?;
    let lignes = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<Compte>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(lignes)
}

fn lire_roles(conn: &Connection) -> Result<Vec<(String, String)>, String> {
    let mut stmt = conn.prepare("SELECT trigramme, role FROM utilisateur").map_err(|e| e.to_string())?;
    let lignes = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<(String, String)>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(lignes)
}

fn lire_parametres_sauvegarde(conn: &Connection) -> Result<Vec<(String, String)>, String> {
    let mut stmt = conn
        .prepare("SELECT cle, valeur FROM parametre WHERE cle LIKE 'backup\\_%' ESCAPE '\\' OR cle = 'seuil_alerte_general'")
        .map_err(|e| e.to_string())?;
    let lignes = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<(String, String)>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(lignes)
}

/// Remplace la base par la sauvegarde `chemin`. Renvoie le chemin de la copie de sécurité de la
/// base remplacée. L'app doit être relancée ensuite (l'interface garde l'ancien état en mémoire).
fn restaurer(conn: &mut Connection, poste_id: &str, chemin: &str, trigramme: &str) -> Result<String, String> {
    let autres = autres_postes_actifs(conn, poste_id)?;
    if !autres.is_empty() {
        return Err(format!(
            "Restauration impossible : l'app est ouverte sur d'autres postes ({}). Fermer l'app sur ces postes puis réessayer — un poste fermé disparaît de cette liste au bout de 2 minutes.",
            autres.join(", ")
        ));
    }

    let source = Path::new(chemin);
    if !source.is_file() {
        return Err(format!("Fichier introuvable : {chemin}"));
    }
    verifier_source(source)?;

    let comptes = lire_comptes(conn)?;
    let parametres = lire_parametres_sauvegarde(conn)?;
    let roles = lire_roles(conn)?;

    // Copie de sécurité de la base actuelle, à côté d'elle. Son nom ne suit pas le format des
    // sauvegardes : jamais supprimée par la rétention, jamais listée comme sauvegarde.
    let dossier_base = conn
        .path()
        .and_then(|p| Path::new(p).parent().map(Path::to_path_buf))
        .ok_or("Emplacement de la base inconnu")?;
    let horodatage: String = conn
        .query_row("SELECT strftime('%d-%m-%Y_%H-%M-%S', 'now', 'localtime')", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let securite = dossier_base
        .join(format!("caisses_avant-restauration_{horodatage}.sqlite3"))
        .to_string_lossy()
        .to_string();
    conn.execute("VACUUM INTO ?1", [&securite])
        .map_err(|e| format!("Échec de la copie de sécurité vers {securite} : {e}"))?;

    conn.restore(DatabaseName::Main, source, None::<fn(rusqlite::backup::Progress)>)
        .map_err(|e| format!("Échec de la restauration (base actuelle inchangée ou copie dans {securite}) : {e}"))?;

    crate::db::appliquer_migrations(conn)?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM compte", []).map_err(|e| e.to_string())?;
    for (tri, hash, role, cree, modifie, code) in &comptes {
        tx.execute(
            "INSERT INTO compte (trigramme, mot_de_passe_hash, role, cree_le, modifie_le, code_secours_hash)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![tri, hash, role, cree, modifie, code],
        )
        .map_err(|e| e.to_string())?;
    }
    for (cle, valeur) in &parametres {
        tx.execute(
            "INSERT INTO parametre (cle, valeur) VALUES (?1, ?2)
             ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur",
            [cle, valeur],
        )
        .map_err(|e| e.to_string())?;
    }
    // Rôles actuels (cohérents avec les mots de passe conservés ci-dessus).
    for (tri, role) in &roles {
        tx.execute(
            "INSERT INTO utilisateur (trigramme, role) VALUES (?1, ?2)
             ON CONFLICT(trigramme) DO UPDATE SET role = excluded.role",
            [tri, role],
        )
        .map_err(|e| e.to_string())?;
    }
    // Verrous et présences de la sauvegarde : périmés, on repart à vide.
    tx.execute("DELETE FROM section_lock", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM poste_actif", []).map_err(|e| e.to_string())?;
    let nom = source.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    journaliser(
        &tx,
        trigramme,
        "restauration",
        "base",
        None,
        &format!("Base restaurée depuis {nom} — état précédent copié dans {securite}"),
    );
    tx.commit().map_err(|e| e.to_string())?;
    Ok(securite)
}

#[tauri::command]
pub async fn restore_sauvegarde(
    db: State<'_, Db>,
    session: State<'_, AdminSession>,
    poste: State<'_, PosteId>,
    chemin: String,
    trigramme: String,
) -> Result<String, String> {
    require_admin(&session)?;
    let mut guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_mut().ok_or("base de données non initialisée")?;
    restaurer(conn, &poste.0, &chemin, &trigramme)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dossier(nom: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("caisses-restau-{nom}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn restauration_remplace_les_donnees_et_garde_les_reglages() {
        // Sauvegarde : une base avec une affaire « ANCIENNE ».
        let d_sauvegarde = dossier("source");
        let ancienne = crate::db::open_at(&d_sauvegarde);
        ancienne.execute("INSERT INTO affaire (nom, seuil_defaut) VALUES ('ANCIENNE', 0.7)", []).unwrap();
        drop(ancienne);
        let source = d_sauvegarde.join("caisses.sqlite3");

        // Base courante : une autre affaire, un compte et une config de sauvegarde.
        let d_base = dossier("base");
        let mut conn = crate::db::open_at(&d_base);
        conn.execute("INSERT INTO affaire (nom, seuil_defaut) VALUES ('RECENTE1', 0.7)", []).unwrap();
        conn.execute("INSERT INTO compte (trigramme, mot_de_passe_hash) VALUES ('AJC', 'hash-actuel')", []).unwrap();
        conn.execute("INSERT INTO parametre (cle, valeur) VALUES ('backup_frequence', 'quotidienne')", []).unwrap();

        // Un autre poste actif bloque la restauration.
        conn.execute("INSERT INTO poste_actif (poste_id, trigramme) VALUES ('autre', 'XYZ')", []).unwrap();
        let err = restaurer(&mut conn, "moi", &source.to_string_lossy(), "AJC").unwrap_err();
        assert!(err.contains("XYZ"), "{err}");

        // Poste fermé depuis longtemps → autorisé.
        conn.execute("UPDATE poste_actif SET dernier_battement = datetime('now', '-10 minutes')", []).unwrap();
        let securite = restaurer(&mut conn, "moi", &source.to_string_lossy(), "AJC").unwrap();

        let noms: Vec<String> = conn
            .prepare("SELECT nom FROM affaire").unwrap()
            .query_map([], |r| r.get(0)).unwrap()
            .collect::<Result<_, _>>().unwrap();
        assert_eq!(noms, vec!["ANCIENNE".to_string()]);
        let hash: String = conn.query_row("SELECT mot_de_passe_hash FROM compte WHERE trigramme = 'AJC'", [], |r| r.get(0)).unwrap();
        assert_eq!(hash, "hash-actuel");
        let freq: String = conn.query_row("SELECT valeur FROM parametre WHERE cle = 'backup_frequence'", [], |r| r.get(0)).unwrap();
        assert_eq!(freq, "quotidienne");
        let actions: i64 = conn.query_row("SELECT COUNT(*) FROM journal WHERE action = 'restauration'", [], |r| r.get(0)).unwrap();
        assert_eq!(actions, 1);

        // La copie de sécurité contient l'état d'avant.
        let copie = Connection::open(&securite).unwrap();
        let nom: String = copie.query_row("SELECT nom FROM affaire", [], |r| r.get(0)).unwrap();
        assert_eq!(nom, "RECENTE1");

        // Un fichier qui n'est pas une base Caisses est refusé.
        let faux = d_base.join("faux.sqlite3");
        std::fs::write(&faux, b"pas une base").unwrap();
        assert!(restaurer(&mut conn, "moi", &faux.to_string_lossy(), "AJC").is_err());
    }
}
