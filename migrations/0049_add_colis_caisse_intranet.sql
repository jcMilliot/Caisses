-- Caisse d'un colis donnée par l'intranet (liste de colisage de l'affaire, 2026-10-28) :
-- `tag` = colis (même valeur que `article.colis`), `lettre` = caisse (A = 1re caisse colisage…).
-- Imposée dans l'onglet Colisage en cours, prioritaire sur `colis_rangement` (choix à la main),
-- qui est gardé à part : si l'intranet ne donne plus de caisse, le choix à la main revient.
-- Réécrite en entier à chaque mise à jour du picking validée.
CREATE TABLE colis_caisse_intranet (
    affaire_id INTEGER NOT NULL REFERENCES affaire(id) ON DELETE CASCADE,
    tag        TEXT NOT NULL,
    lettre     TEXT NOT NULL,
    PRIMARY KEY (affaire_id, tag)
);
