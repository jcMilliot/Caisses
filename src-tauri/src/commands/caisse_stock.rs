use crate::commands::journal::journaliser;
use crate::commands::locks::require_lock;
use crate::db::Db;
use crate::commands::admin::{require_admin, AdminSession};
use crate::models::{CaisseStock, MouvementStock, NewCaisseStock};
use tauri::State;

/// Caisse réutilisable (pool générique, affectable à plusieurs affaires simultanément) — détectée
/// par préfixe sur le nom plutôt qu'un champ dédié, convention à garder synchronisée avec
/// `src/domain/caisseStock.ts::estArCaiss`.
fn est_ar_caiss(nom: &str) -> bool {
    nom.trim().to_uppercase().starts_with("AR_CAISS")
}

fn map_row(row: &rusqlite::Row) -> rusqlite::Result<CaisseStock> {
    Ok(CaisseStock {
        id: row.get(0)?,
        nom: row.get(1)?,
        longueur_mm: row.get(2)?,
        largeur_mm: row.get(3)?,
        hauteur_mm: row.get(4)?,
        quantite: row.get(5)?,
        observations: row.get(6)?,
        affaire_id: row.get(7)?,
        ordre: row.get(8)?,
        validee: row.get(9)?,
        demandeur: row.get(10)?,
        demande_le: row.get(11)?,
        demande_statut: row.get(12)?,
        demande_affaire_cible_id: row.get(13)?,
        demande_cible_id: row.get(14)?,
        type_ouverture: row.get(15)?,
        gere: row.get(16)?,
        seuil_alerte: row.get(17)?,
    })
}

const SELECT_COLS: &str = "id, nom, longueur_mm, largeur_mm, hauteur_mm, quantite, observations, affaire_id, ordre,
    validee, demandeur, demande_le, demande_statut, demande_affaire_cible_id, demande_cible_id, type_ouverture,
    gere, seuil_alerte";

fn get_caisse_stock(conn: &rusqlite::Connection, id: i64) -> Result<CaisseStock, String> {
    let sql = format!("SELECT {} FROM caisse_stock WHERE id = ?1", SELECT_COLS);
    conn.query_row(&sql, [id], map_row).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_caisses_stock(db: State<Db>) -> Result<Vec<CaisseStock>, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let sql = format!("SELECT {} FROM caisse_stock ORDER BY ordre, id", SELECT_COLS);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_caisse_stock(db: State<Db>, caisse: NewCaisseStock, trigramme: String) -> Result<CaisseStock, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock(conn, "stock", &trigramme)?;
    let ordre: i64 = conn
        .query_row("SELECT COALESCE(MAX(ordre), -1) + 1 FROM caisse_stock", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO caisse_stock (nom, longueur_mm, largeur_mm, hauteur_mm, quantite, observations, affaire_id, ordre, type_ouverture)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            caisse.nom,
            caisse.longueur_mm,
            caisse.largeur_mm,
            caisse.hauteur_mm,
            caisse.quantite,
            caisse.observations,
            caisse.affaire_id,
            ordre,
            caisse.type_ouverture,
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    get_caisse_stock(conn, id)
}

// Ligne de Gestion des caisses pas encore livrée / rapatriée — même règle que
// `domain/demandeOptions.ts::estDemandeValidee` / `estDemandeCaisseValidee` (texte d'observation).
const OBSERVATION_NON_LIVREE: &str = "NOT (lower(observations) LIKE '%livré%' OR lower(observations) LIKE '%livre%'
    OR lower(observations) LIKE '%rapatrié%' OR lower(observations) LIKE '%rapatrie%')";

/// Ids des demandes et sous-caisses non livrées qui utilisent cette caisse en stock.
fn lignes_liees_non_livrees(conn: &rusqlite::Connection, id: i64) -> Result<(Vec<i64>, Vec<i64>), String> {
    let ids = |sql: String| -> Result<Vec<i64>, String> {
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([id], |r| r.get(0)).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<i64>, _>>().map_err(|e| e.to_string())
    };
    let demandes = ids(format!(
        "SELECT id FROM demande WHERE caisse_stock_id = ?1 AND validee = 0 AND {OBSERVATION_NON_LIVREE}"
    ))?;
    let sous_caisses = ids(format!(
        "SELECT id FROM demande_caisse WHERE caisse_stock_id = ?1 AND {OBSERVATION_NON_LIVREE}"
    ))?;
    Ok((demandes, sous_caisses))
}

