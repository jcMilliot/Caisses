-- Pièce acceptée malgré l'alerte « ne rentre pas dans le carton » (onglet Colisage, 2026-10-15) :
-- une pièce qui ne tient pas sur les 3 axes peut passer en diagonale. L'acceptation vaut pour le
-- carton choisi au moment du clic (`carton` = « conso:<id> » ou « libre:<L>x<l>x<H> ») : changer
-- de carton fait revenir l'alerte.
CREATE TABLE piece_acceptee (
    article_id INTEGER PRIMARY KEY REFERENCES article(id) ON DELETE CASCADE,
    carton     TEXT NOT NULL
);
