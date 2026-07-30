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
    pub validee: bool,
    pub ordre: i64,
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
}
