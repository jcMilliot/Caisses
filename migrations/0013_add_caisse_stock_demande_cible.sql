ALTER TABLE caisse_stock ADD COLUMN demande_cible_id INTEGER REFERENCES demande(id) ON DELETE SET NULL;
