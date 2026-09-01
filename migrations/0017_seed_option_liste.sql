-- Bascule des valeurs "de base" (jusqu'ici codées en dur dans src/domain/demandeOptions.ts)
-- vers la table option_liste, pour qu'elles deviennent modifiables / supprimables via l'outil
-- « Gérer les références ». INSERT OR IGNORE : ne recrée pas une valeur déjà ajoutée à la main.
-- `module_lineaire` n'a pas de valeur de base (liste vide, à remplir par l'utilisateur).

INSERT OR IGNORE INTO option_liste (liste, valeur, ordre) VALUES
    ('moteurs', '1 MOTEUR',   0),
    ('moteurs', '2 MOTEURS',  1),
    ('moteurs', '3 MOTEURS',  2),
    ('moteurs', '4 MOTEURS',  3),
    ('moteurs', '5 MOTEURS',  4),
    ('moteurs', '6 MOTEURS',  5),
    ('moteurs', '7 MOTEURS',  6),
    ('moteurs', '8 MOTEURS',  7),
    ('moteurs', '9 MOTEURS',  8),
    ('moteurs', '10 MOTEURS', 9);

INSERT OR IGNORE INTO option_liste (liste, valeur, ordre) VALUES
    ('terminaux', '1 TERMINAL',    0),
    ('terminaux', '2 TERMINAUX',   1),
    ('terminaux', '3 TERMINAUX',   2),
    ('terminaux', '4 TERMINAUX',   3),
    ('terminaux', '5 TERMINAUX',   4),
    ('terminaux', '6 TERMINAUX',   5),
    ('terminaux', '7 TERMINAUX',   6),
    ('terminaux', '8 TERMINAUX',   7),
    ('terminaux', '9 TERMINAUX',   8),
    ('terminaux', '10 TERMINAUX',  9);
