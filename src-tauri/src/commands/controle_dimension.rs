use crate::commands::admin::{require_admin, AdminSession};
use crate::commands::backup::{ecrire, lire};
use crate::commands::locks::require_lock;
use crate::db::Db;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

// Contrôle dimensionnel (2026-11-16, ADR 0004) : référentiel des AR vus dans Simulations
// (dimensions / poids de l'ERP) + résultat du dernier contrôle manuel. Les listes (à contrôler,
// validés, dimensions corrigées) sont calculées côté frontend (`domain/controleDimension.ts`) à
// partir de ces lignes et des réglages : seuil et durée de validité modifiables sans migration.
// Verrou propre « controle ».

const SECTION: &str = "controle";
const CLE_SEUIL: &str = "controle_seuil_mm";
const CLE_DUREE: &str = "controle_duree_mois";
const SEUIL_DEFAUT: f64 = 350.0;
const DUREE_DEFAUT: i64 = 12;

#[derive(Debug, Serialize)]
pub struct ControleDimension {
    pub ar: String,
    pub dim1_mm: f64,
    pub dim2_mm: f64,
    pub dim3_mm: f64,
    pub poids_kg: f64,
    pub ajoute_le: String,
    pub controle_le: Option<String>,
    pub controle_par: String,
    pub corrige: bool,
    pub corr_dim1_mm: Option<f64>,
    pub corr_dim2_mm: Option<f64>,
    pub corr_dim3_mm: Option<f64>,
    pub corr_poids_kg: Option<f64>,
    pub erp_valide_le: Option<String>,
    pub erp_valide_par: String,
    /// Affaires de Simulations où la pièce est encore accessible (ligne non colisée), pour la
    /// retrouver ; séparées par « , ».
    pub affaires: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReglagesControle {
    pub seuil_mm: f64,
    pub duree_mois: i64,
}

/// Ligne d'un article vu à l'import (picking ou collage).
pub(crate) struct ArticleVu<'a> {
    pub ar: &'a str,
    pub dim1_mm: f64,
    pub dim2_mm: f64,
    pub dim3_mm: f64,
    pub poids_kg: f64,
}

/// Ajoute au référentiel les AR jamais vus ; pour un AR connu, rafraîchit les valeurs de l'ERP
/// si les trois dimensions sont saisies (une ligne sans mesures n'efface pas les bonnes). Le
/// résultat du contrôle n'est jamais touché. Lignes « AR… » seulement.
pub(crate) fn enregistrer_articles(conn: &Connection, articles: &[ArticleVu]) -> Result<(), String> {
    let mut stmt = conn
        .prepare_cached(
            "INSERT INTO controle_dimension (ar, dim1_mm, dim2_mm, dim3_mm, poids_kg) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(ar) DO UPDATE SET dim1_mm = excluded.dim1_mm, dim2_mm = excluded.dim2_mm,
                 dim3_mm = excluded.dim3_mm, poids_kg = excluded.poids_kg
             WHERE excluded.dim1_mm > 0 AND excluded.dim2_mm > 0 AND excluded.dim3_mm > 0",
        )
        .map_err(|e| e.to_string())?;
    for a in articles {
        let ar = a.ar.trim().to_uppercase();
        if !ar.starts_with("AR") {
            continue;
        }
        stmt.execute(params![ar, a.dim1_mm, a.dim2_mm, a.dim3_mm, a.poids_kg])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// Ligne livrée / rapatriée (même règle que `estDemandeValidee` / `estDemandeCaisseValidee` :
// une sous-caisse n'est livrée que par sa propre observation depuis 0050).
const DEMANDE_LIVREE: &str = "(COALESCE(d.validee, 0) = 1 OR lower(COALESCE(d.observations, '')) LIKE '%livré%' OR lower(COALESCE(d.observations, '')) LIKE '%livre%'
     OR lower(COALESCE(d.observations, '')) LIKE '%rapatrié%' OR lower(COALESCE(d.observations, '')) LIKE '%rapatrie%')";
const SOUS_CAISSE_LIVREE: &str = "(lower(COALESCE(dc.observations, '')) LIKE '%livré%' OR lower(COALESCE(dc.observations, '')) LIKE '%livre%'
     OR lower(COALESCE(dc.observations, '')) LIKE '%rapatrié%' OR lower(COALESCE(dc.observations, '')) LIKE '%rapatrie%')";

