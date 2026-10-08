//! Compte intranet (2026-10-07 / 2026-10-08) : connexion à Caisses et import des articles d'une
//! affaire (picking).
//!
//! - Connexion : `POST {url}auth/signin` (`{ username, password }`) → `accessToken` (valable une
//!   demi-journée) + `trigram`, `global_id`… Identifiants gardés sur le poste dans le gestionnaire
//!   d'identifiants Windows (jamais en base) ; le jeton reste en mémoire et est renouvelé sur un
//!   401. L'identité du poste = trigramme de l'intranet, à défaut son identifiant (`global_id`,
//!   ex. 6 caractères) ; elle est mémorisée (`user-identity.json`) pour démarrer hors ligne.
//!   Plus de mot de passe propre à Caisses : un administrateur identifié ouvre la session admin ;
//!   après « Verrouiller », le mot de passe intranet est redemandé (`admin_unlock_intranet`).
//! - Picking : `POST {url}customer-client/contracts/picking/get`
//!   (`{ fake_header: { Authorization: "Bearer …" }, business }`), corps JSON envoyé en
//!   `text/plain` comme le fait l'intranet. Affaire inconnue → 400 « Affaire introuvable ».
//! - Le calcul de ce qui change (ajouts, modifications, suppressions) est fait côté frontend
//!   (`domain/importIntranet.ts`) ; `appliquer_import_intranet` exécute ce plan en une transaction.

use crate::commands::admin::{self, require_admin, AdminSession};
use crate::commands::backup::{ecrire, lire};
use crate::commands::locks::require_lock;
use crate::commands::user;
use crate::db::Db;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Mutex;
use tauri::{AppHandle, State};

const CLE_URL: &str = "intranet_api_url";
const CLE_COLLAGE_VISIBLE: &str = "collage_excel_visible";

const KEYRING_SERVICE: &str = "Caisses-intranet";
const KEYRING_COMPTE: &str = "identifiants";

/// Erreurs reconnues par le frontend (il redemande alors les identifiants).
const ERR_IDENTIFIANTS_REQUIS: &str = "IDENTIFIANTS_REQUIS";
const ERR_IDENTIFIANTS_REFUSES: &str = "IDENTIFIANTS_REFUSES";
const PREFIXE_INJOIGNABLE: &str = "Intranet injoignable";

/// Jeton de l'intranet, en mémoire seulement.
#[derive(Default)]
pub struct IntranetSession(pub Mutex<Option<String>>);

#[derive(Serialize, Deserialize)]
struct Identifiants {
    username: String,
    password: String,
}

fn entree_keyring() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_COMPTE).map_err(|e| e.to_string())
}

fn lire_identifiants() -> Result<Option<Identifiants>, String> {
    match entree_keyring()?.get_password() {
        Ok(s) => Ok(serde_json::from_str(&s).ok()),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn garder_identifiants(id: &Identifiants) -> Result<(), String> {
    entree_keyring()?
        .set_password(&serde_json::to_string(id).map_err(|e| e.to_string())?)
        .map_err(|e| format!("Impossible de garder les identifiants sur le poste : {e}"))
}

fn url_brute(db: &Db) -> Result<String, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    Ok(lire(conn, CLE_URL)?.unwrap_or_default().trim().to_string())
}

fn url_api(db: &Db) -> Result<String, String> {
    let url = url_brute(db)?;
    if url.is_empty() {
        return Err("L'adresse de l'intranet n'est pas réglée (Admin › Paramètres).".to_string());
    }
    Ok(if url.ends_with('/') { url } else { format!("{url}/") })
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())
}

fn erreur_reseau(e: reqwest::Error) -> String {
    format!("{PREFIXE_INJOIGNABLE} : {e}")
}

struct Connexion {
    jeton: String,
    /// Trigramme de l'intranet, à défaut son identifiant (`global_id`, puis `username`).
    identite: Option<String>,
}

/// Identité Caisses d'un compte intranet : `trigram`, sinon `global_id` (comptes sans trigramme,
/// ex. « X12345 »), sinon `username` — sans les espaces de remplissage, en majuscules.
fn identite_de(json: &Value) -> Option<String> {
    ["trigram", "global_id", "username"]
        .iter()
        .filter_map(|cle| json.get(*cle).and_then(Value::as_str))
        .map(|v| v.trim().to_uppercase())
        .find(|v| admin::identite_valide(v))
}

