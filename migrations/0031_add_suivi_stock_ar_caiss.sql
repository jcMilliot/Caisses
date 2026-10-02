-- Suivi des quantités des caisses AR_CAISS_ (décisions 2026-10-01 / 2026-10-02).
-- `gere` : la caisse est suivie (quantité décomptée à la livraison, alerte de réappro) ; une
-- caisse non gérée n'est ni décomptée ni surveillée. `seuil_alerte` : alerte « à commander »
-- quand quantite <= seuil_alerte. Réglés dans Admin › Stock.
ALTER TABLE caisse_stock ADD COLUMN gere INTEGER NOT NULL DEFAULT 0;
ALTER TABLE caisse_stock ADD COLUMN seuil_alerte INTEGER NOT NULL DEFAULT 0;

-- Quantité réellement retirée du stock à la livraison de la ligne (plancher à 0, donc peut être
-- inférieure à la quantité de la ligne). NULL = pas décomptée (jamais livrée avec une caisse
-- gérée, ou livrée avant cette version). Sert à ne décompter qu'une fois et à remettre en stock
-- exactement ce qui a été retiré si on dévalide.
ALTER TABLE demande ADD COLUMN stock_decompte INTEGER;
ALTER TABLE demande_caisse ADD COLUMN stock_decompte INTEGER;
