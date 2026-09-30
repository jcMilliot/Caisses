-- Trigramme de la personne qui a coché « OK pour être commandée » (décision 2026-09-30),
-- affiché sur l'affiche de Demandes d'achats à la place du menu « Demandeur ». Vidé quand la
-- case est décochée. Vide pour les lignes cochées avant cette version.
ALTER TABLE demande ADD COLUMN ok_cde_par TEXT NOT NULL DEFAULT '';
