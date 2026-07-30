CREATE TABLE IF NOT EXISTS section_lock (
    section_key       TEXT PRIMARY KEY,
    titulaire         TEXT NOT NULL,
    acquis_le         TEXT NOT NULL DEFAULT (datetime('now')),
    dernier_battement TEXT NOT NULL DEFAULT (datetime('now')),
    demandeur         TEXT,
    demande_le        TEXT,
    demande_statut    TEXT NOT NULL DEFAULT 'aucune'
);
