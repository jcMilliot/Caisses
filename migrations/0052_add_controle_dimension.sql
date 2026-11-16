-- Contrôle dimensionnel (2026-11-16) : référentiel des AR vus dans Simulations (dimensions et poids
-- de l'ERP, repris du picking / du collage), et résultat du dernier contrôle manuel.
-- Liste « à contrôler » = AR dont 2 dimensions sur 3 dépassent le seuil réglé dans l'Admin, jamais
-- contrôlés ou dont le contrôle a expiré (durée réglée dans l'Admin). Calcul côté frontend
-- (domain/controleDimension.ts) : rien d'autre n'est stocké.
CREATE TABLE controle_dimension (
    ar             TEXT PRIMARY KEY COLLATE NOCASE,
    -- Dernières valeurs de l'ERP (rafraîchies à chaque import du picking si elles sont saisies).
    dim1_mm        REAL NOT NULL DEFAULT 0,
    dim2_mm        REAL NOT NULL DEFAULT 0,
    dim3_mm        REAL NOT NULL DEFAULT 0,
    poids_kg       REAL NOT NULL DEFAULT 0,
    ajoute_le      TEXT NOT NULL DEFAULT (datetime('now')),
    -- Dernier contrôle (NULL = jamais contrôlé).
    controle_le    TEXT,
    controle_par   TEXT NOT NULL DEFAULT '',
    -- 1 = mesures différentes de l'ERP au dernier contrôle (onglet « Dimensions corrigées »).
    corrige        INTEGER NOT NULL DEFAULT 0,
    corr_dim1_mm   REAL,
    corr_dim2_mm   REAL,
    corr_dim3_mm   REAL,
    corr_poids_kg  REAL,
    -- Correction reportée dans l'ERP (NULL = pas encore) ; point de départ du prochain contrôle.
    erp_valide_le  TEXT,
    erp_valide_par TEXT NOT NULL DEFAULT ''
);

-- Reprise des articles déjà présents dans Simulations : un AR (lignes « AR… » seulement), valeurs
-- de sa ligne la plus récente.
INSERT OR IGNORE INTO controle_dimension (ar, dim1_mm, dim2_mm, dim3_mm, poids_kg)
SELECT upper(trim(a.ar)), a.dim1_mm, a.dim2_mm, a.dim3_mm, a.poids_unitaire_kg
FROM article a
WHERE a.id IN (
    SELECT MAX(id) FROM article
    WHERE upper(trim(ar)) LIKE 'AR%' AND supprime_intranet = 0
    GROUP BY upper(trim(ar))
);
