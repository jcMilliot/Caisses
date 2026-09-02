-- Lien explicite entre la caisse "mère" d'une simulation et la ligne de demande dont elle est
-- issue (jusqu'ici le lien mère se faisait par nom = nom de l'affaire, cassé dès qu'on renomme
-- la caisse dans Simulations pour la rendre plus explicite).
-- Les sous-caisses ont déjà `caisse.demande_caisse_id` ; ceci est l'équivalent pour la mère.
ALTER TABLE caisse ADD COLUMN demande_id INTEGER REFERENCES demande(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_caisse_demande ON caisse(demande_id);