async fn signin(url: &str, id: &Identifiants) -> Result<Connexion, String> {
    let corps = serde_json::json!({ "username": id.username, "password": id.password }).to_string();
    let rep = client()?
        .post(format!("{url}auth/signin"))
        .header("Content-Type", "text/plain")
        .body(corps)
        .send()
        .await
        .map_err(erreur_reseau)?;
    let statut = rep.status();
    if statut == reqwest::StatusCode::UNAUTHORIZED || statut == reqwest::StatusCode::BAD_REQUEST || statut == reqwest::StatusCode::FORBIDDEN {
        return Err(ERR_IDENTIFIANTS_REFUSES.to_string());
    }
    if !statut.is_success() {
        return Err(format!("Connexion à l'intranet impossible (erreur {statut})"));
    }
    let json: Value = rep.json().await.map_err(|e| format!("Réponse de connexion illisible : {e}"))?;
    let jeton = json
        .get("accessToken")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| "Réponse de connexion sans jeton".to_string())?;
    Ok(Connexion { jeton, identite: identite_de(&json) })
}

/// Jeton courant, ou nouvelle connexion avec les identifiants du poste.
async fn jeton(url: &str, session: &IntranetSession, forcer: bool) -> Result<String, String> {
    if !forcer {
        if let Some(j) = session.0.lock().map_err(|e| e.to_string())?.clone() {
            return Ok(j);
        }
    }
    let id = lire_identifiants()?.ok_or(ERR_IDENTIFIANTS_REQUIS)?;
    let c = signin(url, &id).await?;
    *session.0.lock().map_err(|e| e.to_string())? = Some(c.jeton.clone());
    Ok(c.jeton)
}

/// Après une connexion réussie : identité mémorisée sur le poste, notée dans `utilisateur`,
/// session admin ouverte si c'est un administrateur.
fn installer_identite(app: &AppHandle, db: &Db, admin_session: &AdminSession, identite: &str) -> Result<(), String> {
    user::enregistrer_identite(app, identite)?;
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let _ = admin::noter_connexion(conn, identite);
    admin::ouvrir_session_si_admin(conn, admin_session, identite)?;
    Ok(())
}

#[tauri::command]
pub fn get_intranet_identifiant() -> Result<Option<String>, String> {
    Ok(lire_identifiants()?.map(|i| i.username))
}

/// Connexion à Caisses avec le compte intranet (premier lancement d'un poste, identifiants
/// refusés, ou nouvelle saisie demandée par l'import). Renvoie l'identité du poste.
#[tauri::command]
pub async fn connexion_intranet(
    app: AppHandle,
    db: State<'_, Db>,
    session: State<'_, IntranetSession>,
    admin_session: State<'_, AdminSession>,
    username: String,
    password: String,
) -> Result<String, String> {
    let url = url_api(&db)?;
    let id = Identifiants { username: username.trim().to_string(), password };
    let c = signin(&url, &id).await?;
    let identite = c
        .identite
        .ok_or("Ce compte intranet n'a ni trigramme ni identifiant utilisable")?;
    garder_identifiants(&id)?;
    *session.0.lock().map_err(|e| e.to_string())? = Some(c.jeton);
    installer_identite(&app, &db, &admin_session, &identite)?;
    Ok(identite)
}

#[derive(Serialize)]
pub struct EtatConnexion {
    /// Identité du poste (None = connexion à faire).
    pub trigramme: Option<String>,
    /// « connecte » | « hors_ligne » (intranet injoignable, dernier compte connu) | « a_identifier ».
    pub statut: String,
    pub message: Option<String>,
    /// Adresse de l'intranet pas encore réglée (premier poste) : l'écran de connexion la demande.
    pub url_manquante: bool,
}

