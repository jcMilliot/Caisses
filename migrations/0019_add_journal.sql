-- Journal d'audit des actions importantes (multi-poste, cf. discussion 2026-09-02).
-- Identité = trigramme déclaratif du poste (pas d'authentification) — suffisant pour un usage
-- interne à quelques personnes : « voir qui a fait quoi et quand », pas une preuve infalsifiable.
-- Périmètre volontairement restreint aux actions à effet fort :
--   - création de caisse / sous-caisse (demande, demande_caisse)
--   - suppression (demande, demande_caisse)
--   - modification des dimensions d'une caisse depuis la section Demandes
--   - ajout / modification / suppression d'une référence (option_liste)
-- Écriture seule côté commandes ; lecture réservée au trigramme "AJC" côté UI.
CREATE TABLE IF NOT EXISTS journal (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    horodatage  TEXT NOT NULL DEFAULT (datetime('now')),
    trigramme   TEXT NOT NULL,
    action      TEXT NOT NULL,   -- 'creation' | 'suppression' | 'modification_dimensions' | 'reference_ajout' | 'reference_modification' | 'reference_suppression'
    entite      TEXT NOT NULL,   -- 'demande' | 'demande_caisse' | 'option_liste'
    entite_id   INTEGER,         -- id de la ligne concernée (NULL si non pertinent)
    details     TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_journal_horodatage ON journal(horodatage);

-- Purge automatique : on ne conserve que 2 mois d'historique. Le trigger s'exécute à chaque
-- insertion et supprime les entrées trop anciennes (volume négligeable, coût nul en pratique).
CREATE TRIGGER IF NOT EXISTS trg_journal_purge AFTER INSERT ON journal
BEGIN
    DELETE FROM journal WHERE horodatage < datetime('now', '-2 months');
END;
