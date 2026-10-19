-- Colis d'un article importé de l'intranet (2026-10-14) : `pack_tag` de la ligne du picking quand
-- elle est colisée (`pack_ctrl` = 1), sinon vide. Une lettre = une caisse, un chiffre = un colis.
-- Affiché dans la colonne « Colis » du tableau d'articles de Simulations ; vide pour un article
-- collé depuis Excel. Rempli au prochain « Vérifier mise à jour » pour une affaire déjà importée.
ALTER TABLE article ADD COLUMN colis TEXT NOT NULL DEFAULT '';
