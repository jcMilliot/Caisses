-- Section 3 de la Documentation (« Récupérer les articles ») : identifiant renommé en
-- `recuperer-articles` (2026-10-07) pour retirer le nom de l'entreprise du dépôt public. Les
-- textes modifiés en base sont rangés par clé `<section>.…` : on renomme les clés de l'ancienne
-- section. L'ancien identifiant est écrit en codes de caractères, pour ne pas le laisser en clair.
UPDATE parametre
SET valeur = REPLACE(valeur, '"' || char(115,101,97,108,101,100,97,105,114) || '.', '"recuperer-articles.')
WHERE cle = 'documentation_textes';
