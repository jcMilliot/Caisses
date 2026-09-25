# 0001 — SQLite + verrouillage applicatif plutôt qu'un serveur central

**Statut** : Acceptée — 2026-07-30 (verrouillage), reconduite depuis (usage multi-poste réel).

## Contexte

L'app est utilisée sur au moins deux postes, avec un besoin de partager les mêmes données
(affaires, demandes, caisses en stock) entre eux. Deux familles de solutions existaient :

1. Garder SQLite local à chaque poste et pointer le fichier `caisses.sqlite3` vers un dossier
   réseau partagé (SMB/CIFS), avec un mécanisme applicatif pour éviter les écritures
   concurrentes destructrices.
2. Construire un vrai serveur central (HTTP + base serveur) auquel chaque poste se connecte en
   client léger.

## Décision

Option 1 : dossier BDD réseau partagé configurable au premier lancement (choix utilisateur,
mémorisé dans `db-location.json`), plus un **verrouillage applicatif** (table `section_lock`,
`commands/locks.rs::require_lock` appelé en tête de toutes les commandes de mutation) — pas de
serveur central.

Portée du verrou volontairement grossière : l'écran entier pour Demandes / Caisses en stock /
Demandes d'achats, une affaire précise pour Simulations — jamais plus fin. Prise automatique à
l'ouverture, libération en quittant l'écran / après 5 min d'inactivité / sur demande explicite
("demander le crayon").

## Alternatives écartées

- **Serveur HTTP central dès le départ** : correct à terme, mais sur-dimensionné pour l'usage
  réel (2-3 postes, utilisateur unique au départ). Coût de développement et de maintenance
  disproportionné par rapport au risque à ce stade.
- **Verrouillage plus fin** (par ligne, par champ) : jugé inutilement complexe pour un usage à
  quelques postes internes bienveillants — le gain en granularité ne justifiait pas la
  complexité supplémentaire (gestion des conflits partiels, UX de résolution).
- **Pas de verrouillage du tout** (compter sur la discipline des utilisateurs) : écarté après
  avoir identifié le risque concret de corruption SQLite en écriture concurrente sur un partage
  réseau — pas juste théorique, SQLite n'est pas conçu pour ça sur SMB/CIFS.

## Conséquences acceptées

- **Risque de corruption non éliminé, seulement mitigé.** Le verrouillage applicatif réduit
  fortement la probabilité d'écriture concurrente, mais ne l'élimine pas complètement (dérive
  d'horloge entre postes, fenêtre entre expiration du verrou et détection). Mitigation
  complémentaire actée mais pas encore implémentée : sauvegarde régulière du fichier (voir
  "À faire" dans `CLAUDE.md`).
- **Pas de droits par utilisateur.** Un poste qui a la main peut tout faire — pas de lecture
  seule imposée, pas d'audit d'accès autre que le journal des actions à effet fort. Acceptable
  tant que l'usage reste interne et bienveillant (voir "À réfléchir plus tard" dans `CLAUDE.md`).
- **Chemin d'évolution gardé ouvert** : la séparation stricte `data/` (seule couche autorisée à
  appeler `invoke()`) a été pensée dès le début pour permettre de remplacer cette couche par des
  appels HTTP vers un serveur, sans toucher à l'UI ni à la logique de calcul, si le besoin d'un
  serveur central redevient pertinent plus tard.

## Quand reconsidérer

Si le nombre de postes/utilisateurs grandit significativement, ou si un incident de corruption
réel survient malgré le verrouillage, ou si un besoin de droits par utilisateur apparaît (poste
"consultation seule", identités vérifiées) — voir "À réfléchir plus tard" dans `CLAUDE.md`.
