-- Code de secours d'un administrateur (décision 2026-09-30) : affiché une seule fois à la création
-- du mot de passe (ou à sa régénération), à noter en lieu sûr ; « Mot de passe oublié ? » + ce
-- code permet d'en choisir un nouveau (le code est alors remplacé). Hash Argon2, comme le mot de
-- passe. NULL = pas encore de code (ex. AJC, mot de passe créé avant cette version).
ALTER TABLE compte ADD COLUMN code_secours_hash TEXT;
