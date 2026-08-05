ALTER TABLE caisse_stock ADD COLUMN validee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE caisse_stock ADD COLUMN demandeur TEXT;
ALTER TABLE caisse_stock ADD COLUMN demande_le TEXT;
ALTER TABLE caisse_stock ADD COLUMN demande_statut TEXT NOT NULL DEFAULT 'aucune';
ALTER TABLE caisse_stock ADD COLUMN demande_affaire_cible_id INTEGER REFERENCES affaire(id) ON DELETE SET NULL;
