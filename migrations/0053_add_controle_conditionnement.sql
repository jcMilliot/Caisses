-- Contrôle dimensionnel › Petits volumes (2026-11-23) : conditionnement d'un AR sous le seuil des
-- contrôles annuels, choisi une fois (pas de rappel) :
--   ''            = pas encore traité ;
--   'carton'      = pièce livrée en carton / boîte : les dimensions de l'ERP sont justes ;
--   'sachet'      = pièce en sachet : les dimensions de la pièce hors sachet (hs_*) remplacent
--                   celles de l'ERP dans les calculs de Simulations, volume majoré de la marge
--                   sachet (parametre `marge_sachet_pct`, défaut 10) ;
--   'gros_volume' = sans emballage (libellé de l'app) : les dimensions de l'ERP sont justes.
ALTER TABLE controle_dimension ADD COLUMN conditionnement TEXT NOT NULL DEFAULT '';
ALTER TABLE controle_dimension ADD COLUMN hs_dim1_mm REAL;
ALTER TABLE controle_dimension ADD COLUMN hs_dim2_mm REAL;
ALTER TABLE controle_dimension ADD COLUMN hs_dim3_mm REAL;
ALTER TABLE controle_dimension ADD COLUMN conditionnement_le TEXT;
ALTER TABLE controle_dimension ADD COLUMN conditionnement_par TEXT NOT NULL DEFAULT '';
