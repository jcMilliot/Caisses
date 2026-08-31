-- Valeurs personnalisées ajoutées par l'utilisateur aux listes déroulantes de la section
-- Demandes (colonnes Moteurs / Module linéaire / Terminaux). Les valeurs "de base" restent
-- codées en dur côté frontend (domain/demandeOptions.ts) ; cette table ne contient que les
-- ajouts. `liste` identifie la colonne cible.
CREATE TABLE IF NOT EXISTS option_liste (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    liste   TEXT NOT NULL,   -- 'moteurs' | 'module_lineaire' | 'terminaux'
    valeur  TEXT NOT NULL,
    ordre   INTEGER NOT NULL DEFAULT 0,
    UNIQUE (liste, valeur)
);
