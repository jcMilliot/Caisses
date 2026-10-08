-- Estimation du poids des caisses (2026-10-08) : l'alerte de charge de Simulations compte
-- désormais le poids de la caisse elle-même (400 kg/m² caisse comprise).

-- Renforts et tasseaux des caisses de Simulations : valeurs par défaut réglées dans l'Admin
-- (`parametre.estimation_poids_caisse`), pas de colonne par caisse.

-- Tare (poids à vide, kg) d'une caisse en stock, facultative : 0 = non renseignée.
ALTER TABLE caisse_stock ADD COLUMN tare_kg REAL NOT NULL DEFAULT 0;

-- Caisses réellement pesées (Admin › Caisses › Poids) : servent à caler les masses volumiques
-- de l'estimation. Dimensions intérieures en mm, tare = poids à vide (sans mousse ni bâche).
CREATE TABLE caisse_pesee (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    affaire TEXT NOT NULL DEFAULT '',
    longueur_mm REAL NOT NULL DEFAULT 0,
    largeur_mm REAL NOT NULL DEFAULT 0,
    hauteur_mm REAL NOT NULL DEFAULT 0,
    tare_kg REAL NOT NULL DEFAULT 0,
    nb_pieds INTEGER NOT NULL DEFAULT 2,
    matiere TEXT NOT NULL DEFAULT 'Contreplaqué',
    mousse_bache INTEGER NOT NULL DEFAULT 0,
    nb_renforts_longueur INTEGER NOT NULL DEFAULT 0,
    nb_renforts_largeur INTEGER NOT NULL DEFAULT 0,
    nb_tasseaux INTEGER NOT NULL DEFAULT 0,
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
