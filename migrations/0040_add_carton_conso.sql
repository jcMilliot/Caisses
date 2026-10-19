-- Cartons consommables en stock (onglet « Cartons conso » de Conso en stock, 2026-10-14).
-- Aucune affectation à une affaire : liste de référence pour la future simulation avec colis.
-- Nom au format « AR_RAJA__XXXXX », unique (sans tenir compte de la casse). Dimensions
-- intérieures et extérieures obligatoires (vérifiées côté Rust) ; poids facultatif (0 = non saisi).
CREATE TABLE carton_conso (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nom             TEXT NOT NULL UNIQUE COLLATE NOCASE,
    longueur_mm     REAL NOT NULL DEFAULT 0,
    largeur_mm      REAL NOT NULL DEFAULT 0,
    hauteur_mm      REAL NOT NULL DEFAULT 0,
    ext_longueur_mm REAL NOT NULL DEFAULT 0,
    ext_largeur_mm  REAL NOT NULL DEFAULT 0,
    ext_hauteur_mm  REAL NOT NULL DEFAULT 0,
    poids_kg        REAL NOT NULL DEFAULT 0,
    ordre           INTEGER NOT NULL DEFAULT 0,
    date_creation   TEXT NOT NULL DEFAULT (datetime('now'))
);
