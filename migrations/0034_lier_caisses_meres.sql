-- Caisses mères créées par « Simuler » sur une affaire neuve sans lien vers leur ligne de
-- demande (oubli corrigé le 2026-10-06 dans App.handleConfirmerCreationAffaire) : la carte
-- proposait « Lier… ». On pose le lien quand il est sans ambiguïté : caisse non liée, portant le
-- nom de son affaire, et une seule ligne de demande de ce nom.
UPDATE caisse
SET demande_id = (SELECT d.id FROM demande d WHERE lower(trim(d.affaire)) = lower(trim(caisse.nom)))
WHERE demande_id IS NULL
  AND demande_caisse_id IS NULL
  AND lower(trim(nom)) = (SELECT lower(trim(a.nom)) FROM affaire a WHERE a.id = caisse.affaire_id)
  AND (SELECT COUNT(*) FROM demande d WHERE lower(trim(d.affaire)) = lower(trim(caisse.nom))) = 1;
