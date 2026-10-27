-- Ligne acceptée malgré l'alerte « plus volumineuse que le carton à elle seule » (onglet Colisage,
-- 2026-10-27) : pièce livrée dans un sachet dont on a relevé les dimensions (pièce + air).
-- Retire seulement l'alerte de la ligne : son volume compte toujours dans le taux du colis.
-- Même principe que `piece_acceptee` (0045) : vaut pour le carton `carton` choisi au moment du clic.
-- Numérotée 0048 : 0047 est pris par la branche `vue-3d`, pas encore fusionnée.
CREATE TABLE piece_acceptee_volume (
    article_id INTEGER PRIMARY KEY REFERENCES article(id) ON DELETE CASCADE,
    carton     TEXT NOT NULL
);