/// Au démarrage : reconnexion automatique avec les identifiants du poste. Intranet injoignable →
/// dernier compte connu du poste, sans session admin (impossible de vérifier le mot de passe).
#[tauri::command]
pub async fn connexion_auto(
    app: AppHandle,
    db: State<'_, Db>,
    session: State<'_, IntranetSession>,
    admin_session: State<'_, AdminSession>,
) -> Result<EtatConnexion, String> {
    let a_identifier = |message: Option<String>, url_manquante: bool| EtatConnexion {
        trigramme: None,
        statut: "a_identifier".to_string(),
        message,
        url_manquante,
    };
    let url_brute = url_brute(&db)?;
    if url_brute.is_empty() {
        return Ok(a_identifier(None, true));
    }
    let url = if url_brute.ends_with('/') { url_brute } else { format!("{url_brute}/") };
    let connue = user::identite_du_poste(&app)?;
    let Some(id) = lire_identifiants()? else {
        return Ok(a_identifier(None, false));
    };
    match signin(&url, &id).await {
        Ok(c) => {
            let Some(identite) = c.identite else {
                return Ok(a_identifier(Some("Ce compte intranet n'a ni trigramme ni identifiant utilisable".into()), false));
            };
            *session.0.lock().map_err(|e| e.to_string())? = Some(c.jeton);
            installer_identite(&app, &db, &admin_session, &identite)?;
            Ok(EtatConnexion { trigramme: Some(identite), statut: "connecte".into(), message: None, url_manquante: false })
        }
        Err(e) if e == ERR_IDENTIFIANTS_REFUSES => Ok(a_identifier(
            Some("Identifiants refusés par l'intranet (mot de passe changé ?). Reconnectez-vous.".into()),
            false,
        )),
        Err(e) if e.starts_with(PREFIXE_INJOIGNABLE) => match connue {
            Some(t) => {
                // Hors ligne : on note quand même la connexion, sans ouvrir la session admin.
                if let Ok(guard) = db.0.lock() {
                    if let Some(conn) = guard.as_ref() {
                        let _ = admin::noter_connexion(conn, &t);
                    }
                }
                Ok(EtatConnexion { trigramme: Some(t), statut: "hors_ligne".into(), message: Some(e), url_manquante: false })
            }
            None => Ok(a_identifier(Some(format!("Connexion à l'intranet impossible. {e}")), false)),
        },
        Err(e) => Ok(a_identifier(Some(e), false)),
    }
}

/// Rouvre la session admin après « Verrouiller » : mot de passe intranet du compte du poste.
#[tauri::command]
pub async fn admin_unlock_intranet(
    app: AppHandle,
    db: State<'_, Db>,
    session: State<'_, IntranetSession>,
    admin_session: State<'_, AdminSession>,
    password: String,
) -> Result<(), String> {
    let url = url_api(&db)?;
    let username = lire_identifiants()?.map(|i| i.username).ok_or(ERR_IDENTIFIANTS_REQUIS)?;
    let id = Identifiants { username, password };
    let c = match signin(&url, &id).await {
        Err(e) if e == ERR_IDENTIFIANTS_REFUSES => return Err("Mot de passe incorrect".to_string()),
        r => r?,
    };
    let identite = c.identite.ok_or("Ce compte intranet n'a ni trigramme ni identifiant utilisable")?;
    garder_identifiants(&id)?;
    *session.0.lock().map_err(|e| e.to_string())? = Some(c.jeton);
    installer_identite(&app, &db, &admin_session, &identite)?;
    if admin_session.0.lock().map_err(|e| e.to_string())?.is_none() {
        return Err(format!("{identite} n'a pas d'accès administrateur"));
    }
    Ok(())
}

/// Première configuration : adresse de l'intranet saisie sur l'écran de connexion, seulement
/// tant qu'aucune n'est réglée (ensuite : Admin › Paramètres).
#[tauri::command]
pub fn set_intranet_url_initiale(db: State<Db>, url: String) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    if !lire(conn, CLE_URL)?.unwrap_or_default().trim().is_empty() {
        return Err("L'adresse de l'intranet est déjà réglée (modifiable dans Admin › Paramètres).".to_string());
    }
    let url = url.trim();
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("Adresse invalide (elle doit commencer par https://)".to_string());
    }
    ecrire(conn, CLE_URL, url)
}

#[derive(Debug, Serialize)]
pub struct LignePicking {
    pub normm: Option<i64>,
    pub ar: String,
    pub reference: String,
    pub designation: String,
    pub dim1_mm: f64,
    pub dim2_mm: f64,
    pub dim3_mm: f64,
    pub poids_unitaire_kg: f64,
    /// `QTARF` — `None` = ligne supprimée dans l'intranet.
    pub quantite: Option<i64>,
    pub qte_initiale: Option<i64>,
}

fn nombre(v: Option<&Value>) -> Option<f64> {
    match v? {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.trim().replace(',', ".").parse().ok(),
        _ => None,
    }
}

