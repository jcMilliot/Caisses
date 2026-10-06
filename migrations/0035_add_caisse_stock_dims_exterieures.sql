-- Dimensions extérieures d'une caisse en stock (mm), saisies dans « Gérer les caisses » et
-- affichées dans Admin › Caisses (demande du 2026-10-05). Facultatives : 0 = non renseignée.
ALTER TABLE caisse_stock ADD COLUMN ext_longueur_mm REAL NOT NULL DEFAULT 0;
ALTER TABLE caisse_stock ADD COLUMN ext_largeur_mm REAL NOT NULL DEFAULT 0;
ALTER TABLE caisse_stock ADD COLUMN ext_hauteur_mm REAL NOT NULL DEFAULT 0;
