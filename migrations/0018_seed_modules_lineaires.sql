-- Modules linéaires FESTO — libellés fournis par l'utilisateur le 2026-09-01 (dimensions en
-- mètres entre parenthèses, purement informatives — la colonne module_lineaire est du texte).
-- Casse / espacement normalisés ; parenthèse en trop du 496 corrigée.
-- La colonne `ordre` n'est ici qu'indicative : l'affichage des listes est trié côté frontend
-- (demandeOptions.ts::comparerOption — quantité puis n° de référence).
-- Migration séparée de 0017 (déjà appliquée sur les bases de dev sans ces valeurs) — cf. règle
-- du projet : jamais modifier une migration publiée, en créer une nouvelle.
INSERT OR IGNORE INTO option_liste (liste, valeur, ordre) VALUES
    ('module_lineaire', '1 FESTO 426 (2,18 x 0,08 x 0,08)',  0),
    ('module_lineaire', '1 FESTO 485 (2,15 x 0,07 x 0,07)',  1),
    ('module_lineaire', '1 FESTO 493 (2,26 x 0,07 x 0,07)',  2),
    ('module_lineaire', '1 FESTO 494 (2,18 x 0,07 x 0,07)',  3),
    ('module_lineaire', '1 FESTO 495 (3,02 x 0,07 x 0,07)',  4),
    ('module_lineaire', '1 FESTO 496 (3,02 x 0,07 x 0,07)',  5),
    ('module_lineaire', '1 FESTO 578 (2,15 x 0,07 x 0,07)',  6),
    ('module_lineaire', '1 FESTO 584 (2,09 x 0,07 x 0,07)',  7),
    ('module_lineaire', '1 FESTO 587 (2,92 x 0,70 x 0,70)',  8),
    ('module_lineaire', '1 FESTO 811 (2,52 x 0,07 x 0,07)',  9),
    ('module_lineaire', '1 FESTO 844 (2,55 x 0,07 x 0,07)',  10),
    ('module_lineaire', '2 FESTO 494 (2,18 x 0,07 x 0,07)',  11),
    ('module_lineaire', '2 FESTO 576 (0,7 x 0,08 x 0,08)',   12),
    ('module_lineaire', '2 FESTO 578 (2,15 x 0,07 x 0,07)',  13),
    ('module_lineaire', '2 FESTO 584 (2,09 x 0,07 x 0,07)',  14),
    ('module_lineaire', '2 FESTO 811 (2,52 x 0,07 x 0,07)',  15),
    ('module_lineaire', '3 FESTO 494 (2,18 x 0,07 x 0,07)',  16),
    ('module_lineaire', '3 FESTO 587 (2,92 x 0,70 x 0,70)',  17);
