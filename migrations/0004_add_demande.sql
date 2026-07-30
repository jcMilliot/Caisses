CREATE TABLE IF NOT EXISTS demande (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    ok_pour_passer_cde      INTEGER NOT NULL DEFAULT 0,
    affaire                 TEXT NOT NULL DEFAULT '',
    type_envoi_caisse       TEXT NOT NULL DEFAULT '',
    type_ouverture          TEXT NOT NULL DEFAULT '',
    stock                   TEXT NOT NULL DEFAULT '',
    longueur_mm             REAL NOT NULL DEFAULT 0,
    largeur_mm              REAL NOT NULL DEFAULT 0,
    hauteur_mm              REAL NOT NULL DEFAULT 0,
    quantite                INTEGER NOT NULL DEFAULT 1,
    date_picking            TEXT NOT NULL DEFAULT '',
    date_demandee_s2c       TEXT NOT NULL DEFAULT '',
    moteurs                 TEXT NOT NULL DEFAULT '',
    module_lineaire         TEXT NOT NULL DEFAULT '',
    terminaux               TEXT NOT NULL DEFAULT '',
    traitement              TEXT NOT NULL DEFAULT '',
    informations_supp       TEXT NOT NULL DEFAULT '',
    cde_passee_affaire      INTEGER NOT NULL DEFAULT 0,
    cde_passee_achat_stock  INTEGER NOT NULL DEFAULT 0,
    observations            TEXT NOT NULL DEFAULT '',
    ordre                   INTEGER NOT NULL DEFAULT 0,
    date_creation           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_demande_ordre ON demande(ordre);
