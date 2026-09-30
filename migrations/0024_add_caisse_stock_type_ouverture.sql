-- Type d'ouverture d'une caisse en stock (décision 2026-09-28). Repris sur la ligne de Gestion
-- des caisses qui sélectionne cette caisse, et verrouillé tant qu'elle est sélectionnée.
-- Défaut « Par dessus » = ce qui était imposé jusqu'ici à toute caisse en stock.
ALTER TABLE caisse_stock ADD COLUMN type_ouverture TEXT NOT NULL DEFAULT 'Par dessus';