/// Affaire `f` entièrement expédiée : au moins une ligne de Gestion des caisses de ce nom, toutes
/// livrées (mère et caisses détaillées).
fn affaire_expediee() -> String {
    format!(
        "(EXISTS (SELECT 1 FROM demande d WHERE lower(trim(d.affaire)) = lower(trim(f.nom)))
          AND NOT EXISTS (SELECT 1 FROM demande d WHERE lower(trim(d.affaire)) = lower(trim(f.nom))
                          AND NOT {DEMANDE_LIVREE})
          AND NOT EXISTS (SELECT 1 FROM demande_caisse dc JOIN demande d ON d.id = dc.demande_id
                          WHERE lower(trim(d.affaire)) = lower(trim(f.nom)) AND NOT {SOUS_CAISSE_LIVREE}))"
    )
}

/// Affaires où la pièce est encore à portée de main : ligne non supprimée, pas colisée, affaire pas
/// entièrement expédiée. (Jusqu'au 2026-11-17, une pièce assignée dans la simulation à une caisse
/// livrée était aussi écartée : faux pour une pièce décolisée restée sur place — USACM109.)
/// Calcul de secours : la page recalcule d'après le picking lu en direct quand il est lisible.
fn requete_lister() -> String {
    let expediee = affaire_expediee();
    format!(
        "SELECT c.ar, c.dim1_mm, c.dim2_mm, c.dim3_mm, c.poids_kg, c.ajoute_le, c.controle_le, c.controle_par,
                c.corrige, c.corr_dim1_mm, c.corr_dim2_mm, c.corr_dim3_mm, c.corr_poids_kg, c.erp_valide_le,
                c.erp_valide_par,
                COALESCE((SELECT group_concat(nom, ', ') FROM (
                    SELECT DISTINCT f.nom FROM article a JOIN affaire f ON f.id = a.affaire_id
                    WHERE upper(trim(a.ar)) = c.ar AND a.supprime_intranet = 0 AND trim(COALESCE(a.colis, '')) = ''
                      AND NOT {expediee}
                    ORDER BY f.nom)), '')
         FROM controle_dimension c ORDER BY c.ar"
    )
}

