-- Type d'envoi « STANDARD (4C) » renommé « MER (4C) » partout dans l'outil (demande de
-- l'utilisateur du 2026-10-05). La détection du 4C (`estCaisse4C`, /4C/i) ne dépend pas du libellé.
UPDATE demande SET type_envoi_caisse = 'MER (4C)' WHERE upper(trim(type_envoi_caisse)) = 'STANDARD (4C)';
UPDATE demande_caisse SET type_envoi_caisse = 'MER (4C)' WHERE upper(trim(type_envoi_caisse)) = 'STANDARD (4C)';
UPDATE caisse SET type_envoi_caisse = 'MER (4C)' WHERE upper(trim(type_envoi_caisse)) = 'STANDARD (4C)';
