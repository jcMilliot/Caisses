---
projet: Caisses
statut: en cours
priorite: normale
mis_a_jour: 2026-10-29
prochaine_etape: Publier le brouillon de la release 0.20.0 (soumission Defender si bloqué), puis vérifier les Notes de mise à jour sur un poste
---

## Résumé
Application de bureau Windows (Tauri 2 + React + SQLite) qui remplace un fichier Excel pour dimensionner des caisses d'expédition en bois : gestion des caisses, simulations, consommables, demandes d'achats, alertes. Usage quotidien multi-poste ; version 0.20.0 préparée le 2026-10-29 (brouillon à publier).

## Reste à faire
- [ ] Envoi en partiel : décider du sort d'un article livré modifié par la mise à jour du picking
- [ ] Tablette Samsung sous Windows : vérifier installation et usage (tactile, WebView2, dossier réseau, connexion intranet)
- [ ] Point sur la documentation utilisateur avec l'utilisateur

## Fait
- [x] Simulations : affaires, articles, caisses, taux de remplissage et alertes
- [x] Verrouillage applicatif multi-poste (testé à deux postes le 2026-07-31) et journal d'audit
- [x] Compte admin, sauvegarde automatique, restauration (0.9.x, 2026-09)
- [x] Refonte visuelle (0.12.0, 2026-10-03)
- [x] Import intranet, connexion par le compte intranet, poids des caisses (0.14.0, 2026-10-08)
- [x] Page Alertes, enregistrement automatique de Gestion des caisses (0.17.0, 2026-10-20)
- [x] Picking mis à jour à l'ouverture, onglets Picking / Colisage en cours (0.18.0, 2026-10-27)
- [x] Caisse des colis reprise de la liste de colisage de l'intranet, colis rangés d'office si une seule caisse (0.19.0, 2026-10-28, migration 0049) — validé le 2026-10-29
- [x] Simulations : compteur « lignes affichées / total » quand un filtre est actif (0.19.0, 2026-10-28)
- [x] Envoi en partiel : commande / livraison par caisse enfant, articles figés, onglets par envoi (0.20.0, 2026-10-29, migrations 0050-0051) — validé par l'utilisateur
- [x] Page « Notes de mise à jour » sur l'accueil (0.20.0, 2026-10-29)

## Bloqué / points d'attention
- Base SQLite sur un dossier réseau partagé : risque connu de corruption en écritures simultanées, atténué par le verrouillage applicatif et la sauvegarde
- Pas de signature de l'installeur : faux positifs possibles de Windows Defender
- Dépôt public : ni nom d'entreprise, ni adresse d'API, ni donnée réelle (`docs/prive/` ignoré par git)
- Le suivi détaillé est dans le CLAUDE.md (« Prochaines étapes ») et la feuille de route Admin : les garder alignés avec ce fichier

## Décisions prises
- 2026-07-30 : SQLite + verrouillage applicatif plutôt qu'un serveur central (ADR 0001)
- 2026-07-30 : base sur dossier réseau partagé pour le multi-poste, malgré le risque
- 2026-09-09 : pas de signature Authenticode de l'installeur (ADR 0002)
- 2026-09-28 : compte admin en base, session en mémoire, sauvegarde par n'importe quel poste (ADR 0003)
- 2026-10-28 : caisse d'un colis donnée par l'intranet imposée et prioritaire sur le choix à la main ; une seule caisse colisage → colis rangés d'office

## Idées plus tard
- Lier une caisse de Simulations à une caisse pesée
- Vue 3D d'une caisse
- Droits par tâche
- Aide de dimensions / dimensions conseillées
- Créer une caisse enfant depuis « + Créer une nouvelle caisse »
- Rapprochement avec les cartons standards existants
