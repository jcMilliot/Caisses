ALTER TABLE demande ADD COLUMN caisse_stock_id INTEGER REFERENCES caisse_stock(id) ON DELETE SET NULL;
ALTER TABLE demande_caisse ADD COLUMN caisse_stock_id INTEGER REFERENCES caisse_stock(id) ON DELETE SET NULL;
ALTER TABLE caisse ADD COLUMN caisse_stock_id INTEGER REFERENCES caisse_stock(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_demande_caisse_stock ON demande(caisse_stock_id);
CREATE INDEX IF NOT EXISTS idx_demande_caisse_caisse_stock ON demande_caisse(caisse_stock_id);
CREATE INDEX IF NOT EXISTS idx_caisse_caisse_stock ON caisse(caisse_stock_id);
