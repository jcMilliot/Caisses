-- Droits par écran (2026-11-25, ADR 0005) : pour chaque personne non administratrice, lecture ou
-- écriture sur chaque écran. Pas de ligne = lecture (nouvelle personne : lecture partout, décision
-- de l'utilisateur). Les administrateurs écrivent partout, sans ligne.
-- `ecran` ∈ 'demandes' (Gestion des caisses) | 'simulations' | 'stock' (Consommable) |
--           'achats' (Demandes d'achats) | 'alertes' | 'controle' (Contrôle dimensionnel).
CREATE TABLE droit_ecran (
    trigramme TEXT NOT NULL,
    ecran     TEXT NOT NULL,
    ecriture  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (trigramme, ecran)
);

-- Personnes existantes : rien ne change. « Utilisateur » → écriture partout ; « Lecteur » →
-- lecture partout (pas de ligne) et le rôle disparaît (remplacé par ces droits).
INSERT INTO droit_ecran (trigramme, ecran, ecriture)
SELECT u.trigramme, e.ecran, 1
FROM utilisateur u,
     (SELECT 'demandes' AS ecran UNION ALL SELECT 'simulations' UNION ALL SELECT 'stock'
      UNION ALL SELECT 'achats' UNION ALL SELECT 'alertes' UNION ALL SELECT 'controle') e
WHERE u.role = 'utilisateur';

UPDATE utilisateur SET role = 'utilisateur' WHERE role = 'lecteur';
