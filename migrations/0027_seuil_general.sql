-- Seuil d'alerte réglé uniquement depuis l'Admin (décision 2026-09-30) : plus de seuil propre
-- à une caisse — toutes héritent du seuil de leur affaire. Le seuil général (paramètre
-- `seuil_alerte_general`, 70 % tant qu'il n'a pas été réglé) s'applique aux nouvelles affaires,
-- et aux affaires non livrées quand un admin le change.
UPDATE caisse SET seuil_pct = NULL;
