-- Rôles des utilisateurs (décision 2026-09-30) : 'utilisateur' (défaut), 'lecteur' (lecture
-- seule partout, refusé aussi côté commandes) ou 'admin' (page Admin, mot de passe personnel).
-- Géré par les admins dans Admin › Utilisateurs. Remplace le trigramme admin codé en dur (AJC) :
-- AJC et tout trigramme ayant déjà un mot de passe deviennent admin.
ALTER TABLE utilisateur ADD COLUMN role TEXT NOT NULL DEFAULT 'utilisateur';
INSERT OR IGNORE INTO utilisateur (trigramme) VALUES ('AJC');
UPDATE utilisateur SET role = 'admin'
    WHERE trigramme = 'AJC' OR trigramme IN (SELECT trigramme FROM compte);
