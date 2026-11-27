---
projet: Caisses
statut: en cours
priorite: normale
mis_a_jour: 2026-11-27
prochaine_etape: Publier le brouillon 0.26.0, régler les droits par écran, puis vérifier à l'écran les points de la 0.26.0
---

## Résumé
Application de bureau Windows (Tauri 2 + React + SQLite) qui remplace un fichier Excel pour dimensionner des caisses d'expédition en bois : gestion des caisses, simulations, consommables, demandes d'achats, alertes. Usage quotidien multi-poste ; version 0.26.0 préparée le 2026-11-27 (brouillon à publier).

## Reste à faire
- [ ] Contrôle dimensionnel : validation automatique d'après l'ERP — codée le 2026-11-25, à vérifier à l'écran
- [ ] Droits par écran (lecture / écriture, ADR 0005, migration 0054) — codés le 2026-11-25, à vérifier à l'écran
- [ ] Verrouillage à la fermeture pas instantané (retour du 2026-11-25) — délai normal ≤ 7 s + clic « Prendre la main », à refaire tester
- [ ] Admin : « Qui a la main » / « Retirer la main » — codé le 2026-11-25, à tester à deux postes
- [ ] Dimensions des pièces remises dans l'ordre (longueur = plus grande, hauteur = plus petite) pour les calculs — codé le 2026-11-26, à vérifier à l'écran
- [ ] Petits volumes : colonne « Sortie » (mouvement de sortie par affaire) — codé le 2026-11-27, à vérifier à l'écran

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
- [x] Comparatif de Colisage en cours qui part du picking (0.20.1, 2026-10-30) — validé le 2026-11-16
- [x] ~~Tablette Samsung~~ : abandonné le 2026-11-16
- [x] Contrôle dimensionnel (0.21.0, migration 0052, 2026-11-16) — validé par l'utilisateur le 2026-11-16
- [x] Envoi en partiel : caisse détaillée créée depuis Simulations quand la mère est livrée — validé le 2026-11-16
- [x] Envoi en partiel : article livré modifié par le picking — cas non censé arriver, rien à faire (2026-11-16)
- [x] Contrôle dimensionnel : « Dispo pour ctrl », export réordonné avec écarts, lecture du picking en direct (0.22.0-0.24.0) — validé le 2026-11-19
- [x] Contrôle dimensionnel › Petits volumes (0.25.0) — validé le 2026-11-25
- [x] Documentation utilisateur revue en entier (picking automatique, Colisage en cours, Consommable, verrouillage) — validée le 2026-11-24
- [x] Caisse de stock / récup sans demande à S2C ; articles décolisés libérés dans Simulations (0.23.0-0.24.0) — validé le 2026-11-19

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
- 2026-11-16 : contrôle dimensionnel — référentiel par AR, listes calculées, Simulations jamais modifié par l'outil (ADR 0004)
- 2026-11-25 : droits par écran (lecture / écriture) par personne, lecture par défaut, plus de rôle Lecteur (ADR 0005)
- 2026-10-28 : caisse d'un colis donnée par l'intranet imposée et prioritaire sur le choix à la main ; une seule caisse colisage → colis rangés d'office

## Idées plus tard
- Petits volumes : reprendre les dimensions de l'ERP pour une pièce mise en sachet à la préparation
- Lier une caisse de Simulations à une caisse pesée
- Vue 3D d'une caisse
- Droits par action (si erreurs fréquentes)
- Aide de dimensions / dimensions conseillées
- Rapprochement avec les cartons standards existants
