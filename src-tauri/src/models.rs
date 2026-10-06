use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Affaire {
    pub id: i64,
    pub nom: String,
    pub date_creation: String,
    pub seuil_defaut: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Caisse {
    pub id: i64,
    pub affaire_id: i64,
    pub nom: String,
    pub longueur_mm: f64,
    pub largeur_mm: f64,
    pub hauteur_mm: f64,
    pub seuil_pct: Option<f64>,
    pub couleur: String,
    pub ordre: i64,
    pub caisse_stock_id: Option<i64>,
    pub type_envoi_caisse: String,
    pub demande_caisse_id: Option<i64>,
    pub demande_id: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Article {
    pub id: i64,
    pub affaire_id: i64,
    pub caisse_id: Option<i64>,
    pub ar: String,
    pub reference: String,
    pub designation: String,
    pub dim1_mm: f64,
    pub dim2_mm: f64,
    pub dim3_mm: f64,
    pub poids_unitaire_kg: f64,
    pub quantite: i64,
    pub ordre: i64,
}

#[derive(Debug, Deserialize)]
pub struct NewArticle {
    pub ar: String,
    pub reference: String,
    pub designation: String,
    pub dim1_mm: f64,
    pub dim2_mm: f64,
    pub dim3_mm: f64,
    pub poids_unitaire_kg: f64,
    pub quantite: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Demande {
    pub id: i64,
    pub ok_pour_passer_cde: bool,
    pub affaire: String,
    pub type_envoi_caisse: String,
    pub type_ouverture: String,
    pub stock: String,
    pub longueur_mm: f64,
    pub largeur_mm: f64,
    pub hauteur_mm: f64,
    pub quantite: i64,
    pub date_picking: String,
    pub date_demandee_s2c: String,
    pub moteurs: String,
    pub module_lineaire: String,
    pub terminaux: String,
    pub traitement: String,
    pub informations_supp: String,
    pub cde_passee_affaire: bool,
    pub cde_passee_achat_stock: bool,
    pub observations: String,
    pub contre_plaque: bool,
    pub validee: bool,
    pub ordre: i64,
    pub caisse_stock_id: Option<i64>,
    /// Trigramme de qui a coché « OK pour être commandée » (vide sinon).
    pub ok_cde_par: String,
}

#[derive(Debug, Deserialize)]
pub struct NewDemande {
    pub ok_pour_passer_cde: bool,
    pub affaire: String,
    pub type_envoi_caisse: String,
    pub type_ouverture: String,
    pub stock: String,
    pub longueur_mm: f64,
    pub largeur_mm: f64,
    pub hauteur_mm: f64,
    pub quantite: i64,
    pub date_picking: String,
    pub date_demandee_s2c: String,
    pub moteurs: String,
    pub module_lineaire: String,
    pub terminaux: String,
    pub traitement: String,
    pub informations_supp: String,
    pub cde_passee_affaire: bool,
    pub cde_passee_achat_stock: bool,
    pub observations: String,
    pub contre_plaque: bool,
    pub caisse_stock_id: Option<i64>,
    /// Trigramme de qui a coché « OK pour être commandée » (vide sinon).
    #[serde(default)]
    pub ok_cde_par: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DemandeCaisse {
    pub id: i64,
    pub demande_id: i64,
    pub nom: String,
    pub type_envoi_caisse: String,
    pub type_ouverture: String,
    pub stock: String,
    pub date_picking: String,
    pub date_demandee_s2c: String,
    pub traitement: String,
    pub quantite: i64,
    pub moteurs: String,
    pub module_lineaire: String,
    pub terminaux: String,
    pub informations_supp: String,
    pub observations: String,
    pub cde_passee_affaire: bool,
    pub cde_passee_achat_stock: bool,
    pub longueur_mm: f64,
    pub largeur_mm: f64,
    pub hauteur_mm: f64,
    pub poids_kg: f64,
    pub contre_plaque: bool,
    pub ordre: i64,
    pub caisse_stock_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct NewDemandeCaisse {
    pub demande_id: i64,
    pub nom: String,
    pub type_envoi_caisse: String,
    pub type_ouverture: String,
    pub stock: String,
    pub date_picking: String,
    pub date_demandee_s2c: String,
    pub traitement: String,
    pub quantite: i64,
    pub moteurs: String,
    pub module_lineaire: String,
    pub terminaux: String,
    pub informations_supp: String,
    pub observations: String,
    pub cde_passee_affaire: bool,
    pub cde_passee_achat_stock: bool,
    pub longueur_mm: f64,
    pub largeur_mm: f64,
    pub hauteur_mm: f64,
    pub poids_kg: f64,
    pub contre_plaque: bool,
    pub caisse_stock_id: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CaisseStock {
    pub id: i64,
    pub nom: String,
    pub longueur_mm: f64,
    pub largeur_mm: f64,
    pub hauteur_mm: f64,
    pub quantite: i64,
    pub observations: String,
    pub affaire_id: Option<i64>,
    pub ordre: i64,
    pub validee: bool,
    pub demandeur: Option<String>,
    pub demande_le: Option<String>,
    pub demande_statut: String,
    pub demande_affaire_cible_id: Option<i64>,
    pub demande_cible_id: Option<i64>,
    pub type_ouverture: String,
    /// 0031 — caisse AR_CAISS_ suivie (décompte à la livraison + alerte de réappro).
    pub gere: bool,
    /// 0031 — alerte « à commander » quand `quantite <= seuil_alerte` (caisse gérée).
    pub seuil_alerte: i64,
    /// 0033 — « Bois » / « Contreplaqué » ; vide pour une caisse créée avant.
    pub matiere: String,
    /// 0035 — dimensions extérieures (mm), 0 = non renseignée.
    pub ext_longueur_mm: f64,
    pub ext_largeur_mm: f64,
    pub ext_hauteur_mm: f64,
}

/// Mouvement de stock d'une caisse AR_CAISS_ gérée, renvoyé à l'UI après un décompte à la
/// livraison ou pour proposer une remise en stock à la dévalidation.
#[derive(Debug, Serialize)]
pub struct MouvementStock {
    pub caisse_stock_id: i64,
    pub nom: String,
    pub quantite: i64,
}

#[derive(Debug, Deserialize)]
pub struct NewCaisseStock {
    pub nom: String,
    pub longueur_mm: f64,
    pub largeur_mm: f64,
    pub hauteur_mm: f64,
    pub quantite: i64,
    pub observations: String,
    pub affaire_id: Option<i64>,
    pub type_ouverture: String,
    pub matiere: String,
    pub ext_longueur_mm: f64,
    pub ext_largeur_mm: f64,
    pub ext_hauteur_mm: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SectionLock {
    pub section_key: String,
    pub titulaire: String,
    pub acquis_le: String,
    pub dernier_battement: String,
    pub demandeur: Option<String>,
    pub demande_le: Option<String>,
    pub demande_statut: String,
    pub expire: bool,
    pub demande_expiree: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OptionListe {
    pub id: i64,
    pub liste: String,
    pub valeur: String,
    pub ordre: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JournalEntree {
    pub id: i64,
    pub horodatage: String,
    pub trigramme: String,
    pub action: String,
    pub entite: String,
    pub entite_id: Option<i64>,
    pub details: String,
}
