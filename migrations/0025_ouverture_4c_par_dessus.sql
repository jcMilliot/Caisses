-- 4C : type d'ouverture imposé « Par dessus », sans menu déroulant (décision 2026-09-28).
-- Aligne les lignes existantes (vides ou saisies avant la règle), sinon le champ verrouillé
-- resterait vide et bloquerait « OK pour être commandée ».
UPDATE demande SET type_ouverture = 'Par dessus'
    WHERE upper(type_envoi_caisse) LIKE '%4C%' AND type_ouverture <> 'Par dessus';
UPDATE demande_caisse SET type_ouverture = 'Par dessus'
    WHERE upper(type_envoi_caisse) LIKE '%4C%' AND type_ouverture <> 'Par dessus';
