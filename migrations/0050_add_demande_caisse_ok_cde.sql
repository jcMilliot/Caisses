-- Envoi en partiel (décision 2026-10-29) : chaque caisse enfant a sa propre case « OK pour être
-- commandée » (et le trigramme de qui l'a cochée), indépendante de la mère, et n'est plus livrée
-- que par sa propre observation (une mère peut être livrée avant ses enfants).
ALTER TABLE demande_caisse ADD COLUMN ok_pour_passer_cde INTEGER NOT NULL DEFAULT 0;
ALTER TABLE demande_caisse ADD COLUMN ok_cde_par TEXT NOT NULL DEFAULT '';

-- Les sous-caisses existantes reprennent l'état de leur mère : les affiches ne changent pas.
UPDATE demande_caisse
SET ok_pour_passer_cde = 1,
    ok_cde_par = (SELECT d.ok_cde_par FROM demande d WHERE d.id = demande_caisse.demande_id)
WHERE EXISTS (SELECT 1 FROM demande d WHERE d.id = demande_caisse.demande_id AND d.ok_pour_passer_cde = 1);

-- Jusqu'ici une sous-caisse comptait comme livrée dès que sa mère l'était. Celles d'une mère
-- livrée qui n'ont pas d'observation de livraison la reçoivent (même texte que la cascade de
-- « Livré »), pour qu'elles ne réapparaissent pas comme à commander.
UPDATE demande_caisse
SET observations = CASE WHEN cde_passee_achat_stock = 1 THEN 'Rapatriée' ELSE 'Livré' END
WHERE NOT (lower(observations) LIKE '%livré%' OR lower(observations) LIKE '%livre%'
           OR lower(observations) LIKE '%rapatrié%' OR lower(observations) LIKE '%rapatrie%')
  AND EXISTS (
    SELECT 1 FROM demande d WHERE d.id = demande_caisse.demande_id
      AND (d.validee = 1 OR lower(d.observations) LIKE '%livré%' OR lower(d.observations) LIKE '%livre%'
           OR lower(d.observations) LIKE '%rapatrié%' OR lower(d.observations) LIKE '%rapatrie%'));
