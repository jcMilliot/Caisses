# 0004 — Contrôle dimensionnel : référentiel par AR, listes calculées, Simulations non modifié

- **Date** : 2026-11-16
- **Statut** : acté

## Contexte

Les dimensions et poids des articles sont mesurés à la main par plusieurs personnes et saisis
dans l'ERP ; les erreurs faussent le colisage (simulation et réel). Besoin : retenir les AR vus
dans Simulations, lister ceux dont 2 dimensions sur 3 dépassent un seuil (350 mm, réglable), les
recontrôler à la main, valider (valable 1 an, réglable) ou corriger, puis suivre le report des
corrections dans l'ERP (export Excel, validation une à une ou par sélection).

## Décision

- **Une table `controle_dimension`, clé = AR** (insensible à la casse, lignes « AR… » seulement).
  Elle garde les valeurs de l'ERP (rafraîchies à chaque import du picking ou collage, sauf ligne
  sans mesures) et **le dernier contrôle seulement** (date, auteur, mesures relevées si
  différentes, date de report dans l'ERP). Pas d'historique des contrôles.
- Reprise des articles déjà présents dans Simulations par la migration `0052`.
- **Les listes ne sont pas stockées** : à contrôler / validés / corrigés sont calculés côté
  frontend (`domain/controleDimension.ts`) d'après le seuil (`controle_seuil_mm`) et la durée
  (`controle_duree_mois`) de `parametre`. Changer un réglage s'applique tout de suite.
- Décisions de l'utilisateur : un AR déjà connu n'est jamais remis à contrôler par un nouveau
  picking (seules les mêmes personnes refont les mesures) — il ne revient qu'à l'expiration de sa
  validité ; dimensions **et** poids corrigeables ; **les articles de Simulations ne sont pas
  modifiés** — la correction passe par l'ERP, et la mise à jour du picking reprend les bonnes
  valeurs ; export Excel = Article, Longueur, Largeur, Hauteur, Poids (valeurs relevées) ;
  colonne « Affaires » = affaires où la pièce **n'est pas colisée** (on ne rouvre pas un colis
  pour contrôler) — une pièce colisée partout reste à contrôler, sans nom d'affaire, jusqu'à sa
  prochaine réception.
- Choix de l'assistant : mesures identiques à l'ERP au « Corriger » = simple validation ; la
  validité d'un article corrigé part du report dans l'ERP (pas du contrôle) ; les corrections
  restent listées quel que soit le seuil ; « 2 sur 3 » = au moins égales au seuil (≥, demande de l'utilisateur) ; verrou propre
  « controle ».

## Alternatives écartées

- **Colonnes sur `article`** : un même AR existe dans plusieurs affaires, le contrôle porte sur la
  référence, pas sur une ligne de picking.
- **Statut stocké** (à contrôler / validé…) : il faudrait le recalculer à chaque changement de
  seuil ou de durée, et au passage du temps pour l'expiration.
- **Report automatique dans Simulations** : refusé par l'utilisateur (l'ERP reste la source).

## Conséquences

- Re-contrôler un article efface la correction précédente (dernier contrôle seulement) : si un
  historique devient utile, ajouter une table de contrôles à part.
- L'export Excel passe par `rust_xlsxwriter` (dépendance Rust ajoutée).