fn lister(conn: &Connection) -> Result<Vec<ControleDimension>, String> {
    let mut stmt = conn.prepare(&requete_lister()).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(ControleDimension {
                ar: r.get(0)?,
                dim1_mm: r.get(1)?,
                dim2_mm: r.get(2)?,
                dim3_mm: r.get(3)?,
                poids_kg: r.get(4)?,
                ajoute_le: r.get(5)?,
                controle_le: r.get(6)?,
                controle_par: r.get(7)?,
                corrige: r.get(8)?,
                corr_dim1_mm: r.get(9)?,
                corr_dim2_mm: r.get(10)?,
                corr_dim3_mm: r.get(11)?,
                corr_poids_kg: r.get(12)?,
                erp_valide_le: r.get(13)?,
                erp_valide_par: r.get(14)?,
                affaires: r.get(15)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Affaires de Simulations pas entièrement expédiées : celles dont la page de contrôle lit le
/// picking en direct (2026-11-17), pour faire entrer les nouveaux AR sans attendre une mise à jour
/// du picking dans Simulations.
fn affaires_a_lire(conn: &Connection) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(&format!("SELECT f.nom FROM affaire f WHERE NOT {} ORDER BY f.nom", affaire_expediee()))
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| r.get(0)).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<String>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_affaires_controle(db: State<Db>) -> Result<Vec<String>, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    affaires_a_lire(conn)
}

/// Article lu dans un picking en direct par la page de contrôle.
#[derive(Debug, Deserialize)]
pub struct ArticleErp {
    pub ar: String,
    pub dim1_mm: f64,
    pub dim2_mm: f64,
    pub dim3_mm: f64,
    pub poids_kg: f64,
}

/// Ajoute au référentiel les AR lus en direct et rafraîchit les valeurs de l'ERP (même règle qu'à
/// l'import du picking). Pas de verrou : c'est une copie de l'ERP, pas une saisie. Renvoie le
/// nombre d'AR nouveaux.
fn rafraichir(conn: &mut Connection, articles: &[ArticleErp]) -> Result<usize, String> {
    let compter = |c: &Connection| -> Result<i64, String> {
        c.query_row("SELECT COUNT(*) FROM controle_dimension", [], |r| r.get(0)).map_err(|e| e.to_string())
    };
    let avant = compter(conn)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let vus: Vec<ArticleVu> = articles
        .iter()
        .map(|a| ArticleVu { ar: &a.ar, dim1_mm: a.dim1_mm, dim2_mm: a.dim2_mm, dim3_mm: a.dim3_mm, poids_kg: a.poids_kg })
        .collect();
    enregistrer_articles(&tx, &vus)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok((compter(conn)? - avant).max(0) as usize)
}

#[tauri::command]
pub fn rafraichir_controle_dimension(db: State<Db>, articles: Vec<ArticleErp>, trigramme: String) -> Result<usize, String> {
    let mut guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_mut().ok_or("base de données non initialisée")?;
    crate::commands::admin::refuser_lecteur(conn, &trigramme)?;
    rafraichir(conn, &articles)
}

#[tauri::command]
pub fn list_controle_dimension(db: State<Db>) -> Result<Vec<ControleDimension>, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    lister(conn)
}

fn reglages(conn: &Connection) -> Result<ReglagesControle, String> {
    Ok(ReglagesControle {
        seuil_mm: lire(conn, CLE_SEUIL)?.and_then(|v| v.parse().ok()).unwrap_or(SEUIL_DEFAUT),
        duree_mois: lire(conn, CLE_DUREE)?.and_then(|v| v.parse().ok()).unwrap_or(DUREE_DEFAUT),
    })
}

#[tauri::command]
pub fn get_reglages_controle(db: State<Db>) -> Result<ReglagesControle, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    reglages(conn)
}

