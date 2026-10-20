-- Page « Alertes » (2026-10-19) : date d'expédition anticipée et commentaire d'une ligne mère de
-- Gestion des caisses. Table à part (et non colonnes de `demande`) : « Enregistrer » dans Gestion
-- des caisses réécrit toute la ligne `demande` depuis son brouillon et effacerait une date saisie
-- entre-temps dans Alertes. Pas de ligne = ni date anticipée ni commentaire.
CREATE TABLE demande_alerte (
    demande_id     INTEGER PRIMARY KEY REFERENCES demande(id) ON DELETE CASCADE,
    date_anticipee TEXT NOT NULL DEFAULT '',  -- AAAA-MM-JJ, '' = aucune
    commentaire    TEXT NOT NULL DEFAULT ''
);
