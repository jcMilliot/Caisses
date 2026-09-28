# 0003 — Compte admin en base, session en mémoire, sauvegarde par n'importe quel poste

**Statut** : Acceptée — 2026-09-28.

## Contexte

Jusqu'ici l'identité était un trigramme déclaratif par poste (`user-identity.json`), et la seule
fonction réservée (le journal d'audit) était gardée par « trigramme == AJC » — contournable en
choisissant AJC au premier lancement ou en éditant le fichier. Besoin : une page Admin réservée à
l'auteur (utilisateurs, journal, réglage de la sauvegarde de la base), protégée par un mot de
passe, et une sauvegarde automatique de `caisses.sqlite3` alors que la base peut vivre sur un
partage réseau utilisé par plusieurs postes.

## Décision

- **Mot de passe en base** (table `compte`, hash Argon2) : un seul mot de passe valable sur tous
  les postes, et une table prête à accueillir d'autres comptes / rôles plus tard.
- **Demandé au choix du trigramme AJC** (création au premier choix) **et à l'ouverture de la page
  Admin**, une fois par lancement : la session admin vit en mémoire dans le processus Rust
  (`AdminSession`), jamais écrite sur disque. Les commandes admin sont gardées côté Rust
  (`require_admin`), pas seulement par l'UI.
- **Utilisateurs** : table `utilisateur` alimentée par les trigrammes que les gens saisissent
  eux-mêmes — pas de liste imposée ni de validation par l'admin.
- **Sauvegarde par n'importe quel poste ouvert** : configuration partagée en base (`parametre`),
  réservation atomique par `UPDATE ... WHERE` conditionnel pour qu'un seul poste la fasse, copie
  cohérente par `VACUUM INTO`.

## Alternatives écartées

- **Mot de passe par poste (fichier local)** : à redéfinir sur chaque poste, et rien de
  réutilisable pour de futurs droits.
- **Mot de passe à chaque lancement** / **seulement au choix du trigramme** : le premier impose
  une saisie quotidienne sans gain réel ; le second laisserait l'Admin ouverte à quiconque
  utilise le poste de l'auteur.
- **Liste d'utilisateurs gérée par l'admin** (trigrammes autorisés) : pas souhaité pour l'instant.
- **Sauvegarde seulement sur le poste AJC**, ou **tâche planifiée Windows** : aucune sauvegarde
  quand ce poste est éteint ; la tâche planifiée serait en plus à installer poste par poste.

## Conséquences acceptées

- Sécurité « interne » : le mot de passe protège l'accès via l'app, pas le fichier SQLite
  lui-même (quiconque a accès au dossier peut lire ou modifier la base avec un outil externe).
  Les autres trigrammes restent déclaratifs.
- Mot de passe oublié : pas de procédure dans l'app — supprimer la ligne dans `compte` avec un
  outil SQLite pour le recréer.
- Le dossier de sauvegarde doit être accessible depuis tous les postes ; sinon le poste concerné
  échoue, l'erreur est notée en base et un autre poste réessaie.

## Quand reconsidérer

Au moment d'introduire des droits par tâche, ou de passer à un serveur central (cf. ADR 0001) :
l'authentification et la sauvegarde migreraient alors côté serveur.
