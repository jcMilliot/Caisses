-- Caisses de l'onglet Colisage de Simulations (2026-10-14) : copies indépendantes des caisses de
-- l'affaire (Informations générales), dans lesquelles on range les colis et les lettres pour
-- comparer au rangement des Informations générales. `source_caisse_id` = caisse copiée (sert à la
-- comparaison), NULL pour une caisse ajoutée à la main ou si l'originale a été supprimée.
CREATE TABLE caisse_colisage (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    affaire_id       INTEGER NOT NULL REFERENCES affaire(id) ON DELETE CASCADE,
    nom              TEXT NOT NULL DEFAULT '',
    longueur_mm      REAL NOT NULL DEFAULT 0,
    largeur_mm       REAL NOT NULL DEFAULT 0,
    hauteur_mm       REAL NOT NULL DEFAULT 0,
    couleur          TEXT NOT NULL DEFAULT '#dbeafe',
    source_caisse_id INTEGER REFERENCES caisse(id) ON DELETE SET NULL,
    ordre            INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_caisse_colisage_affaire ON caisse_colisage(affaire_id);

-- Rangement choisi à la main d'un colis ou d'une lettre (`tag` = pack_tag). Pas de ligne = rangement
-- proposé (lettre A → 1re caisse colisage, B → 2e… ; colis : non rangé). Ligne avec
-- caisse_colisage_id NULL = « non rangé » choisi explicitement. Caisse supprimée → retour au
-- rangement proposé.
CREATE TABLE colis_rangement (
    affaire_id         INTEGER NOT NULL REFERENCES affaire(id) ON DELETE CASCADE,
    tag                TEXT NOT NULL,
    caisse_colisage_id INTEGER REFERENCES caisse_colisage(id) ON DELETE CASCADE,
    PRIMARY KEY (affaire_id, tag)
);
