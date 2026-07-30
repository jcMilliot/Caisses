CREATE TABLE IF NOT EXISTS affaire (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nom             TEXT NOT NULL,
    date_creation   TEXT NOT NULL DEFAULT (datetime('now')),
    seuil_defaut    REAL NOT NULL DEFAULT 90.0
);

CREATE TABLE IF NOT EXISTS caisse (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    affaire_id      INTEGER NOT NULL REFERENCES affaire(id) ON DELETE CASCADE,
    nom             TEXT NOT NULL,
    longueur_mm     REAL NOT NULL,
    largeur_mm      REAL NOT NULL,
    hauteur_mm      REAL NOT NULL,
    seuil_pct       REAL,
    ordre           INTEGER NOT NULL DEFAULT 0,
    date_creation   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS article (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    affaire_id          INTEGER NOT NULL REFERENCES affaire(id) ON DELETE CASCADE,
    caisse_id           INTEGER REFERENCES caisse(id) ON DELETE SET NULL,
    reference           TEXT NOT NULL,
    designation         TEXT NOT NULL DEFAULT '',
    dim1_mm             REAL NOT NULL DEFAULT 0,
    dim2_mm             REAL NOT NULL DEFAULT 0,
    dim3_mm             REAL NOT NULL DEFAULT 0,
    poids_unitaire_kg   REAL NOT NULL DEFAULT 0,
    quantite            INTEGER NOT NULL DEFAULT 1,
    ordre               INTEGER NOT NULL DEFAULT 0,
    date_creation       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_caisse_affaire ON caisse(affaire_id);
CREATE INDEX IF NOT EXISTS idx_article_affaire ON article(affaire_id);
CREATE INDEX IF NOT EXISTS idx_article_caisse ON article(caisse_id);
