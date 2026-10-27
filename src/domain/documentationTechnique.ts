import type { BlocDoc } from "./documentation";

// Documentation technique (onglet de la page Documentation, 2026-10-15) : explication technique du
// projet pour qui doit le maintenir. Contenu fixe (pas modifiable dans l'app, contrairement à la
// documentation utilisateur) — à tenir à jour avec le code. Le dépôt est public : n'y mettre ni
// adresse d'API, ni nom d'entreprise, ni identifiant. `**gras**` comme dans la documentation
// utilisateur. Référence complète pour le développement : CLAUDE.md à la racine du dépôt.

export interface SectionDocTechnique {
  id: string;
  titre: string;
  blocs: BlocDoc[];
}

const h3 = (texte: string): BlocDoc => ({ type: "h3", texte });
const li = (texte: string, sous?: string[]): BlocDoc => ({ type: "li", texte, sous });

export const INTRO_DOC_TECHNIQUE =
  "Fonctionnement interne de l'application : technologies, organisation du code, base de données, échanges entre postes et mises à jour. Le fichier CLAUDE.md, à la racine du dépôt, reste la référence détaillée (journal des décisions, modèle de données complet).";

export const SECTIONS_DOC_TECHNIQUE: SectionDocTechnique[] = [
  {
    id: "tech-ensemble",
    titre: "Vue d'ensemble",
    blocs: [
      li("Application de bureau Windows, installée sur chaque poste. Elle remplace un fichier Excel de calcul du volume et du poids des caisses d'expédition, et le suivi des demandes de caisses."),
      li("Toutes les données sont dans **un seul fichier SQLite** (`caisses.sqlite3`), placé dans un dossier partagé sur le réseau : tous les postes travaillent sur le même fichier, sans serveur."),
      li("Pas de bouton « Enregistrer » général : chaque action est écrite en base immédiatement. Gestion des caisses garde un brouillon local, envoyé automatiquement après chaque action (écart avec l'état serveur, un envoi à la fois, rechargement depuis la base en cas d'erreur)."),
    ],
  },
  {
    id: "tech-technologies",
    titre: "Technologies",
    blocs: [
      h3("Application"),
      li("**Tauri 2** : enveloppe de bureau. Le cœur est écrit en **Rust** ; l'interface s'affiche dans la webview du système (WebView2 sous Windows), sans navigateur embarqué."),
      li("**React 19 + TypeScript**, construit avec **Vite**. Police Inter embarquée (aucun chargement internet)."),
      li("**SQLite** via la bibliothèque Rust `rusqlite` (SQLite compilé avec l'application, rien à installer)."),
      h3("Bibliothèques Rust notables"),
      li("`tauri-plugin-dialog` (choix de dossier), `tauri-plugin-updater` et `tauri-plugin-process` (mises à jour automatiques et redémarrage)."),
      li("`reqwest` (appels à l'intranet, certificats et proxy du poste), `keyring` (identifiants intranet dans le gestionnaire d'identifiants Windows), `serde` (échanges JSON)."),
      h3("Bibliothèques JavaScript notables"),
      li("`html-to-image` (copie des affiches de Demandes d'achats en image)."),
      h3("Construction et diffusion"),
      li("**GitHub Actions** + `tauri-action` : un tag `vX.Y.Z` déclenche la construction de l'installeur Windows (NSIS) et des fichiers de mise à jour signés."),
    ],
  },
  {
    id: "tech-code",
    titre: "Organisation du code",
    blocs: [
      h3("Interface (dossier src/)"),
      li("`domain/` : logique métier **pure** (calculs de volume, poids, remplissage, alertes, colisage, règles des demandes). Aucun accès aux données."),
      li("`data/` : **seule couche** qui appelle le cœur Rust (`invoke`), un module par entité. Pourra être remplacée par des appels à un serveur sans toucher au reste."),
      li("`hooks/` : état et chargement des écrans (ex. `useAffaire`, `useColisage`, `useSectionLock`)."),
      li("`components/` : éléments d'interface, sans accès direct aux données."),
      li("`routes/` : écrans (Accueil, Gestion des caisses, Simulations, Consommable, Demandes d'achats, Admin, Documentation)."),
      h3("Cœur Rust (dossier src-tauri/src/)"),
      li("`lib.rs` : démarrage, enregistrement des commandes, fermeture propre (libération des verrous)."),
      li("`db.rs` : ouverture de la base et application des migrations."),
      li("`commands/` : une commande Tauri par action (création, modification, suppression, calculs côté base), regroupées par entité."),
      li("Les noms des paramètres Rust en `snake_case` arrivent en `camelCase` côté JavaScript ; les champs des objets échangés gardent leur nom."),
    ],
  },
  {
    id: "tech-base",
    titre: "Base de données",
    blocs: [
      li("Dossier de la base saisi au premier lancement (chemin communiqué par un administrateur), mémorisé sur le poste. Un administrateur peut le changer pour tous les postes (Admin › Paramètres) : les autres le suivent à leur démarrage."),
      li("**Migrations versionnées** : chaque évolution du schéma est un fichier `migrations/00NN_*.sql`, embarqué dans l'application et appliqué une seule fois (table `_migrations`). On n'en modifie jamais un déjà publié : on en ajoute un nouveau."),
      li("Volumes, poids et taux de remplissage **ne sont pas stockés** : ils sont recalculés à chaque affichage à partir des dimensions, pour éviter toute incohérence."),
      li("Principales tables :", [
        "`affaire`, `caisse`, `article` : Simulations (articles importés de l'intranet ou collés depuis Excel) ;",
        "`demande`, `demande_caisse` : Gestion des caisses (indépendantes des affaires, liées par le nom et par des liens explicites) ;",
        "`demande_alerte` : page Alertes (date d'expédition anticipée, qui remplace le picking dans le calcul des alertes, et commentaire) — table à part pour que l'enregistrement de Gestion des caisses, qui réécrit toute la ligne `demande`, ne l'écrase pas ;",
        "`caisse_stock`, `carton_conso` : Consommable ;",
        "`colis_affaire`, `caisse_colisage`, `colis_rangement` : onglet Colisage d'une affaire ;",
        "`section_lock`, `poste_actif` : verrous et postes ouverts ;",
        "`utilisateur`, `journal`, `parametre` : rôles, journal d'audit, réglages partagés.",
      ]),
    ],
  },
  {
    id: "tech-calculs",
    titre: "Calculs",
    blocs: [
      li("Volume d'un article = Dim1 × Dim2 × Dim3 ; volume d'une caisse = L × l × H ; remplissage = volume des articles ÷ volume de la caisse, comparé au seuil de l'affaire."),
      li("Alertes de caisse : volume dépassé, article plus grand que la caisse (axes comparés un à un), charge au m² (articles + poids estimé de la caisse) au-delà de la limite réglée dans l'Admin."),
      li("Poids d'une caisse : tare si elle est connue (caisse en stock), sinon estimation d'après les dimensions et la matière (panneaux, pieds, tasseaux, mousse et bâche pour les 4C), calée sur des caisses pesées (Admin › Caisses › Poids)."),
      li("Colisage : volume d'un colis = volume extérieur de son carton ; une pièce doit rentrer dans l'intérieur du carton, dans n'importe quelle orientation (cote égale acceptée, rien au-delà) ; carton libre = intérieur 2 mm plus petit que l'extérieur sur chaque axe."),
    ],
  },
  {
    id: "tech-postes",
    titre: "Plusieurs postes sur la même base",
    blocs: [
      li("SQLite n'est pas fait pour des écritures simultanées sur un partage réseau. Pour l'éviter, l'application pose un **verrou applicatif** : un seul poste à la fois a la main sur Gestion des caisses, Consommable, Demandes d'achats, ou sur une affaire précise de Simulations."),
      li("Le poste qui a la main signale sa présence toutes les 7 secondes ; sans activité pendant 5 minutes, le verrou expire. Les autres postes voient l'écran en lecture seule et peuvent demander l'écriture ou prendre la main d'un verrou libre."),
      li("Le cœur Rust **refuse toute écriture** sur une section tenue par un autre poste (pas seulement l'interface)."),
      li("Fermer l'application libère ses verrous. Chaque poste signale aussi sa présence (toutes les 30 s) : la restauration d'une sauvegarde demande d'abord aux autres postes de fermer l'application."),
    ],
  },
  {
    id: "tech-comptes",
    titre: "Comptes et droits",
    blocs: [
      li("Connexion avec le **compte intranet** : l'identité (trigramme) vient de l'intranet ; le mot de passe est gardé dans le gestionnaire d'identifiants Windows du poste, jamais en base."),
      li("Rôles gérés dans l'application : Utilisateur, Lecteur (lecture seule partout), Administrateur. Un administrateur permanent ne peut pas être rétrogradé."),
      li("La session administrateur vit en mémoire sur le poste ; les commandes réservées la vérifient côté Rust."),
      li("Intranet injoignable : l'application démarre avec le dernier compte connu du poste, sans accès Admin."),
    ],
  },
  {
    id: "tech-intranet",
    titre: "Intranet",
    blocs: [
      li("L'adresse de l'API est un réglage (Admin › Paramètres), jamais écrite dans le code : le dépôt est public."),
      li("Import d'une affaire : le picking est lu par le cœur Rust, puis comparé aux articles de l'affaire. Chaque ligne est reconnue par son **numéro de besoin** ; une ligne supprimée dans l'intranet sort du tableau ; une quantité modifiée garde la trace de la quantité initiale ; le colis (lettre = caisse, chiffre = colis) est repris quand la ligne est colisée. La vérification se lance d'elle-même à l'ouverture d'une affaire, une fois qu'on a la main ; le résumé des changements reste à valider."),
      li("Les réponses de l'intranet ne sont jamais enregistrées telles quelles : seul le résultat de la comparaison est écrit, en une transaction."),
    ],
  },
  {
    id: "tech-sauvegarde",
    titre: "Sauvegarde et restauration",
    blocs: [
      li("Sauvegarde automatique (quotidienne ou hebdomadaire) faite par **un seul** des postes ouverts, réservée en base ; copie cohérente par `VACUUM INTO`, nombre de fichiers conservés réglable."),
      li("Restauration : vérification du fichier, copie de sécurité de la base actuelle, remplacement par l'API de sauvegarde de SQLite, migrations rejouées si besoin ; les réglages actuels (rôles, paramètres) sont conservés ; l'application redémarre."),
    ],
  },
  {
    id: "tech-mises-a-jour",
    titre: "Versions et mises à jour",
    blocs: [
      li("Une version = numéro modifié dans `tauri.conf.json`, `package.json` et `Cargo.toml`, puis tag `vX.Y.Z` poussé sur GitHub."),
      li("La construction produit une release en **brouillon** ; elle n'est visible des postes qu'une fois publiée à la main."),
      li("Chaque poste vérifie les mises à jour au démarrage puis toutes les 30 minutes, les télécharge et les installe sans fenêtre (barre de progression dans l'application), puis redémarre. Les fichiers de mise à jour sont signés."),
      li("L'installeur n'est pas signé (pas de certificat) : Microsoft Defender peut le bloquer à tort ; il faut alors le soumettre à Microsoft comme faux positif."),
    ],
  },
];
