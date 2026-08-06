export interface Affaire {
  id: number;
  nom: string;
  date_creation: string;
  seuil_defaut: number;
}

export interface Caisse {
  id: number;
  affaire_id: number;
  nom: string;
  longueur_mm: number;
  largeur_mm: number;
  hauteur_mm: number;
  seuil_pct: number | null;
  couleur: string;
  ordre: number;
  caisse_stock_id: number | null;
  type_envoi_caisse: string;
  demande_caisse_id: number | null;
}

export interface Article {
  id: number;
  affaire_id: number;
  caisse_id: number | null;
  ar: string;
  reference: string;
  designation: string;
  dim1_mm: number;
  dim2_mm: number;
  dim3_mm: number;
  poids_unitaire_kg: number;
  quantite: number;
  ordre: number;
}

export interface NewArticle {
  ar: string;
  reference: string;
  designation: string;
  dim1_mm: number;
  dim2_mm: number;
  dim3_mm: number;
  poids_unitaire_kg: number;
  quantite: number;
}

export interface Demande {
  id: number;
  ok_pour_passer_cde: boolean;
  affaire: string;
  type_envoi_caisse: string;
  type_ouverture: string;
  stock: string;
  longueur_mm: number;
  largeur_mm: number;
  hauteur_mm: number;
  quantite: number;
  date_picking: string;
  date_demandee_s2c: string;
  moteurs: string;
  module_lineaire: string;
  terminaux: string;
  traitement: string;
  informations_supp: string;
  cde_passee_affaire: boolean;
  cde_passee_achat_stock: boolean;
  observations: string;
  contre_plaque: boolean;
  validee: boolean;
  ordre: number;
  caisse_stock_id: number | null;
}

export interface NewDemande {
  ok_pour_passer_cde: boolean;
  affaire: string;
  type_envoi_caisse: string;
  type_ouverture: string;
  stock: string;
  longueur_mm: number;
  largeur_mm: number;
  hauteur_mm: number;
  quantite: number;
  date_picking: string;
  date_demandee_s2c: string;
  moteurs: string;
  module_lineaire: string;
  terminaux: string;
  traitement: string;
  informations_supp: string;
  cde_passee_affaire: boolean;
  cde_passee_achat_stock: boolean;
  observations: string;
  contre_plaque: boolean;
  caisse_stock_id: number | null;
}

export interface DemandeCaisse {
  id: number;
  demande_id: number;
  nom: string;
  type_envoi_caisse: string;
  type_ouverture: string;
  stock: string;
  date_picking: string;
  date_demandee_s2c: string;
  traitement: string;
  quantite: number;
  moteurs: string;
  module_lineaire: string;
  informations_supp: string;
  observations: string;
  cde_passee_affaire: boolean;
  cde_passee_achat_stock: boolean;
  longueur_mm: number;
  largeur_mm: number;
  hauteur_mm: number;
  poids_kg: number;
  contre_plaque: boolean;
  ordre: number;
  caisse_stock_id: number | null;
}

export interface NewDemandeCaisse {
  demande_id: number;
  nom: string;
  type_envoi_caisse: string;
  type_ouverture: string;
  stock: string;
  date_picking: string;
  date_demandee_s2c: string;
  traitement: string;
  quantite: number;
  moteurs: string;
  module_lineaire: string;
  informations_supp: string;
  observations: string;
  cde_passee_affaire: boolean;
  cde_passee_achat_stock: boolean;
  longueur_mm: number;
  largeur_mm: number;
  hauteur_mm: number;
  poids_kg: number;
  contre_plaque: boolean;
  caisse_stock_id: number | null;
}

export interface CaisseStock {
  id: number;
  nom: string;
  longueur_mm: number;
  largeur_mm: number;
  hauteur_mm: number;
  quantite: number;
  observations: string;
  affaire_id: number | null;
  ordre: number;
  validee: boolean;
  demandeur: string | null;
  demande_le: string | null;
  demande_statut: "aucune" | "en_attente" | "refusee";
  demande_affaire_cible_id: number | null;
  demande_cible_id: number | null;
}

export interface NewCaisseStock {
  nom: string;
  longueur_mm: number;
  largeur_mm: number;
  hauteur_mm: number;
  quantite: number;
  observations: string;
  affaire_id: number | null;
}

export interface SectionLock {
  section_key: string;
  titulaire: string;
  acquis_le: string;
  dernier_battement: string;
  demandeur: string | null;
  demande_le: string | null;
  demande_statut: "aucune" | "en_attente" | "refusee";
  expire: boolean;
}

export interface CaisseCalculee extends Caisse {
  seuilEffectif: number;
  volumeInterneM3: number;
  volumeOccupeM3: number;
  volumeDisponibleM3: number;
  poidsTotalKg: number;
  tauxRemplissage: number; // 0..∞, peut dépasser 1 (surcharge)
  estSurcharge: boolean;
  niveauAlerte: "ok" | "attention" | "alerte";
}
