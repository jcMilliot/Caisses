CREATE TABLE IF NOT EXISTS caisse_stock (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nom             TEXT NOT NULL,
    longueur_mm     REAL NOT NULL DEFAULT 0,
    largeur_mm      REAL NOT NULL DEFAULT 0,
    hauteur_mm      REAL NOT NULL DEFAULT 0,
    quantite        INTEGER NOT NULL DEFAULT 1,
    observations    TEXT NOT NULL DEFAULT '',
    affaire_id      INTEGER REFERENCES affaire(id) ON DELETE SET NULL,
    ordre           INTEGER NOT NULL DEFAULT 0,
    date_creation   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_caisse_stock_affaire ON caisse_stock(affaire_id);
