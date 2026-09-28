-- Comptes, utilisateurs et paramètres partagés (page Admin, cf. journal 2026-09-28).

-- Comptes protégés par mot de passe. Pour l'instant un seul : AJC (administrateur). Un trigramme
-- qui a une ligne ici exige son mot de passe quand on le choisit sur un poste. Hachage Argon2
-- (format PHC, sel inclus dans la chaîne) — jamais de mot de passe en clair.
CREATE TABLE IF NOT EXISTS compte (
    trigramme          TEXT PRIMARY KEY,
    mot_de_passe_hash  TEXT NOT NULL,
    role               TEXT NOT NULL DEFAULT 'admin',   -- base pour de futurs droits par tâche
    cree_le            TEXT NOT NULL DEFAULT (datetime('now')),
    modifie_le         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Trigrammes saisis sur les postes (déclaratifs). Alimenté à chaque démarrage de l'app.
CREATE TABLE IF NOT EXISTS utilisateur (
    trigramme           TEXT PRIMARY KEY,
    premiere_connexion  TEXT NOT NULL DEFAULT (datetime('now')),
    derniere_connexion  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Reprise des trigrammes déjà vus avant cette migration (journal d'audit, verrous).
INSERT OR IGNORE INTO utilisateur (trigramme, premiere_connexion, derniere_connexion)
    SELECT trigramme, MIN(horodatage), MAX(horodatage) FROM journal GROUP BY trigramme;
INSERT OR IGNORE INTO utilisateur (trigramme, premiere_connexion, derniere_connexion)
    SELECT titulaire, MIN(acquis_le), MAX(dernier_battement) FROM section_lock GROUP BY titulaire;

-- Paramètres clé/valeur partagés entre postes (sauvegarde automatique pour commencer).
CREATE TABLE IF NOT EXISTS parametre (
    cle     TEXT PRIMARY KEY,
    valeur  TEXT NOT NULL
);
