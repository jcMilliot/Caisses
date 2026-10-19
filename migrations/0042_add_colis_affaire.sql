-- Carton choisi pour un colis d'une affaire (onglet Colisage de Simulations, 2026-10-14). Un colis
-- = un `pack_tag` chiffré de l'intranet (`article.colis`), propre à l'affaire. Pas de ligne = pas
-- de carton choisi. Carton supprimé de Conso en stock → le choix disparaît.
CREATE TABLE colis_affaire (
    affaire_id      INTEGER NOT NULL REFERENCES affaire(id) ON DELETE CASCADE,
    tag             TEXT NOT NULL,
    carton_conso_id INTEGER NOT NULL REFERENCES carton_conso(id) ON DELETE CASCADE,
    PRIMARY KEY (affaire_id, tag)
);
