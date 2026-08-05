CREATE TABLE IF NOT EXISTS demande_caisse (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    demande_id              INTEGER NOT NULL REFERENCES demande(id) ON DELETE CASCADE,
    nom                     TEXT NOT NULL DEFAULT '',
    type_envoi_caisse       TEXT NOT NULL DEFAULT '',
    date_picking            TEXT NOT NULL DEFAULT '',
    date_demandee_s2c       TEXT NOT NULL DEFAULT '',
    cde_passee_affaire      INTEGER NOT NULL DEFAULT 0,
    cde_passee_achat_stock  INTEGER NOT NULL DEFAULT 0,
    longueur_mm             REAL NOT NULL DEFAULT 0,
    largeur_mm              REAL NOT NULL DEFAULT 0,
    hauteur_mm              REAL NOT NULL DEFAULT 0,
    poids_kg                REAL NOT NULL DEFAULT 0,
    ordre                   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_demande_caisse_demande ON demande_caisse(demande_id);
