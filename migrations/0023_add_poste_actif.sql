-- Postes qui ont l'app ouverte (restauration d'une sauvegarde, cf. journal 2026-09-28).
-- Chaque poste signale sa présence toutes les 30 s avec un identifiant tiré au hasard au
-- lancement de l'app (pas le trigramme : deux postes peuvent utiliser le même). La restauration
-- est refusée tant qu'un autre poste a battu dans les 2 dernières minutes.
CREATE TABLE IF NOT EXISTS poste_actif (
    poste_id           TEXT PRIMARY KEY,
    trigramme          TEXT NOT NULL,
    dernier_battement  TEXT NOT NULL DEFAULT (datetime('now'))
);
