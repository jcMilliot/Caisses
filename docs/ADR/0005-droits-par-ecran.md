# 0005 — Droits par écran (lecture / écriture), par personne

Date : 2026-11-25 · Statut : accepté

## Contexte

Jusqu'ici, trois rôles : Utilisateur (écrit partout), Lecteur (lit partout), Administrateur. Besoin
de l'utilisateur : limiter **une** personne à la **lecture du Contrôle dimensionnel**, en gardant
l'écriture ailleurs. Équipe de 3 personnes du même service, qui ne grandira pas.

## Décision

- Pour chaque personne et chaque écran (Gestion des caisses, Simulations, Consommable, Demandes
  d'achats, Alertes, Contrôle dimensionnel) : **Lecture** ou **Écriture**. Table `droit_ecran`
  (migration 0054), **pas de ligne = lecture**.
- **Tout le monde voit tout** (pas de niveau « pas d'accès ») ; seule la page Admin reste réservée.
- **Nouvelle personne : lecture partout** (choix de l'utilisateur).
- **Administrateur : écriture partout**, sans ligne.
- **Réglé par personne**, pas de profils (équipe petite et stable).
- **Pas de droits par action** (« Livré », « OK pour être commandée »…) pour l'instant : à ajouter
  si des erreurs fréquentes surviennent.
- Le rôle **Lecteur disparaît** : la migration le convertit en « Utilisateur, lecture partout » ;
  les Utilisateurs existants reçoivent l'écriture partout (aucun changement à la mise à jour).
- **Vérification côté Rust** au point de passage de toutes les écritures (`require_lock`, qui
  reçoit la clé de l'écran ; `affaire:*` = Simulations) + `create_affaire` et le rafraîchissement
  du contrôle dimensionnel. Côté interface, un écran en lecture ne prend jamais le verrou.
- La restauration d'une sauvegarde **garde les droits actuels**, comme les rôles.

## Alternatives écartées

- **Profils** (« Logistique »…) : inutile à 3 personnes.
- **« Pas d'accès » avec blocage de la lecture côté Rust** : non demandé, et les commandes de
  lecture ne reçoivent pas l'identité — gros chantier.
- **Garder le rôle Lecteur à côté des droits** : deux façons d'exprimer la même chose.

## Conséquences

- Une écriture « croisée » (ex. Simulations qui reporte des dimensions dans Gestion des caisses)
  demande le droit d'écriture sur l'écran **cible** ; sinon refus avec message.
- L'identité reste celle de la connexion intranet, transmise par l'interface : la vérification
  protège des erreurs, pas d'un poste volontairement modifié (comme avant).
