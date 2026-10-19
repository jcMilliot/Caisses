-- Carton libre (« éphémère », ex. carton de récup) pour un colis de l'onglet Colisage (2026-10-15) :
-- pas géré dans Conso en stock, dimensions extérieures saisies dans l'affaire (intérieur = extérieur
-- − 2 mm par axe, calculé côté frontend) et poids facultatif. `carton_conso_id` devient facultatif :
-- une ligne a soit un carton conso, soit des dimensions libres. Table reconstruite (SQLite ne sait
-- pas retirer un NOT NULL) ; aucune autre table ne la référence.
CREATE TABLE colis_affaire_nouv (
    affaire_id         INTEGER NOT NULL REFERENCES affaire(id) ON DELETE CASCADE,
    tag                TEXT NOT NULL,
    carton_conso_id    INTEGER REFERENCES carton_conso(id) ON DELETE CASCADE,
    libre_longueur_mm  REAL NOT NULL DEFAULT 0,
    libre_largeur_mm   REAL NOT NULL DEFAULT 0,
    libre_hauteur_mm   REAL NOT NULL DEFAULT 0,
    libre_poids_kg     REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (affaire_id, tag),
    CHECK (carton_conso_id IS NOT NULL OR (libre_longueur_mm > 0 AND libre_largeur_mm > 0 AND libre_hauteur_mm > 0))
);

INSERT INTO colis_affaire_nouv (affaire_id, tag, carton_conso_id)
    SELECT affaire_id, tag, carton_conso_id FROM colis_affaire;

DROP TABLE colis_affaire;
ALTER TABLE colis_affaire_nouv RENAME TO colis_affaire;
