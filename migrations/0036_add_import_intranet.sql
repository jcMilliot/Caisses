-- Import des articles d'une affaire depuis l'intranet (picking, 2026-10-07).
-- `normm` = numéro de besoin de l'intranet : clé d'une ligne pour les mises à jour (NULL = article
-- collé depuis Excel). `qte_initiale` = `initial_qty` de l'intranet (affichée sous l'AR quand elle
-- diffère de la quantité). `supprime_intranet` = ligne supprimée dans l'intranet (QTARF null) :
-- sortie du tableau, listée en dessous, revient si elle réapparaît dans le picking.
ALTER TABLE article ADD COLUMN normm INTEGER;
ALTER TABLE article ADD COLUMN qte_initiale INTEGER;
ALTER TABLE article ADD COLUMN supprime_intranet INTEGER NOT NULL DEFAULT 0;

-- Dernier import / vérification d'une affaire, et lignes écartées faute de numéro de besoin
-- (JSON : liste des AR), affichées par le bouton d'anomalie de Simulations.
CREATE TABLE affaire_import_intranet (
    affaire_id INTEGER PRIMARY KEY REFERENCES affaire(id) ON DELETE CASCADE,
    importe_le TEXT NOT NULL,
    anomalies TEXT NOT NULL DEFAULT '[]'
);