/// Nombre de lignes de Gestion des caisses non livrées qui utilisent cette caisse en stock (elles
/// reprendront ses dimensions et son type d'ouverture si on la modifie).
#[tauri::command]
pub fn count_caisse_stock_lignes_liees(db: State<Db>, id: i64) -> Result<i64, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    let (demandes, sous_caisses) = lignes_liees_non_livrees(conn, id)?;
    Ok((demandes.len() + sous_caisses.len()) as i64)
}

/// Modifie une caisse en stock. Si ses dimensions ou son type d'ouverture changent, les lignes
/// non livrées qui l'utilisent (demandes, sous-caisses) et leurs caisses Simulations liées les
/// reprennent (décision 2026-09-28) — l'UI a confirmé au préalable avec le nombre de lignes.
#[tauri::command]
pub fn update_caisse_stock(db: State<Db>, id: i64, caisse: NewCaisseStock, trigramme: String) -> Result<(), String> {
    let mut guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_mut().ok_or("base de données non initialisée")?;
    modifier_caisse_stock(conn, id, &caisse, &trigramme)
}

fn modifier_caisse_stock(conn: &mut rusqlite::Connection, id: i64, caisse: &NewCaisseStock, trigramme: &str) -> Result<(), String> {
    require_lock(conn, "stock", trigramme)?;

    let actuelle = get_caisse_stock(conn, id)?;
    if caisse.affaire_id != actuelle.affaire_id && actuelle.validee && !est_ar_caiss(&actuelle.nom) {
        return Err("Caisse déjà validée sur une affaire — non réaffectable directement, passez par une demande de réaffectation.".to_string());
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        // `quantite` non modifiée ici : suivie dans Admin › Stock et décomptée à la livraison —
        // le dialogue « Gérer les caisses » renverrait une valeur périmée.
        "UPDATE caisse_stock SET nom = ?1, longueur_mm = ?2, largeur_mm = ?3, hauteur_mm = ?4,
         observations = ?5, affaire_id = ?6, type_ouverture = ?7 WHERE id = ?8",
        rusqlite::params![
            caisse.nom,
            caisse.longueur_mm,
            caisse.largeur_mm,
            caisse.hauteur_mm,
            caisse.observations,
            caisse.affaire_id,
            caisse.type_ouverture,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;

    let dims_changees = caisse.longueur_mm != actuelle.longueur_mm
        || caisse.largeur_mm != actuelle.largeur_mm
        || caisse.hauteur_mm != actuelle.hauteur_mm;
    if dims_changees || caisse.type_ouverture != actuelle.type_ouverture {
        let (demandes, sous_caisses) = lignes_liees_non_livrees(&tx, id)?;
        // (table, colonne de lien de la caisse Simulations, entité du journal, ids)
        for (table, lien, entite, ids) in [
            ("demande", "demande_id", "demande", &demandes),
            ("demande_caisse", "demande_caisse_id", "demande_caisse", &sous_caisses),
        ] {
            for &ligne in ids {
                tx.execute(
                    &format!("UPDATE {table} SET longueur_mm = ?1, largeur_mm = ?2, hauteur_mm = ?3, type_ouverture = ?4 WHERE id = ?5"),
                    rusqlite::params![caisse.longueur_mm, caisse.largeur_mm, caisse.hauteur_mm, caisse.type_ouverture, ligne],
                )
                .map_err(|e| e.to_string())?;
                tx.execute(
                    &format!("UPDATE caisse SET longueur_mm = ?1, largeur_mm = ?2, hauteur_mm = ?3 WHERE {lien} = ?4 AND caisse_stock_id = ?5"),
                    rusqlite::params![caisse.longueur_mm, caisse.largeur_mm, caisse.hauteur_mm, ligne, id],
                )
                .map_err(|e| e.to_string())?;
                if dims_changees {
                    journaliser(
                        &tx,
                        trigramme,
                        "modification_dimensions",
                        entite,
                        Some(ligne),
                        &format!(
                            "Repris de la caisse en stock « {} » : {} × {} × {} mm",
                            caisse.nom, caisse.longueur_mm, caisse.largeur_mm, caisse.hauteur_mm
                        ),
                    );
                }
            }
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_caisse_stock(db: State<Db>, id: i64, trigramme: String) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock(conn, "stock", &trigramme)?;
    conn.execute("DELETE FROM caisse_stock WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Initiée depuis Demandes (sélection du menu Stock), après confirmation de l'utilisateur en cas
/// de conflit. Transfert immédiat, sans étape d'approbation séparée : retire le lien de l'ancien
/// propriétaire (demande ou sous-ligne) — la nouvelle demande a déjà posé son propre
/// caisse_stock_id côté frontend avant cet appel. Ne touche jamais caisse_stock.affaire_id,
/// réservé au lien réel avec Simulations posé plus tard.
#[tauri::command]
pub fn transfer_caisse_stock(db: State<Db>, caisse_stock_id: i64, demande_cible_id: i64, trigramme: String) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    require_lock(conn, "demandes", &trigramme)?;

    let row = get_caisse_stock(conn, caisse_stock_id)?;
    if est_ar_caiss(&row.nom) {
        return Err("Une caisse AR_CAISS est réutilisable, aucune réaffectation nécessaire.".to_string());
    }

    conn.execute(
        "UPDATE demande SET caisse_stock_id = NULL WHERE caisse_stock_id = ?1 AND id != ?2",
        rusqlite::params![caisse_stock_id, demande_cible_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE demande_caisse SET caisse_stock_id = NULL WHERE caisse_stock_id = ?1 AND demande_id != ?2",
        rusqlite::params![caisse_stock_id, demande_cible_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Appelée uniquement en cascade depuis la validation d'une Demande (le verrou "demandes" a déjà
/// été vérifié dans la même action utilisateur) — pas de vérification de verrou "stock" ici.
/// No-op silencieux pour les AR_CAISS, jamais marquées validées (pool toujours disponible).
#[tauri::command]
pub fn set_caisse_stock_validee(db: State<Db>, id: i64, validee: bool, trigramme: String) -> Result<(), String> {
    let _ = trigramme;
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;

    let row = get_caisse_stock(conn, id)?;
    if est_ar_caiss(&row.nom) {
        return Ok(());
    }

    conn.execute("UPDATE caisse_stock SET validee = ?1 WHERE id = ?2", rusqlite::params![validee, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Admin › Caisses › Stock : quantité en stock, suivi (« gérée ») et seuil d'alerte d'une caisse
/// AR_CAISS_ (décisions 2026-10-01 / 2026-10-02 — réglage réservé aux administrateurs).
#[tauri::command]
pub fn set_caisse_stock_suivi(
    db: State<Db>,
    session: State<AdminSession>,
    id: i64,
    quantite: i64,
    gere: bool,
    seuil_alerte: i64,
    trigramme: String,
) -> Result<(), String> {
    require_admin(&session)?;
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    regler_suivi(conn, id, quantite, gere, seuil_alerte, &trigramme)
}

fn regler_suivi(
    conn: &rusqlite::Connection,
    id: i64,
    quantite: i64,
    gere: bool,
    seuil_alerte: i64,
    trigramme: &str,
) -> Result<(), String> {
    if quantite < 0 || seuil_alerte < 0 {
        return Err("La quantité et le seuil doivent être positifs ou nuls.".to_string());
    }
    let actuelle = get_caisse_stock(conn, id)?;
    if !est_ar_caiss(&actuelle.nom) {
        return Err("Seules les caisses AR_CAISS_ ont un suivi de quantité.".to_string());
    }
    conn.execute(
        "UPDATE caisse_stock SET quantite = ?1, gere = ?2, seuil_alerte = ?3 WHERE id = ?4",
        rusqlite::params![quantite, gere, seuil_alerte, id],
    )
    .map_err(|e| e.to_string())?;
    if quantite != actuelle.quantite || gere != actuelle.gere || seuil_alerte != actuelle.seuil_alerte {
        journaliser(
            conn,
            trigramme,
            "stock_reglage",
            "caisse_stock",
            Some(id),
            &format!(
                "{} : {} en stock, {}, seuil {}",
                actuelle.nom,
                quantite,
                if gere { "gérée" } else { "non gérée" },
                seuil_alerte
            ),
        );
    }
    Ok(())
}

/// Table d'une ligne de Gestion des caisses (mère ou sous-caisse) — liste fermée, le nom de
/// table est inséré dans le SQL.
fn table_ligne(table: &str) -> Result<&'static str, String> {
    match table {
        "demande" => Ok("demande"),
        "demande_caisse" => Ok("demande_caisse"),
        _ => Err(format!("Type de ligne inconnu : {table}")),
    }
}

fn libelle_ligne(table: &str) -> &'static str {
    if table == "demande" {
        "caisse"
    } else {
        "sous-caisse"
    }
}

/// Caisse AR_CAISS_ concernée par une ligne de Gestion des caisses, et sens du mouvement :
/// - ligne d'une affaire **ACHSTOCK** (mère, ou sous-caisse d'une mère ACHSTOCK) = commande de
///   caisses pour le stock → sa livraison est une **réception** (quantité ajoutée) ;
/// - toute autre ligne = caisse utilisée → sa livraison **retire** la quantité.
/// La caisse est celle du menu Stock (`caisse_stock_id`) ; à défaut, pour une ligne ACHSTOCK
/// ancienne, celle dont le nom est écrit dans la colonne `stock` (ex. « AR_CAISS_00003 »).
struct LigneStock {
    caisse_stock_id: Option<i64>,
    quantite: i64,
    stock_decompte: Option<i64>,
    reception: bool,
}

fn lire_ligne_stock(conn: &rusqlite::Connection, t: &str, id: i64) -> Result<LigneStock, String> {
    let (caisse_stock_id, quantite, stock_decompte, stock, affaire): (Option<i64>, i64, Option<i64>, String, String) =
        if t == "demande" {
            conn.query_row(
                "SELECT caisse_stock_id, quantite, stock_decompte, stock, affaire FROM demande WHERE id = ?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
        } else {
            conn.query_row(
                "SELECT dc.caisse_stock_id, dc.quantite, dc.stock_decompte, dc.stock, COALESCE(d.affaire, '')
                 FROM demande_caisse dc LEFT JOIN demande d ON d.id = dc.demande_id WHERE dc.id = ?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
        }
        .map_err(|e| e.to_string())?;
    let reception = affaire.to_uppercase().contains("ACHSTOCK");
    let caisse_stock_id = match caisse_stock_id {
        Some(cs) => Some(cs),
        None if reception && est_ar_caiss(&stock) => conn
            .query_row(
                "SELECT id FROM caisse_stock WHERE upper(trim(nom)) = upper(trim(?1)) ORDER BY id LIMIT 1",
                [&stock],
                |r| r.get(0),
            )
            .ok(),
        None => None,
    };
    Ok(LigneStock { caisse_stock_id, quantite, stock_decompte, reception })
}

/// Livraison d'une ligne de Gestion des caisses utilisant une caisse AR_CAISS_ (gérée ou non), pas
/// encore comptée : retire sa quantité du stock (plancher à 0, la caisse n'est jamais
/// supprimée) — ou l'**ajoute** pour une ligne ACHSTOCK (réception d'une commande). Le mouvement
/// est mémorisé dans `stock_decompte` (positif = retiré, négatif = reçu). `None` = rien à faire.
#[tauri::command]
pub fn decompter_stock_livraison(
    db: State<Db>,
    table: String,
    id: i64,
    trigramme: String,
) -> Result<Option<MouvementStock>, String> {
    let mut guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_mut().ok_or("base de données non initialisée")?;
    require_lock(conn, "demandes", &trigramme)?;
    decompter(conn, &table, id, &trigramme)
}

fn decompter(
    conn: &mut rusqlite::Connection,
    table: &str,
    id: i64,
    trigramme: &str,
) -> Result<Option<MouvementStock>, String> {
    let t = table_ligne(table)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let ligne = lire_ligne_stock(&tx, t, id)?;
    let Some(cs_id) = ligne.caisse_stock_id else { return Ok(None) };
    if ligne.stock_decompte.is_some() {
        return Ok(None);
    }
    let Ok(caisse) = get_caisse_stock(&tx, cs_id) else { return Ok(None) };
    // Toutes les AR_CAISS_ sont décomptées, gérées ou non (décision 2026-10-02 : une caisse non
    // gérée est une caisse qu'on écoule sans la recommander) — « gérée » ne sert qu'à l'alerte.
    if !est_ar_caiss(&caisse.nom) {
        return Ok(None);
    }
    // Mouvement signé : positif = sortie de stock, négatif = réception.
    let mouvement = if ligne.reception {
        -ligne.quantite.max(0)
    } else {
        ligne.quantite.max(0).min(caisse.quantite.max(0))
    };
    tx.execute(
        "UPDATE caisse_stock SET quantite = quantite - ?1 WHERE id = ?2",
        rusqlite::params![mouvement, cs_id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(&format!("UPDATE {t} SET stock_decompte = ?1 WHERE id = ?2"), rusqlite::params![mouvement, id])
        .map_err(|e| e.to_string())?;
    let (action, signe, quoi) = if ligne.reception {
        ("stock_reception", "+", "réception")
    } else {
        ("stock_retrait", "−", "livraison")
    };
    journaliser(
        &tx,
        trigramme,
        action,
        "caisse_stock",
        Some(cs_id),
        &format!(
            "{} : {}{} ({} {} n°{}), {} en stock",
            caisse.nom,
            signe,
            mouvement.abs(),
            quoi,
            libelle_ligne(t),
            id,
            caisse.quantite - mouvement
        ),
    );
    tx.commit().map_err(|e| e.to_string())?;
    Ok(Some(MouvementStock { caisse_stock_id: cs_id, nom: caisse.nom, quantite: mouvement }))
}

/// Mouvement de stock fait à la livraison de cette ligne (positif = retiré, négatif = reçu),
/// pour proposer de l'annuler à la dévalidation. `None` = la ligne n'a pas été comptée.
#[tauri::command]
pub fn stock_decompte_ligne(db: State<Db>, table: String, id: i64) -> Result<Option<MouvementStock>, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    decompte_de(conn, &table, id)
}

fn decompte_de(conn: &rusqlite::Connection, table: &str, id: i64) -> Result<Option<MouvementStock>, String> {
    let t = table_ligne(table)?;
    let ligne = lire_ligne_stock(conn, t, id)?;
    let (Some(cs_id), Some(quantite)) = (ligne.caisse_stock_id, ligne.stock_decompte) else { return Ok(None) };
    let nom = get_caisse_stock(conn, cs_id).map(|c| c.nom).unwrap_or_default();
    Ok(Some(MouvementStock { caisse_stock_id: cs_id, nom, quantite }))
}

/// Dévalidation d'une ligne comptée, après accord de l'utilisateur : annule le mouvement fait à
/// la livraison (remet en stock ce qui avait été retiré, ou retire ce qui avait été reçu —
/// plancher à 0) et efface la marque (la ligne sera recomptée si on la revalide). Sans accord,
/// l'UI n'appelle rien : la ligne reste marquée et une revalidation ne comptera pas deux fois.
#[tauri::command]
pub fn remettre_stock_ligne(db: State<Db>, table: String, id: i64, trigramme: String) -> Result<(), String> {
    let mut guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_mut().ok_or("base de données non initialisée")?;
    require_lock(conn, "demandes", &trigramme)?;
    remettre(conn, &table, id, &trigramme)
}

fn remettre(conn: &mut rusqlite::Connection, table: &str, id: i64, trigramme: &str) -> Result<(), String> {
    let t = table_ligne(table)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let Some(mouvement) = decompte_de(&tx, t, id)? else { return Ok(()) };
    tx.execute(
        "UPDATE caisse_stock SET quantite = MAX(0, quantite + ?1) WHERE id = ?2",
        rusqlite::params![mouvement.quantite, mouvement.caisse_stock_id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(&format!("UPDATE {t} SET stock_decompte = NULL WHERE id = ?1"), [id])
        .map_err(|e| e.to_string())?;
    if mouvement.quantite != 0 {
        let (action, details) = if mouvement.quantite > 0 {
            ("stock_remise", format!("+{}", mouvement.quantite))
        } else {
            ("stock_retrait", format!("−{} (annulation de réception)", -mouvement.quantite))
        };
        journaliser(
            &tx,
            trigramme,
            action,
            "caisse_stock",
            Some(mouvement.caisse_stock_id),
            &format!("{} : {} (dévalidation {} n°{})", mouvement.nom, details, libelle_ligne(t), id),
        );
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modification_repercutee_sur_les_lignes_non_livrees() {
        let dir = std::env::temp_dir().join(format!("caisses-test-stock-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let mut conn = crate::db::open_at(&dir);
        conn.execute_batch(
            "INSERT INTO caisse_stock (id, nom, longueur_mm, largeur_mm, hauteur_mm, quantite, observations, ordre)
                 VALUES (1, 'CAISSE A', 1000, 800, 600, 1, '', 0);
             INSERT INTO demande (id, affaire, caisse_stock_id, longueur_mm, largeur_mm, hauteur_mm, type_ouverture, observations, validee)
                 VALUES (10, 'AFFAIRE1', 1, 1000, 800, 600, 'Par dessus', '', 0),
                        (11, 'AFFAIRE2', 1, 1000, 800, 600, 'Par dessus', 'Livré', 1);
             INSERT INTO demande_caisse (id, demande_id, caisse_stock_id, longueur_mm, largeur_mm, hauteur_mm, type_ouverture, observations)
                 VALUES (20, 10, 1, 1000, 800, 600, 'Par dessus', ''),
                        (21, 11, 1, 1000, 800, 600, 'Par dessus', 'Livré');
             INSERT INTO affaire (id, nom) VALUES (1, 'AFFAIRE1');
             INSERT INTO caisse (id, affaire_id, nom, longueur_mm, largeur_mm, hauteur_mm, demande_id, caisse_stock_id)
                 VALUES (30, 1, 'AFFAIRE1', 1000, 800, 600, 10, 1);",
        )
        .unwrap();
        let mut modifiee = versnew(&get_caisse_stock(&conn, 1).unwrap());
        modifiee.longueur_mm = 1200.0;
        modifiee.type_ouverture = "Par devant".to_string();
        modifier_caisse_stock(&mut conn, 1, &modifiee, "AJC").unwrap();

        let ligne = |sql: &str| -> (f64, String) { conn.query_row(sql, [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap() };
        assert_eq!(ligne("SELECT longueur_mm, type_ouverture FROM demande WHERE id = 10"), (1200.0, "Par devant".into()));
        assert_eq!(ligne("SELECT longueur_mm, type_ouverture FROM demande WHERE id = 11"), (1000.0, "Par dessus".into()));
        assert_eq!(ligne("SELECT longueur_mm, type_ouverture FROM demande_caisse WHERE id = 20"), (1200.0, "Par devant".into()));
        assert_eq!(ligne("SELECT longueur_mm, type_ouverture FROM demande_caisse WHERE id = 21"), (1000.0, "Par dessus".into()));
        let simu: f64 = conn.query_row("SELECT longueur_mm FROM caisse WHERE id = 30", [], |r| r.get(0)).unwrap();
        assert_eq!(simu, 1200.0);
        assert_eq!(lignes_liees_non_livrees(&conn, 1).unwrap(), (vec![10], vec![20]));
    }

    #[test]
    fn decompte_a_la_livraison_et_remise_en_stock() {
        let dir = std::env::temp_dir().join(format!("caisses-test-decompte-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let mut conn = crate::db::open_at(&dir);
        conn.execute_batch(
            "INSERT INTO caisse_stock (id, nom, longueur_mm, largeur_mm, hauteur_mm, quantite, observations, ordre, gere)
                 VALUES (1, 'AR_CAISS_00001', 1000, 800, 600, 5, '', 0, 1),
                        (2, 'AR_CAISS_00002', 1000, 800, 600, 5, '', 1, 0),
                        (3, 'RECUP', 1000, 800, 600, 1, '', 2, 1);
             INSERT INTO demande (id, affaire, caisse_stock_id, quantite) VALUES
                 (10, 'AFFAIRE1', 1, 3), (11, 'AFFAIRE2', 1, 4), (12, 'AFFAIRE3', 2, 1), (13, 'AFFAIRE4', 3, 1);
             INSERT INTO demande_caisse (id, demande_id, caisse_stock_id, quantite) VALUES (20, 10, 1, 1);",
        )
        .unwrap();
        let stock = |conn: &rusqlite::Connection, id: i64| -> i64 {
            conn.query_row("SELECT quantite FROM caisse_stock WHERE id = ?1", [id], |r| r.get(0)).unwrap()
        };

        // Décompte de la quantité de la ligne, une seule fois.
        assert_eq!(decompter(&mut conn, "demande", 10, "AJC").unwrap().unwrap().quantite, 3);
        assert!(decompter(&mut conn, "demande", 10, "AJC").unwrap().is_none());
        assert_eq!(stock(&conn, 1), 2);
        // Plancher à 0 : on ne retire que ce qui reste.
        assert_eq!(decompter(&mut conn, "demande", 11, "AJC").unwrap().unwrap().quantite, 2);
        assert_eq!(stock(&conn, 1), 0);
        assert_eq!(decompter(&mut conn, "demande_caisse", 20, "AJC").unwrap().unwrap().quantite, 0);
        // Caisse non gérée : décomptée aussi (on l'écoule) ; caisse de récup : pas de décompte.
        assert_eq!(decompter(&mut conn, "demande", 12, "AJC").unwrap().unwrap().quantite, 1);
        assert!(decompter(&mut conn, "demande", 13, "AJC").unwrap().is_none());
        assert_eq!((stock(&conn, 2), stock(&conn, 3)), (4, 1));

        // Remise : exactement ce qui a été retiré, puis la ligne peut être re-décomptée.
        remettre(&mut conn, "demande", 11, "AJC").unwrap();
        assert_eq!(stock(&conn, 1), 2);
        assert!(decompte_de(&conn, "demande", 11).unwrap().is_none());
        assert_eq!(decompter(&mut conn, "demande", 11, "AJC").unwrap().unwrap().quantite, 2);

        // Réception d'une commande ACHSTOCK : la quantité est ajoutée (sans plafond), y compris
        // retrouvée par le nom écrit dans la colonne `stock` ; dévalidation = retrait (plancher 0).
        conn.execute_batch(
            "INSERT INTO demande (id, affaire, caisse_stock_id, stock, quantite) VALUES
                 (14, 'ACHSTOCK', 1, '', 10), (15, 'achstock 2', NULL, 'ar_caiss_00001 ', 3);
             INSERT INTO demande_caisse (id, demande_id, caisse_stock_id, quantite) VALUES (21, 14, 1, 2);",
        )
        .unwrap();
        assert_eq!(decompter(&mut conn, "demande", 14, "AJC").unwrap().unwrap().quantite, -10);
        assert_eq!(stock(&conn, 1), 10);
        assert_eq!(decompter(&mut conn, "demande", 15, "AJC").unwrap().unwrap().quantite, -3);
        assert_eq!(decompter(&mut conn, "demande_caisse", 21, "AJC").unwrap().unwrap().quantite, -2);
        assert_eq!(stock(&conn, 1), 15);
        remettre(&mut conn, "demande", 14, "AJC").unwrap();
        assert_eq!(stock(&conn, 1), 5);
        conn.execute("UPDATE caisse_stock SET quantite = 1 WHERE id = 1", []).unwrap();
        remettre(&mut conn, "demande", 15, "AJC").unwrap();
        assert_eq!(stock(&conn, 1), 0);

        // Réglage admin réservé aux AR_CAISS_.
        regler_suivi(&conn, 1, 10, true, 3, "AJC").unwrap();
        assert_eq!(stock(&conn, 1), 10);
        assert!(regler_suivi(&conn, 3, 1, true, 0, "AJC").is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn versnew(c: &CaisseStock) -> NewCaisseStock {
        NewCaisseStock {
            nom: c.nom.clone(),
            longueur_mm: c.longueur_mm,
            largeur_mm: c.largeur_mm,
            hauteur_mm: c.hauteur_mm,
            quantite: c.quantite,
            observations: c.observations.clone(),
            affaire_id: c.affaire_id,
            type_ouverture: c.type_ouverture.clone(),
        }
    }
}