fn texte(v: Option<&Value>) -> String {
    match v {
        Some(Value::String(s)) => s.trim().to_string(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}

fn entier(v: Option<&Value>) -> Option<i64> {
    nombre(v).map(|n| n.round() as i64)
}

fn lire_ligne(l: &Value) -> LignePicking {
    LignePicking {
        normm: entier(l.get("NORMM")),
        ar: texte(l.get("ARAVF")),
        reference: texte(l.get("DES2L")),
        designation: texte(l.get("DES1L")),
        dim1_mm: nombre(l.get("DIM1L")).unwrap_or(0.0),
        dim2_mm: nombre(l.get("DIM2L")).unwrap_or(0.0),
        dim3_mm: nombre(l.get("DIM3L")).unwrap_or(0.0),
        poids_unitaire_kg: nombre(l.get("POIDL")).unwrap_or(0.0),
        quantite: entier(l.get("QTARF")),
        qte_initiale: entier(l.get("initial_qty")),
    }
}

/// Lit le picking de l'affaire `business` sur l'intranet (toutes les lignes, sans filtre).
#[tauri::command]
pub async fn fetch_picking_intranet(
    db: State<'_, Db>,
    session: State<'_, IntranetSession>,
    business: String,
) -> Result<Vec<LignePicking>, String> {
    let url = url_api(&db)?;
    let business = business.trim().to_string();
    let mut forcer = false;
    loop {
        let j = jeton(&url, &session, forcer).await?;
        let corps = serde_json::json!({
            "fake_header": { "Authorization": format!("Bearer {j}") },
            "business": business,
        })
        .to_string();
        let rep = client()?
            .post(format!("{url}customer-client/contracts/picking/get"))
            .header("Content-Type", "text/plain")
            .body(corps)
            .send()
            .await
            .map_err(erreur_reseau)?;
        let statut = rep.status();
        if statut == reqwest::StatusCode::UNAUTHORIZED {
            if forcer {
                return Err("L'intranet refuse l'accès au picking (401).".to_string());
            }
            // Jeton expiré (une demi-journée) : nouvelle connexion puis nouvel essai.
            forcer = true;
            continue;
        }
        let json: Value = rep.json().await.unwrap_or(Value::Null);
        if !statut.is_success() {
            let message = json.get("message").and_then(Value::as_str).unwrap_or("");
            if message.to_lowercase().contains("introuvable") {
                return Err(format!("Affaire « {business} » introuvable dans l'intranet."));
            }
            return Err(format!("Erreur de l'intranet ({statut}) {message}").trim().to_string());
        }
        let lignes = json.get("picking").and_then(Value::as_array).ok_or("Réponse de l'intranet sans « picking »")?;
        return Ok(lignes.iter().map(lire_ligne).collect());
    }
}

#[derive(Debug, Deserialize)]
pub struct ArticleIntranet {
    pub normm: i64,
    pub ar: String,
    pub reference: String,
    pub designation: String,
    pub dim1_mm: f64,
    pub dim2_mm: f64,
    pub dim3_mm: f64,
    pub poids_unitaire_kg: f64,
    pub quantite: i64,
    pub qte_initiale: Option<i64>,
    pub supprime_intranet: bool,
}

#[derive(Debug, Deserialize)]
pub struct ModifIntranet {
    pub id: i64,
    #[serde(flatten)]
    pub article: ArticleIntranet,
}

#[derive(Debug, Deserialize)]
pub struct PlanImport {
    /// Articles collés depuis Excel, remplacés au premier import.
    pub supprimer_ids: Vec<i64>,
    pub ajouts: Vec<ArticleIntranet>,
    pub modifs: Vec<ModifIntranet>,
    /// AR des lignes sans numéro de besoin (non importées).
    pub anomalies: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ImportIntranetInfo {
    pub importe_le: String,
    pub anomalies: Vec<String>,
}

#[tauri::command]
pub fn get_import_intranet(db: State<Db>, affaire_id: i64) -> Result<Option<ImportIntranetInfo>, String> {
    use rusqlite::OptionalExtension;
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let ligne: Option<(String, String)> = conn
        .query_row(
            "SELECT importe_le, anomalies FROM affaire_import_intranet WHERE affaire_id = ?1",
            [affaire_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(ligne.map(|(importe_le, anomalies)| ImportIntranetInfo {
        importe_le,
        anomalies: serde_json::from_str(&anomalies).unwrap_or_default(),
    }))
}

fn appliquer(conn: &mut rusqlite::Connection, affaire_id: i64, plan: &PlanImport) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for id in &plan.supprimer_ids {
        tx.execute("DELETE FROM article WHERE id = ?1 AND affaire_id = ?2", rusqlite::params![id, affaire_id])
            .map_err(|e| e.to_string())?;
    }
    let mut ordre: i64 = tx
        .query_row("SELECT COALESCE(MAX(ordre), -1) + 1 FROM article WHERE affaire_id = ?1", [affaire_id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    for a in &plan.ajouts {
        tx.execute(
            "INSERT INTO article (affaire_id, ar, reference, designation, dim1_mm, dim2_mm, dim3_mm, poids_unitaire_kg,
                                  quantite, ordre, normm, qte_initiale, supprime_intranet)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            rusqlite::params![
                affaire_id, a.ar, a.reference, a.designation, a.dim1_mm, a.dim2_mm, a.dim3_mm, a.poids_unitaire_kg,
                a.quantite, ordre, a.normm, a.qte_initiale, a.supprime_intranet,
            ],
        )
        .map_err(|e| e.to_string())?;
        ordre += 1;
    }
    for m in &plan.modifs {
        let a = &m.article;
        // Une ligne supprimée dans l'intranet sort aussi de sa caisse.
        tx.execute(
            "UPDATE article SET ar = ?1, reference = ?2, designation = ?3, dim1_mm = ?4, dim2_mm = ?5, dim3_mm = ?6,
                    poids_unitaire_kg = ?7, quantite = ?8, normm = ?9, qte_initiale = ?10, supprime_intranet = ?11,
                    caisse_id = CASE WHEN ?11 THEN NULL ELSE caisse_id END
             WHERE id = ?12 AND affaire_id = ?13",
            rusqlite::params![
                a.ar, a.reference, a.designation, a.dim1_mm, a.dim2_mm, a.dim3_mm, a.poids_unitaire_kg, a.quantite,
                a.normm, a.qte_initiale, a.supprime_intranet, m.id, affaire_id,
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    let anomalies = serde_json::to_string(&plan.anomalies).map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO affaire_import_intranet (affaire_id, importe_le, anomalies) VALUES (?1, datetime('now'), ?2)
         ON CONFLICT(affaire_id) DO UPDATE SET importe_le = excluded.importe_le, anomalies = excluded.anomalies",
        rusqlite::params![affaire_id, anomalies],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn appliquer_import_intranet(db: State<Db>, affaire_id: i64, plan: PlanImport, trigramme: String) -> Result<(), String> {
    let mut guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_mut().ok_or("base de données non initialisée")?;
    require_lock(conn, &format!("affaire:{affaire_id}"), &trigramme)?;
    appliquer(conn, affaire_id, &plan)
}

#[tauri::command]
pub fn get_intranet_url(db: State<Db>) -> Result<String, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    Ok(lire(conn, CLE_URL)?.unwrap_or_default())
}

#[tauri::command]
pub fn set_intranet_url(db: State<Db>, session: State<AdminSession>, url: String) -> Result<(), String> {
    require_admin(&session)?;
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    ecrire(conn, CLE_URL, url.trim())
}

/// Bouton « Coller depuis Excel » de Simulations affiché (défaut) ou masqué — réglage Admin,
/// en attendant de le retirer une fois l'import intranet adopté (décision 2026-10-06).
#[tauri::command]
pub fn get_collage_excel_visible(db: State<Db>) -> Result<bool, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    Ok(lire(conn, CLE_COLLAGE_VISIBLE)?.map(|v| v != "0").unwrap_or(true))
}

#[tauri::command]
pub fn set_collage_excel_visible(db: State<Db>, session: State<AdminSession>, visible: bool) -> Result<(), String> {
    require_admin(&session)?;
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    ecrire(conn, CLE_COLLAGE_VISIBLE, if visible { "1" } else { "0" })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        crate::db::appliquer_migrations(&conn).unwrap();
        conn.execute("INSERT INTO affaire (nom, seuil_defaut) VALUES ('AFFAIRE1', 70)", []).unwrap();
        conn
    }

    fn art(normm: i64, quantite: i64, supprime: bool) -> ArticleIntranet {
        ArticleIntranet {
            normm,
            ar: "AR_X".into(),
            reference: "R".into(),
            designation: "D".into(),
            dim1_mm: 85.0,
            dim2_mm: 53.0,
            dim3_mm: 47.0,
            poids_unitaire_kg: 0.141,
            quantite,
            qte_initiale: Some(2),
            supprime_intranet: supprime,
        }
    }

    #[test]
    fn identite_du_compte_intranet() {
        let avec: Value = serde_json::from_str(r#"{"trigram":"abc","global_id":"X12345    ","username":"ABC1"}"#).unwrap();
        assert_eq!(identite_de(&avec).as_deref(), Some("ABC"));
        let sans: Value = serde_json::from_str(r#"{"trigram":null,"global_id":"o12345      ","username":"X"}"#).unwrap();
        assert_eq!(identite_de(&sans).as_deref(), Some("O12345"));
        let vide: Value = serde_json::from_str(r#"{"trigram":"","global_id":"  "}"#).unwrap();
        assert_eq!(identite_de(&vide), None);
    }

    #[test]
    fn lecture_ligne_picking() {
        let l: Value = serde_json::from_str(
            r#"{"ARAVF":"AR_TEST_00001 ","DES2L":"FOURN/X","DES1L":"Chaine","DIM1L":85.00,"DIM2L":53.0,
                "DIM3L":47,"POIDL":0.141,"QTARF":1.000,"initial_qty":2,"NORMM":1320874.0}"#,
        )
        .unwrap();
        let p = lire_ligne(&l);
        assert_eq!(p.ar, "AR_TEST_00001");
        assert_eq!(p.normm, Some(1320874));
        assert_eq!(p.quantite, Some(1));
        assert_eq!(p.qte_initiale, Some(2));
        assert_eq!(p.dim1_mm, 85.0);
        let supprimee: Value = serde_json::from_str(r#"{"ARAVF":"AR_Y","QTARF":null,"NORMM":null}"#).unwrap();
        let p = lire_ligne(&supprimee);
        assert_eq!(p.quantite, None);
        assert_eq!(p.normm, None);
    }

    #[test]
    fn application_du_plan() {
        let mut conn = base();
        // Article collé depuis Excel, remplacé au premier import.
        conn.execute("INSERT INTO article (affaire_id, ar, reference, designation, dim1_mm, dim2_mm, dim3_mm, poids_unitaire_kg, quantite, ordre) VALUES (1, 'AR_COLLE', '', '', 0, 0, 0, 0, 1, 0)", []).unwrap();
        conn.execute("INSERT INTO caisse (affaire_id, nom, longueur_mm, largeur_mm, hauteur_mm, couleur, ordre) VALUES (1, 'C1', 1000, 1000, 1000, '#fff', 0)", []).unwrap();
        let plan = PlanImport {
            supprimer_ids: vec![1],
            ajouts: vec![art(10, 1, false), art(11, 3, false)],
            modifs: vec![],
            anomalies: vec!["AR_SANS_BESOIN".into()],
        };
        appliquer(&mut conn, 1, &plan).unwrap();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM article WHERE normm IS NOT NULL", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 2);
        let colle: i64 = conn.query_row("SELECT COUNT(*) FROM article WHERE ar = 'AR_COLLE'", [], |r| r.get(0)).unwrap();
        assert_eq!(colle, 0);

        // Ligne 11 rangée dans une caisse puis supprimée dans l'intranet → sort de la caisse.
        let id11: i64 = conn.query_row("SELECT id FROM article WHERE normm = 11", [], |r| r.get(0)).unwrap();
        conn.execute("UPDATE article SET caisse_id = 1 WHERE id = ?1", [id11]).unwrap();
        let plan = PlanImport {
            supprimer_ids: vec![],
            ajouts: vec![],
            modifs: vec![ModifIntranet { id: id11, article: art(11, 3, true) }],
            anomalies: vec![],
        };
        appliquer(&mut conn, 1, &plan).unwrap();
        let (caisse, supprime): (Option<i64>, bool) = conn
            .query_row("SELECT caisse_id, supprime_intranet FROM article WHERE id = ?1", [id11], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!(caisse, None);
        assert!(supprime);
        let anomalies: String = conn.query_row("SELECT anomalies FROM affaire_import_intranet", [], |r| r.get(0)).unwrap();
        assert_eq!(anomalies, "[]");
    }
}