fn verifier_reglages(r: &ReglagesControle) -> Result<(), String> {
    if !(r.seuil_mm > 0.0 && r.seuil_mm.is_finite()) {
        return Err("Le seuil doit être supérieur à 0 mm.".to_string());
    }
    if !(1..=120).contains(&r.duree_mois) {
        return Err("La durée de validité doit être comprise entre 1 et 120 mois.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn set_reglages_controle(db: State<Db>, session: State<AdminSession>, reglages: ReglagesControle) -> Result<(), String> {
    require_admin(&session)?;
    verifier_reglages(&reglages)?;
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    ecrire(conn, CLE_SEUIL, &reglages.seuil_mm.to_string())?;
    ecrire(conn, CLE_DUREE, &reglages.duree_mois.to_string())
}

fn verifier_existe(conn: &Connection, ar: &str) -> Result<(), String> {
    let n: i64 = conn
        .query_row("SELECT COUNT(*) FROM controle_dimension WHERE ar = ?1", [ar], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err(format!("Article « {ar} » introuvable dans le contrôle dimensionnel."));
    }
    Ok(())
}

/// Mesures conformes à l'ERP : contrôle validé (efface une éventuelle correction précédente).
fn valider(conn: &Connection, ar: &str, trigramme: &str) -> Result<(), String> {
    require_lock(conn, SECTION, trigramme)?;
    verifier_existe(conn, ar)?;
    conn.execute(
        "UPDATE controle_dimension SET controle_le = datetime('now'), controle_par = ?2, corrige = 0,
             corr_dim1_mm = NULL, corr_dim2_mm = NULL, corr_dim3_mm = NULL, corr_poids_kg = NULL,
             erp_valide_le = NULL, erp_valide_par = ''
         WHERE ar = ?1",
        params![ar, trigramme],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn valider_controle_dimension(db: State<Db>, ar: String, trigramme: String) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    valider(conn, &ar, &trigramme)
}

fn proche(a: f64, b: f64) -> bool {
    (a - b).abs() < 0.0005
}

/// Mesures relevées au contrôle. Identiques à l'ERP → simple validation ; sinon l'AR passe dans
/// « Dimensions corrigées », en attente du report dans l'ERP.
fn corriger(conn: &Connection, ar: &str, mesures: [f64; 4], trigramme: &str) -> Result<(), String> {
    require_lock(conn, SECTION, trigramme)?;
    verifier_existe(conn, ar)?;
    if mesures[..3].iter().any(|d| !(*d > 0.0 && d.is_finite())) {
        return Err("Les trois dimensions doivent être supérieures à 0 mm.".to_string());
    }
    if !(mesures[3] >= 0.0 && mesures[3].is_finite()) {
        return Err("Le poids ne peut pas être négatif.".to_string());
    }
    let erp: [f64; 4] = conn
        .query_row(
            "SELECT dim1_mm, dim2_mm, dim3_mm, poids_kg FROM controle_dimension WHERE ar = ?1",
            [ar],
            |r| Ok([r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?]),
        )
        .map_err(|e| e.to_string())?;
    if erp.iter().zip(mesures.iter()).all(|(a, b)| proche(*a, *b)) {
        return valider(conn, ar, trigramme);
    }
    conn.execute(
        "UPDATE controle_dimension SET controle_le = datetime('now'), controle_par = ?2, corrige = 1,
             corr_dim1_mm = ?3, corr_dim2_mm = ?4, corr_dim3_mm = ?5, corr_poids_kg = ?6,
             erp_valide_le = NULL, erp_valide_par = ''
         WHERE ar = ?1",
        params![ar, trigramme, mesures[0], mesures[1], mesures[2], mesures[3]],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn corriger_controle_dimension(
    db: State<Db>,
    ar: String,
    dim1_mm: f64,
    dim2_mm: f64,
    dim3_mm: f64,
    poids_kg: f64,
    trigramme: String,
) -> Result<(), String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("base de données non initialisée")?;
    corriger(conn, &ar, [dim1_mm, dim2_mm, dim3_mm, poids_kg], &trigramme)
}

/// Correction reportée dans l'ERP (une ou plusieurs lignes). Ignore les lignes non corrigées ou
/// déjà validées. Renvoie le nombre de lignes validées.
fn valider_erp(conn: &mut Connection, ars: &[String], trigramme: &str) -> Result<usize, String> {
    require_lock(conn, SECTION, trigramme)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut n = 0;
    for ar in ars {
        n += tx
            .execute(
                "UPDATE controle_dimension SET erp_valide_le = datetime('now'), erp_valide_par = ?2
                 WHERE ar = ?1 AND corrige = 1 AND erp_valide_le IS NULL",
                params![ar, trigramme],
            )
            .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(n)
}

#[tauri::command]
pub fn valider_erp_controle_dimension(db: State<Db>, ars: Vec<String>, trigramme: String) -> Result<usize, String> {
    let mut guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_mut().ok_or("base de données non initialisée")?;
    valider_erp(conn, &ars, &trigramme)
}

/// Cellule d'un export : nombre ou texte ("" = case vide, à remplir à la main sur la feuille
/// imprimée).
#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum Cellule {
    Nombre(f64),
    Texte(String),
    /// Formule Excel en anglais (`=IF(…)`), envoyée comme `{ "formule": "=…" }` — écarts relevé /
    /// ERP de l'export « À contrôler », calculés dans Excel une fois les mesures saisies.
    Formule { formule: String },
}

/// Feuille exportée : titre de l'onglet, en-têtes, lignes. Le contenu est choisi côté frontend
/// (« Dimensions corrigées » pour l'ERP, « À contrôler » pour imprimer ou ouvrir sur une
/// tablette, 2026-11-16).
#[derive(Debug, Deserialize)]
pub struct FeuilleExport {
    pub nom: String,
    pub entetes: Vec<String>,
    pub lignes: Vec<Vec<Cellule>>,
    /// Couleur de fond par colonne (« #RRGGBB », "" = aucune) — ex. valeurs de l'ERP en
    /// bleu-gris clair (2026-11-17). Absent = aucune.
    #[serde(default)]
    pub fonds: Vec<String>,
}

/// 610 → « 610 », 400.5 → « 400.5 », 2.1234 → « 2.123 » (3 décimales au plus, zéros inutiles
/// retirés, toujours un point).
fn nombre_avec_point(n: f64) -> String {
    let t = format!("{n:.3}");
    let t = t.trim_end_matches('0').trim_end_matches('.');
    if t == "-0" { "0".to_string() } else { t.to_string() }
}

fn ecrire_xlsx(chemin: &std::path::Path, feuille: &FeuilleExport) -> Result<(), String> {
    use rust_xlsxwriter::{Format, FormatBorder, Workbook};
    let err = |e: rust_xlsxwriter::XlsxError| e.to_string();
    let mut wb = Workbook::new();
    let ws = wb.add_worksheet();
    // Nom d'onglet Excel : 31 caractères au plus.
    ws.set_name(feuille.nom.chars().take(31).collect::<String>()).map_err(err)?;
    let entete = Format::new().set_bold().set_border(FormatBorder::Thin).set_background_color("#E8EEF7");
    let cadre = Format::new().set_border(FormatBorder::Thin);
    let fond_de = |c: usize| feuille.fonds.get(c).map(|f| f.trim()).filter(|f| f.len() == 7 && f.starts_with('#'));
    // Une mise en forme par colonne : cadre, plus son fond s'il y en a un.
    let formats: Vec<Format> = (0..feuille.entetes.len())
        .map(|c| match fond_de(c) {
            Some(f) => cadre.clone().set_background_color(f),
            None => cadre.clone(),
        })
        .collect();
    let formats_entete: Vec<Format> = (0..feuille.entetes.len())
        .map(|c| match fond_de(c) {
            Some(f) => entete.clone().set_background_color(f),
            None => entete.clone(),
        })
        .collect();
    let mut largeurs: Vec<usize> = feuille.entetes.iter().map(|t| t.chars().count()).collect();
    for (c, t) in feuille.entetes.iter().enumerate() {
        ws.write_string_with_format(0, c as u16, t, &formats_entete[c]).map_err(err)?;
    }
    for (i, ligne) in feuille.lignes.iter().enumerate() {
        let r = (i + 1) as u32;
        for (c, cellule) in ligne.iter().enumerate() {
            let col = c as u16;
            let fmt = formats.get(c).unwrap_or(&cadre);
            let longueur = match cellule {
                // Nombres écrits en texte avec un point décimal (demande de l'utilisateur,
                // 2026-11-17 : un vrai nombre s'affiche « 400,5 » dans un Excel en français).
                Cellule::Nombre(n) => {
                    let t = nombre_avec_point(*n);
                    ws.write_string_with_format(r, col, &t, fmt).map_err(err)?;
                    t.len()
                }
                Cellule::Texte(t) => {
                    ws.write_string_with_format(r, col, t, fmt).map_err(err)?;
                    t.chars().count()
                }
                Cellule::Formule { formule } => {
                    ws.write_formula_with_format(r, col, formule.as_str(), fmt).map_err(err)?;
                    8
                }
            };
            if let Some(l) = largeurs.get_mut(c) {
                *l = (*l).max(longueur);
            }
        }
    }
    for (c, l) in largeurs.iter().enumerate() {
        ws.set_column_width(c as u16, (*l as f64 + 2.0).clamp(10.0, 50.0)).map_err(err)?;
    }
    // Prête à imprimer : paysage, toute la largeur sur une page, en-tête répété, quadrillage.
    ws.set_landscape();
    ws.set_print_fit_to_pages(1, 0);
    ws.set_repeat_rows(0, 0).map_err(err)?;
    ws.set_print_gridlines(true);
    ws.set_freeze_panes(1, 0).map_err(err)?;
    wb.save(chemin).map_err(err)
}

/// Demande où enregistrer puis écrit le fichier Excel. `None` si l'utilisateur annule.
#[tauri::command]
pub async fn exporter_controle_xlsx(app: AppHandle, feuille: FeuilleExport, nom_fichier: String) -> Result<Option<String>, String> {
    let Some(fichier) = app
        .dialog()
        .file()
        .add_filter("Classeur Excel", &["xlsx"])
        .set_file_name(&nom_fichier)
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let mut chemin = fichier.into_path().map_err(|e| e.to_string())?;
    if chemin.extension().map(|e| !e.eq_ignore_ascii_case("xlsx")).unwrap_or(true) {
        chemin.set_extension("xlsx");
    }
    ecrire_xlsx(&chemin, &feuille)?;
    Ok(Some(chemin.to_string_lossy().into_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vu(ar: &str, d: [f64; 4]) -> ArticleVu<'_> {
        ArticleVu { ar, dim1_mm: d[0], dim2_mm: d[1], dim3_mm: d[2], poids_kg: d[3] }
    }

    #[test]
    fn referentiel_controle_et_erp() {
        let dir = std::env::temp_dir().join(format!("caisses-test-controle-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let mut conn = crate::db::open_at(&dir);

        // Reprise des articles existants par la migration : refaite à la main sur base neuve.
        enregistrer_articles(
            &conn,
            &[vu(" ar_x_1 ", [400.0, 380.0, 10.0, 2.0]), vu("ZR_Y", [500.0, 500.0, 500.0, 1.0]), vu("AR_X_2", [0.0, 0.0, 0.0, 0.0])],
        )
        .unwrap();
        let l = lister(&conn).unwrap();
        assert_eq!(l.iter().map(|c| c.ar.as_str()).collect::<Vec<_>>(), ["AR_X_1", "AR_X_2"]);

        // Un nouveau picking rafraîchit les valeurs de l'ERP, sauf ligne sans mesures.
        enregistrer_articles(&conn, &[vu("AR_X_2", [600.0, 600.0, 50.0, 3.0]), vu("AR_X_1", [0.0, 0.0, 0.0, 9.0])]).unwrap();
        let l = lister(&conn).unwrap();
        assert_eq!(l[0].dim1_mm, 400.0);
        assert_eq!(l[1].dim1_mm, 600.0);

        // Mesures identiques → validé ; différentes → corrigé, en attente de l'ERP.
        corriger(&conn, "AR_X_1", [400.0, 380.0, 10.0, 2.0], "AJC").unwrap();
        corriger(&conn, "AR_X_2", [610.0, 600.0, 50.0, 3.0], "AJC").unwrap();
        let l = lister(&conn).unwrap();
        assert!(l[0].controle_le.is_some() && !l[0].corrige);
        assert!(l[1].corrige && l[1].corr_dim1_mm == Some(610.0) && l[1].erp_valide_le.is_none());
        assert!(corriger(&conn, "AR_X_2", [0.0, 600.0, 50.0, 3.0], "AJC").is_err());
        assert!(valider(&conn, "AR_INCONNU", "AJC").is_err());

        // Report dans l'ERP : seulement les lignes corrigées non encore validées.
        assert_eq!(valider_erp(&mut conn, &["AR_X_1".into(), "AR_X_2".into()], "AJC").unwrap(), 1);
        assert_eq!(valider_erp(&mut conn, &["AR_X_2".into()], "AJC").unwrap(), 0);
        assert!(lister(&conn).unwrap()[1].erp_valide_le.is_some());

        // Un nouveau contrôle conforme efface la correction.
        valider(&conn, "AR_X_2", "AJC").unwrap();
        let l = lister(&conn).unwrap();
        assert!(!l[1].corrige && l[1].corr_dim1_mm.is_none() && l[1].erp_valide_le.is_none());

        // Verrou pris par un autre poste → refusé.
        conn.execute(
            "INSERT INTO section_lock (section_key, titulaire, acquis_le, dernier_battement)
             VALUES ('controle', 'FBA', datetime('now'), datetime('now'))",
            [],
        )
        .unwrap();
        assert!(valider(&conn, "AR_X_1", "AJC").is_err());

        // Réglages par défaut et vérification.
        let r = reglages(&conn).unwrap();
        assert_eq!((r.seuil_mm, r.duree_mois), (350.0, 12));
        assert!(verifier_reglages(&ReglagesControle { seuil_mm: 0.0, duree_mois: 12 }).is_err());
        assert!(verifier_reglages(&ReglagesControle { seuil_mm: 350.0, duree_mois: 0 }).is_err());

        // Export Excel écrit un fichier.
        let fichier = dir.join("export.xlsx");
        let feuille: FeuilleExport = serde_json::from_str(
            r##"{"nom": "À contrôler", "entetes": ["Article", "Longueur (mm)", "Longueur relevée"],
                "lignes": [["AR_X_2", 610, ""], ["AR_X_1", 400.5, {"formule": "=IF(C3=\"\",\"\",C3-1)"}]],
                "fonds": ["", "#DCE4EE", ""]}"##,
        )
        .unwrap();
        assert!(matches!(feuille.lignes[0][1], Cellule::Nombre(n) if n == 610.0));
        assert!(matches!(&feuille.lignes[0][2], Cellule::Texte(t) if t.is_empty()));
        assert!(matches!(&feuille.lignes[1][2], Cellule::Formule { formule } if formule.starts_with("=IF(")));
        ecrire_xlsx(&fichier, &feuille).unwrap();
        assert_eq!(nombre_avec_point(610.0), "610");
        assert_eq!(nombre_avec_point(400.5), "400.5");
        assert_eq!(nombre_avec_point(2.12345), "2.123");
        assert_eq!(nombre_avec_point(0.0), "0");
        assert!(fichier.metadata().unwrap().len() > 0);

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn affaires_expediees_masquees_et_lecture_directe() {
        let dir = std::env::temp_dir().join(format!("caisses-test-controle-aff-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let conn = crate::db::open_at(&dir);
        conn.execute_batch(
            "INSERT INTO affaire (id, nom) VALUES (1, 'EXPEDIEE'), (2, 'PARTIEL'), (3, 'ENCOURS'), (4, 'SANSLIGNE');
             -- EXPEDIEE : seule ligne livrée, sans caisse détaillée en attente.
             INSERT INTO demande (id, affaire, observations) VALUES (1, 'expediee ', 'Livré');
             -- PARTIEL : mère livrée, une caisse détaillée encore à livrer.
             INSERT INTO demande (id, affaire, observations) VALUES (2, 'PARTIEL', 'Livré');
             INSERT INTO demande_caisse (id, demande_id, nom, observations) VALUES (20, 2, 'PARTIEL', '');
             INSERT INTO demande (id, affaire, observations) VALUES (3, 'ENCOURS', '');
             INSERT INTO caisse (id, affaire_id, nom, longueur_mm, largeur_mm, hauteur_mm, demande_id) VALUES
                 (10, 2, 'PARTIEL', 1000, 1000, 1000, 2);
             INSERT INTO caisse (id, affaire_id, nom, longueur_mm, largeur_mm, hauteur_mm, demande_caisse_id) VALUES
                 (11, 2, 'PARTIEL', 1000, 1000, 1000, 20);
             INSERT INTO article (affaire_id, caisse_id, ar, reference, designation, dim1_mm, dim2_mm, dim3_mm, poids_unitaire_kg, quantite, ordre) VALUES
                 (1, NULL, 'AR_A', '', '', 400, 400, 1, 1, 1, 0),
                 (2, 10, 'AR_B', '', '', 400, 400, 1, 1, 1, 0),
                 (2, 11, 'AR_C', '', '', 400, 400, 1, 1, 1, 1),
                 (2, NULL, 'AR_D', '', '', 400, 400, 1, 1, 1, 2),
                 (3, NULL, 'AR_A', '', '', 400, 400, 1, 1, 1, 0),
                 (4, NULL, 'AR_E', '', '', 400, 400, 1, 1, 1, 0);",
        )
        .unwrap();
        let vus: Vec<_> = ["AR_A", "AR_B", "AR_C", "AR_D", "AR_E"]
            .iter()
            .map(|ar| ArticleVu { ar, dim1_mm: 400.0, dim2_mm: 400.0, dim3_mm: 1.0, poids_kg: 1.0 })
            .collect();
        enregistrer_articles(&conn, &vus).unwrap();
        let affaires = |ar: &str| lister(&conn).unwrap().into_iter().find(|c| c.ar == ar).unwrap().affaires;
        assert_eq!(affaires("AR_A"), "ENCOURS"); // EXPEDIEE masquée
        // Assignée à la caisse livrée mais pas colisée : encore sur place (USACM109, 2026-11-17).
        assert_eq!(affaires("AR_B"), "PARTIEL");
        assert_eq!(affaires("AR_C"), "PARTIEL"); // caisse détaillée à livrer
        assert_eq!(affaires("AR_D"), "PARTIEL"); // non rangée, affaire pas entièrement expédiée
        assert_eq!(affaires("AR_E"), "SANSLIGNE"); // affaire sans ligne de Gestion des caisses
        // Affaires lues en direct : toutes sauf l'affaire entièrement expédiée.
        assert_eq!(affaires_a_lire(&conn).unwrap(), ["ENCOURS", "PARTIEL", "SANSLIGNE"]);
        // Rafraîchissement depuis un picking lu en direct : nouvel AR + valeurs ERP mises à jour.
        let mut conn = conn;
        let n = rafraichir(
            &mut conn,
            &[
                ArticleErp { ar: "AR_NEUF".into(), dim1_mm: 500.0, dim2_mm: 500.0, dim3_mm: 1.0, poids_kg: 2.0 },
                ArticleErp { ar: "ar_a".into(), dim1_mm: 410.0, dim2_mm: 400.0, dim3_mm: 1.0, poids_kg: 1.0 },
            ],
        )
        .unwrap();
        assert_eq!(n, 1);
        assert_eq!(lister(&conn).unwrap().iter().find(|c| c.ar == "AR_A").unwrap().dim1_mm, 410.0);
        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn migration_reprend_les_articles_existants() {
        let dir = std::env::temp_dir().join(format!("caisses-test-controle-mig-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let conn = crate::db::open_at(&dir);
        conn.execute_batch(
            "DELETE FROM controle_dimension;
             DELETE FROM _migrations WHERE nom = '0052_add_controle_dimension';
             DROP TABLE controle_dimension;
             INSERT INTO affaire (id, nom) VALUES (1, 'AFFAIRE1'), (2, 'AFFAIRE2');
             INSERT INTO article (affaire_id, ar, reference, designation, dim1_mm, dim2_mm, dim3_mm, poids_unitaire_kg, quantite, ordre, colis)
             VALUES (2, 'AR_A', '', '', 400, 400, 10, 2, 1, 0, '3');
             INSERT INTO article (affaire_id, ar, reference, designation, dim1_mm, dim2_mm, dim3_mm, poids_unitaire_kg, quantite, ordre)
             VALUES (1, 'AR_A', '', '', 100, 100, 100, 1, 1, 0), (1, 'ar_a', '', '', 400, 400, 10, 2, 1, 1),
                    (1, 'ZR_B', '', '', 1, 1, 1, 1, 1, 2);",
        )
        .unwrap();
        crate::db::appliquer_migrations(&conn).unwrap();
        let l = lister(&conn).unwrap();
        assert_eq!(l.len(), 1);
        assert_eq!((l[0].ar.as_str(), l[0].dim1_mm, l[0].affaires.as_str()), ("AR_A", 400.0, "AFFAIRE1"));
        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
