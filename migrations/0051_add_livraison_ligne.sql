-- Envoi en partiel (décision 2026-10-29) : date de livraison de chaque ligne de Gestion des
-- caisses (mère ou sous-caisse), pour regrouper les caisses par livraison (onglets « 1er envoi »,
-- « 2ème envoi »… de Colisage en cours). Écrite quand une ligne passe « Livré », effacée quand elle
-- repasse « Non livré ». Table à part, comme `demande_alerte` : l'enregistrement de Gestion des
-- caisses réécrit toute la ligne depuis son brouillon. Pas de ligne = date inconnue (lignes livrées
-- avant cette version).
CREATE TABLE livraison_ligne (
    table_ligne TEXT NOT NULL CHECK (table_ligne IN ('demande', 'demande_caisse')),
    ligne_id INTEGER NOT NULL,
    livree_le TEXT NOT NULL,
    PRIMARY KEY (table_ligne, ligne_id)
);

CREATE TRIGGER trg_livraison_demande_supprimee AFTER DELETE ON demande
BEGIN
    DELETE FROM livraison_ligne WHERE table_ligne = 'demande' AND ligne_id = OLD.id;
END;

CREATE TRIGGER trg_livraison_demande_caisse_supprimee AFTER DELETE ON demande_caisse
BEGIN
    DELETE FROM livraison_ligne WHERE table_ligne = 'demande_caisse' AND ligne_id = OLD.id;
END;
