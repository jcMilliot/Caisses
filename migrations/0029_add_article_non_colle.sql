-- Lignes écartées au collage Excel d'articles (Simulations) : AR qui ne commence ni par « AR » ni
-- par « ZR », non retenues par l'utilisateur (décision 2026-09-30). Gardées avec l'affaire et
-- affichées sous le tableau ; seuls les administrateurs peuvent les modifier, les ajouter au
-- tableau d'articles ou les supprimer.
CREATE TABLE IF NOT EXISTS article_non_colle (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    affaire_id         INTEGER NOT NULL REFERENCES affaire(id) ON DELETE CASCADE,
    ar                 TEXT NOT NULL DEFAULT '',
    reference          TEXT NOT NULL DEFAULT '',
    designation        TEXT NOT NULL DEFAULT '',
    dim1_mm            REAL NOT NULL DEFAULT 0,
    dim2_mm            REAL NOT NULL DEFAULT 0,
    dim3_mm            REAL NOT NULL DEFAULT 0,
    poids_unitaire_kg  REAL NOT NULL DEFAULT 0,
    quantite           INTEGER NOT NULL DEFAULT 1,
    ligne_brute        TEXT NOT NULL DEFAULT '',   -- ligne telle que collée (tabulations)
    cree_le            TEXT NOT NULL DEFAULT (datetime('now')),
    cree_par           TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_article_non_colle_affaire ON article_non_colle(affaire_id);
