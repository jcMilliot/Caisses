ALTER TABLE caisse ADD COLUMN type_envoi_caisse TEXT NOT NULL DEFAULT '';
ALTER TABLE caisse ADD COLUMN demande_caisse_id INTEGER REFERENCES demande_caisse(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_caisse_demande_caisse ON caisse(demande_caisse_id);
