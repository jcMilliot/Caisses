# Caisses — gestion d'affaires, articles et caisses de conditionnement

## Objectif

Application de bureau (installée, Windows) qui remplace un Excel utilisé pour calculer
le volume et le poids de caisses en bois destinées à l'expédition d'articles.

L'application s'organise autour d'un **menu principal à 4 sections** (`App.tsx`) :
- **Demandes** : tableau de suivi des demandes de caisses (reprend un fichier Excel existant),
  avec collage multi-lignes.
- **Simulations** : le cœur historique de l'app (ex-écran d'accueil) —
  - créer des **affaires** (dossiers de calcul, un par projet client)
  - saisir des **articles** (référence, désignation, dimensions, poids, quantité) dans une
    affaire, y compris par **collage multi-lignes depuis Excel**
  - créer plusieurs **caisses** par affaire (dimensions L/l/H, seuil de remplissage)
  - **assigner/réassigner** des articles à une caisse (sélection multiple + "Assigner à →")
  - calculer automatiquement pour chaque caisse : volume occupé, volume interne, taux de
    remplissage, poids total — avec alerte visuelle (vert/jaune/rouge) selon un seuil
    paramétrable par affaire et surchargeable par caisse
- **Caisses en stock** : à définir (stub pour l'instant).
- **Demandes d'achats** : génération d'une "affiche" à envoyer par mail (à définir, stub pour
  l'instant).

Utilisateur unique pour l'instant (l'auteur, développeur freelance), usage quotidien.
Sessions de travail espacées dans le temps → **ce fichier est la mémoire de reprise du projet.**

## Stack technique et décisions d'architecture

- **Framework desktop** : Tauri 2 (backend Rust, webview système — pas de runtime Electron/Chromium embarqué)
- **Frontend** : React 19 + TypeScript, Vite
- **Stockage** : SQLite local (`rusqlite`, feature `bundled` — SQLite compilé depuis les sources,
  aucune dépendance système). Un seul fichier `caisses.sqlite3`, dans un dossier **choisi par
  l'utilisateur au premier lancement** (dialogue natif via `tauri-plugin-dialog`, cf. journal
  2026-07-30) et mémorisé dans `db-location.json` (`app_config_dir()`). Peut pointer vers un
  dossier réseau partagé pour un usage multi-poste — voir avertissement dans "Prochaines étapes"
  sur les risques de corruption SQLite en écriture concurrente sur ce genre de partage.
- **Pas de bouton "Enregistrer"** : chaque action UI (édition, assignation, création) déclenche
  immédiatement l'appel Tauri correspondant et persiste en base.

### Séparation des couches (important pour l'évolutivité multi-utilisateur future)

```
src/
  domain/     → logique métier PURE (calculs volume/poids/taux), types partagés. Aucun accès I/O.
  data/       → SEULE couche autorisée à appeler invoke() vers le backend Tauri.
                Un module par entité (affaires.ts, articles.ts, caisses.ts, demandes.ts).
  hooks/      → orchestration état + appels data/ (useAffaire.ts centralise le state d'une affaire).
  components/ → composants UI purs, ne connaissent que les props qu'on leur passe.
  routes/     → écrans (AffairesList, AffaireDetail, DemandesList), branchent hooks + components.
```

`App.tsx` porte la navigation du menu principal (state `section`, pas de router — même idiome
que `affaireId`/`onOpen`/`onBack` déjà en place pour Simulations) et bascule entre les 4 sections.
"Caisses en stock" et "Demandes d'achats" sont des stubs (`SectionAVenir`) tant que leur contenu
n'est pas défini.

Les composants UI n'appellent **jamais** `invoke()` directement — toujours via `src/data/`.
Cette isolation permettra, plus tard, de remplacer la couche `data/` par des appels HTTP vers
un serveur (mode multi-utilisateur avec droits lecture seule / lecture-écriture) sans toucher
à l'UI ni à la logique de calcul.

**Volumes/poids/taux ne sont pas stockés en base** : recalculés à la volée côté frontend
(`domain/calculs.ts`) à chaque chargement. Le volume du dataset (quelques centaines de lignes
par affaire) rend ça largement suffisant en performance ; évite aussi les risques d'incohérence
de cache qu'un stockage dénormalisé introduirait.

### Rust backend

```
src-tauri/src/
  main.rs        → point d'entrée, appelle lib.rs::run()
  lib.rs         → setup Tauri, enregistrement des commandes, init DB au démarrage
  db.rs          → ouverture connexion SQLite + runner de migrations versionnées au démarrage
  models.rs      → structs serde partagées (Affaire, Caisse, Article, NewArticle, Demande, NewDemande)
  commands/
    affaires.rs  → CRUD affaire
    caisses.rs   → CRUD caisse
    articles.rs  → CRUD article + bulk_create_articles (collage Excel) + assign_articles
    demandes.rs  → CRUD demande + bulk_create_demandes (collage Excel), table indépendante
                   (pas de FK vers affaire — le champ `affaire` est juste un texte libre,
                   la section Demandes ne référence pas les affaires de Simulations)
```

**Système de migrations versionnées** (`db.rs`) : chaque fichier `migrations/000N_*.sql` est
embarqué dans le binaire via `include_str!` et listé dans la constante `MIGRATIONS` de `db.rs`,
dans l'ordre. Au démarrage, une table `_migrations` (nom, date d'application) trace ce qui a
déjà été exécuté ; seules les migrations absentes de cette table sont appliquées, une seule
fois chacune. **Pour toute évolution de schéma : créer un nouveau fichier
`000N_description.sql` (ALTER TABLE de préférence, pas de modification rétroactive d'une
migration déjà publiée) et l'ajouter à la liste `MIGRATIONS` dans `db.rs`.** Ce système a
remplacé un premier jet en `CREATE TABLE IF NOT EXISTS` qui ne migrait pas les bases
existantes lors d'un changement de schéma (voir journal du 2026-07-21).

**Convention de nommage des paramètres de commande** : Tauri convertit automatiquement les noms
de paramètres Rust `snake_case` en `camelCase` côté JS (`seuil_defaut` → `seuilDefaut`). Ça ne
s'applique qu'aux noms de paramètres de commande, pas aux champs internes des structs
sérialisées (ex. `NewArticle.dim1_mm` reste `dim1_mm` en JSON). Voir `src/data/*.ts` pour les
deux conventions utilisées côte à côte.

## Modèle de données

```sql
affaire (id, nom, date_creation, seuil_defaut REAL)

caisse (id, affaire_id, nom, longueur_mm, largeur_mm, hauteur_mm,
        seuil_pct REAL NULL,  -- NULL = hérite du seuil_defaut de l'affaire
        couleur TEXT,         -- hex pastel, attribuée auto à la création (palette round-robin),
                               -- modifiable via un sélecteur visuel dans CaisseCard
        ordre)

article (id, affaire_id, caisse_id NULL,  -- NULL = non assigné, ON DELETE SET NULL
         ar,          -- référence interne (notre code article)
         reference,   -- référence fournisseur
         designation,
         dim1_mm, dim2_mm, dim3_mm, poids_unitaire_kg, quantite,
         ordre)

demande (id,  -- table indépendante, pas de FK — section "Demandes" du menu principal
         ok_pour_passer_cde BOOL, affaire TEXT,  -- "affaire" ici = texte libre, pas de lien vers `affaire.id`
         type_envoi_caisse, type_ouverture, stock,
         longueur_mm, largeur_mm, hauteur_mm, quantite,
         date_picking, date_demandee_s2c,        -- dates saisies en texte libre (pas de type DATE)
         moteurs, module_lineaire, terminaux, traitement, informations_supp,
         cde_passee_affaire BOOL, cde_passee_achat_stock BOOL,
         observations, ordre)

section_lock (section_key TEXT PRIMARY KEY,  -- "demandes" | "stock" | "achats" | "affaire:{id}"
              titulaire, acquis_le, dernier_battement,  -- trigramme + horodatages
              demandeur NULL, demande_le NULL, demande_statut)  -- 'aucune'|'en_attente'|'refusee'
```

Note sur `section_lock` (verrouillage applicatif multi-poste, cf. journal 2026-07-30) : table
générique pour les 4 sections verrouillables (l'écran entier pour Demandes/Stock/Achats, une
affaire précise pour Simulations). Pas de colonne d'expiration stockée — calculée à la volée en
SQL par comparaison de `dernier_battement` à `datetime('now', '-5 minutes')`, pour rester
indépendante de l'horloge d'un poste en particulier au moment de l'écriture. Une ligne n'existe
que si la section a déjà été verrouillée au moins une fois (absence de ligne == libre).

Note sur `demande` : reprend les colonnes du fichier Excel de suivi existant. Les booléens
(`ok_pour_passer_cde`, `cde_passee_affaire`, `cde_passee_achat_stock`) sont stockés en
`INTEGER` (convention SQLite/rusqlite, mappage automatique vers `bool` côté Rust). Le collage
Excel (`PasteImportZoneDemandes`) attend 19 colonnes dans l'ordre du tableau existant et
convertit les cellules "Oui"/"1"/"x"/"vrai" en booléen ; seule la colonne AFFAIRE est requise
pour qu'une ligne soit acceptée.

Note : `ar` (référence interne) et `reference` (référence fournisseur) sont deux champs
distincts et non-uniques individuellement — l'un des deux au moins doit être renseigné pour
qu'une ligne collée soit acceptée. L'ordre des colonnes attendu au collage Excel est :
AR · Référence · Désignation · Dim1 · Dim2 · Dim3 · Poids unit. · Quantité.

Calculs (dans `src/domain/calculs.ts`) :
- `volumeUnitaireM3 = dim1_mm × dim2_mm × dim3_mm / 1e9`
- `volumeInterneM3(caisse) = longueur_mm × largeur_mm × hauteur_mm / 1e9`
- `tauxRemplissage = volumeOccupé / volumeInterne` (peut dépasser 1 → `estSurcharge = true`)
- Niveaux d'alerte caisse : `ok` / `attention` (taux ≥ seuil) / `alerte` (volume dépassé —
  affichage rouge explicite, pas juste un % > 100 silencieux)

## Commandes utiles

```bash
npm install                    # installer les dépendances JS
npm run tauri dev              # lancer l'app en dev (hot reload frontend + backend Rust)
npm run tauri build            # build de production (installeurs MSI + NSIS dans src-tauri/target/release/bundle)
npm run tauri build -- --debug # build debug complet (plus rapide, pour valider que tout compile/bundle)
npx tsc --noEmit               # vérifier les types TypeScript sans build
cd src-tauri && cargo check    # vérifier que le backend Rust compile (rapide, sans lien)
```

### Prérequis machine (déjà installés sur cette machine de dev)

- Rust (rustup, toolchain stable-msvc)
- Visual Studio 2022 Build Tools avec le workload "Desktop development with C++"
  (nécessaire pour `link.exe`/`cl.exe` — le linker MSVC). Sans ça, `cargo build` échoue avec
  `STATUS_DLL_NOT_FOUND`.
- WebView2 runtime (présent par défaut sur Windows 10/11 à jour)

## Journal des étapes

### 2026-07-21 — Setup initial du projet
- Scaffold Tauri 2 + React 19 + TypeScript + Vite via `create-tauri-app`
- Installation de la toolchain complète sur la machine de dev : rustup (stable-msvc) + VS Build
  Tools 2022 (workload C++) via winget — absents au départ, ajout de
  `VC\Tools\MSVC\<version>\bin\Hostx64\x64` au PATH machine pour résoudre `STATUS_DLL_NOT_FOUND`
  au link
- Schéma SQLite (`migrations/0001_init.sql`) : tables `affaire`, `caisse`, `article`
- Backend Rust complet : `db.rs` (init + migration embarquée), `models.rs`, commandes CRUD pour
  affaires/caisses/articles + `bulk_create_articles` (import Excel) + `assign_articles`
  (réassignation avec recalcul implicite côté frontend au reload)
- Couche frontend `domain/` (calculs purs volume/poids/taux + niveaux d'alerte) et `data/`
  (wrapper invoke Tauri, un module par entité)
- Hook `useAffaire` : centralise le state d'une affaire (articles, caisses, calculs dérivés) et
  toutes les actions (CRUD + assignation), recharge tout après chaque mutation
- Écrans : `AffairesList` (liste/création/suppression d'affaires), `AffaireDetail` (tableau
  articles + collage Excel + cartes caisses + dialogue d'assignation)
- Composants : `ArticlesTable` (sélection multiple, édition inline), `PasteImportZone` (parsing
  du texte collé, tabulations = colonnes / retours ligne = lignes, aperçu + rapport d'erreurs
  avant import), `CaisseCard` (affichage + édition dimensions/seuil), `FillRateBadge` (code
  couleur vert/jaune/rouge), `AssignToDialog` ("Assigner à →" caisse existante ou nouvelle)
- Validation : `cargo check` OK, `npx tsc --noEmit` OK, `npm run tauri build -- --debug` produit
  avec succès les deux installeurs (MSI + NSIS). App lancée manuellement : démarrage sans crash,
  fichier `caisses.sqlite3` créé avec le schéma attendu dans `%APPDATA%\com.xan.caisses\`.
  **Non testé : parcours UI complet en interaction réelle** (pas d'outil d'automation UI
  disponible dans l'environnement de dev assisté) — à faire manuellement à la prochaine session.

### 2026-07-21 — Ajout du champ AR (référence interne)
- Retour utilisateur après premier test manuel de la fenêtre de collage : il manquait la
  distinction entre référence interne et référence fournisseur.
- Ajout du champ `ar` (référence interne, "notre" code article) en plus de `reference`
  (référence fournisseur) : migration SQL, `models.rs`, toutes les commandes `articles.rs`
  (create/bulk_create/update), types et couche `data/` frontend, `PasteImportZone` (8 colonnes
  au lieu de 7, AR en première position) et `ArticlesTable` (colonne + édition inline).
- Le champ a d'abord été ajouté directement dans `migrations/0001_init.sql` (base locale ne
  contenant que des données de test) — **bug rencontré en test réel** : l'utilisateur a créé une
  affaire dans l'app déjà lancée (donc sur l'ancienne base, sans colonne `ar`) et obtenu
  "Affaire introuvable" à l'ouverture. Cause : `list_articles` échouait silencieusement sur la
  colonne manquante, ce qui faisait échouer tout le `Promise.all` dans `useAffaire.reload()` et
  empêchait `setAffaire` de s'exécuter. La migration en `CREATE TABLE IF NOT EXISTS` ne modifie
  jamais une table déjà créée, donc relancer l'app sans supprimer le fichier ne suffisait pas.
- **Correctif structurel** : remplacement du système de migration par un vrai runner versionné
  (table `_migrations`, liste ordonnée dans `db.rs::MIGRATIONS`, une seule exécution par
  migration). `ar` est maintenant porté par `migrations/0002_add_article_ar.sql`
  (`ALTER TABLE article ADD COLUMN ar ...`), `0001_init.sql` ne contient plus que le schéma
  d'origine. Ce système évite de refaire ce genre d'incident à la prochaine évolution de schéma.
- `cargo check` et `npx tsc --noEmit` validés après le changement ; vérifié en conditions
  réelles via `cargo run` que les deux migrations s'enregistrent correctement sur une base
  neuve et que la colonne `ar` est bien présente en base.

### 2026-07-24 — Retours utilisateur après premier vrai usage : collage, ergonomie caisses/articles
- **Bug de collage Excel corrigé** : les lignes dont les dernières cellules étaient vides dans
  Excel étaient rejetées à tort ("3 colonnes trouvées, 8 attendues"). Cause : Excel n'émet pas de
  tabulation pour les cellules vides en fin de ligne lors du copier-coller, donc le nombre de
  segments après `split("\t")` était inférieur à 8 alors que la ligne était valide (uniquement
  ses dernières colonnes étaient vides). `PasteImportZone.parseColle` complète maintenant les
  colonnes manquantes en fin de ligne avec des chaînes vides au lieu de rejeter la ligne ; seul
  un excès de colonnes (>8) reste une erreur.
- **Panneau caisses repositionnable** (déjà en place depuis la session précédente, confirmé
  toujours d'actualité) : bouton pour basculer entre colonne à droite (sticky) et bandeau en
  haut, position mémorisée en `localStorage`.
- **Édition inline généralisée** :
  - `CaisseCard` : une caisse nouvellement créée s'ouvre directement en mode édition (prop
    `autoEdit`), plus besoin de cliquer sur "Modifier" pour la première saisie.
  - Les champs de dimensions (`DimensionInput` dans `CaisseCard`) utilisent un state texte
    local initialisé vide (au lieu d'un `<input type=number value={0}>`) pour éviter le "0"
    qui gênait la saisie ; `onFocus` sélectionne aussi tout le contenu existant.
  - `ArticlesTable` : édition cellule par cellule au clic (`Entrée` valide, `Échap` annule),
    le mode "ligne entière + bouton Modifier/OK" a été retiré.
- **Couleur par caisse** : nouveau champ `caisse.couleur` (migration `0003_add_caisse_couleur`),
  attribué automatiquement à la création depuis une palette pastel de 8 teintes en round-robin
  (`PALETTE` dans `commands/caisses.rs`, dupliquée en `src/domain/palette.ts` pour le frontend —
  **garder les deux synchronisées si la palette change**), modifiable via un sélecteur de
  pastilles cliquables dans `CaisseCard` (pas de texte, choix visuel direct). Les lignes du
  tableau d'articles reprennent la couleur de leur caisse d'assignation.
- **Tri des colonnes** : clic sur un en-tête du tableau articles trie croissant/décroissant/
  neutre (3 états, cycle au clic), toutes colonnes confondues (texte, nombre, volume calculé,
  nom de caisse).
- **Bouton "Suppr." retiré de chaque ligne d'article** — sur demande explicite, pas de
  suppression individuelle prévue pour l'instant (le hook `useAffaire.supprimerArticle` reste
  disponible si le besoin revient, juste plus câblé dans `AffaireDetail`).
- **Réassignation/désassignation via case à cocher** : `AssignToDialog` propose maintenant une
  option "— Retirer de la caisse (non assigné) —" en plus des caisses existantes. Comme
  `assign_articles` fait un simple `UPDATE caisse_id = ?`, un article n'est jamais dans deux
  caisses à la fois par construction — aucun changement backend nécessaire pour ce point.
- **Drag & drop article → caisse** : les lignes du tableau sont `draggable` (`ArticlesTable`,
  prop `onDragArticle`), les `CaisseCard` acceptent le drop (`onDropArticle`, surbrillance au
  survol). Orchestré dans `AffaireDetail.handleDropArticle` : si l'article glissé est déjà
  assigné à une autre caisse, une confirmation (`window.confirm`) est demandée avant de
  déplacer ; le glisser-déposer coexiste avec la sélection multiple + "Assigner à →" existante
  (les deux chemins mènent à `assignerArticles`).
- `cargo check` et `npx tsc --noEmit` validés après l'ensemble de ces changements.

### 2026-07-27 — Menu principal à 4 sections + section Demandes

- **Refonte de la navigation** (`App.tsx`) : l'app s'ouvre maintenant sur un menu à 4 boutons
  (Demandes / Simulations / Caisses en stock / Demandes d'achats) plutôt que directement sur
  `AffairesList`. "Simulations" reprend tel quel l'ancien état `affaireId`/`AffairesList`/
  `AffaireDetail` (aucune régression fonctionnelle, juste déplacé sous le menu). "Caisses en
  stock" et "Demandes d'achats" sont des stubs `SectionAVenir` — contenu à définir plus tard,
  cf. leur description dans "Objectif" ci-dessus.
- **Nouvelle entité `demande`**, indépendante des affaires (pas de FK) : reprend les colonnes
  du fichier Excel de suivi apporté par l'utilisateur (captures d'écran). Stack complète créée
  en suivant exactement le patron existant pour `article`/`affaire` :
  - `migrations/0004_add_demande.sql` (`CREATE TABLE demande`, registered dans `db.rs::MIGRATIONS`)
  - `models.rs` : structs `Demande` (retour) / `NewDemande` (payload de création, sans `id`/`ordre`)
  - `commands/demandes.rs` : `list_demandes`, `create_demande`, `bulk_create_demandes`,
    `update_demande`, `delete_demande` — `update_demande` prend tout l'objet `NewDemande` en un
    seul paramètre plutôt que d'éclater chaque champ (plus lisible vu le nombre de colonnes,
    différent de `update_article` qui éclate les champs — à harmoniser si ça devient gênant)
  - `src/domain/types.ts` (`Demande`, `NewDemande`), `src/data/demandes.ts` (wrapper invoke)
  - `src/components/PasteImportZoneDemandes.tsx` : copie de `PasteImportZone.tsx` adaptée aux
    19 colonnes de `demande` (mêmes conventions : complétion des colonnes vides en fin de ligne,
    validation minimale — seule AFFAIRE est requise — parsing booléen souple sur
    "Oui"/"1"/"x"/"vrai")
  - `src/components/DemandesTable.tsx` : copie de `ArticlesTable.tsx` adaptée (édition inline
    cellule par cellule, tri 3-états par colonne mémorisé en `localStorage`, cases à cocher
    directement cliquables pour les 3 champs booléens — pas besoin de passer par le mode
    édition pour ces colonnes-là)
  - `src/routes/DemandesList.tsx` : écran de la section, bouton "+ Ligne manuelle" (insert d'une
    ligne vide éditable directement) + bouton "Coller depuis Excel"
- `cargo check` et `npx tsc --noEmit` validés après l'ensemble de ces ajouts.
- **Non testé : parcours UI réel** (nouveau menu, collage Demandes, édition inline des cases à
  cocher) — même limitation d'environnement que d'habitude, à valider manuellement à la
  prochaine session avec le vrai contenu du fichier Excel de suivi.

### 2026-07-30 — Dossier BDD configurable au premier lancement + auto-update GitHub

- **Contexte** : besoin de distribuer l'app en `.exe` sur un second poste, avec la base de
  données dans un dossier choisi par l'utilisateur (potentiellement un dossier réseau partagé
  pour un usage à plusieurs postes), et de pouvoir pousser des mises à jour sans réinstallation
  manuelle.
- **Dossier BDD configurable** : `Db` passe de `Mutex<Connection>` à `Mutex<Option<Connection>>`
  (`db.rs`) pour permettre l'enregistrement de toutes les commandes Tauri avant que le chemin de
  la base ne soit connu. `db::init(app_data_dir)` devient `db::open_at(db_folder: &Path)`
  (logique interne inchangée : create_dir_all, ouverture, pragma, migrations). Nouveau module
  `config.rs` (lecture/écriture de `db-location.json` dans `app_config_dir()` — nécessairement
  séparé du dossier BDD lui-même puisqu'il faut le lire avant de savoir où est la base). Nouvelles
  commandes (`commands/setup.rs`) : `get_db_status`, `choose_db_folder` (dialogue natif via
  `tauri_plugin_dialog::DialogExt::blocking_pick_folder`), `set_db_folder`, `init_db`. Côté
  frontend : `src/data/setup.ts`, `hooks/useDbSetup.ts` (state machine
  checking/needs-setup/ready/error), `components/FirstLaunchSetup.tsx` (écran plein-écran
  bloquant tant qu'aucun dossier n'est choisi), branché en tête de `App.tsx`. Un dossier déjà
  occupé par un `caisses.sqlite3` existant (réinstallation, pointage vers une base partagée) est
  géré gratuitement par les migrations idempotentes existantes.
- **Passe mécanique sur les 24 sites `db.0.lock()`** dans `commands/{affaires,articles,caisses,
  demandes,caisse_stock}.rs` : chaque site ajoute `guard.as_ref().ok_or("base de données non
  initialisée")?` (ou `.as_mut()` pour les 3 sites transactionnels : `create_article`,
  `bulk_create_articles`/`bulk_create_demandes`, `assign_articles`).
- **Auto-update** : `tauri-plugin-updater` + `tauri-plugin-process` (Rust et JS). Vérification
  automatique au démarrage (`hooks/useUpdateCheck.ts`, une fois le dossier BDD résolu), overlay
  de confirmation custom (`components/UpdateAvailableDialog.tsx`, dialogue natif du plugin
  désactivé via `"dialog": false`) avant téléchargement/installation/relance
  (`data/updater.ts`). Endpoint GitHub Releases dans `tauri.conf.json`
  (`plugins.updater.endpoints`) : `https://github.com/jcMilliot/Caisses/releases/latest/download/latest.json`.
  **Piège rencontré** : `bundle.createUpdaterArtifacts: true` est nécessaire dans
  `tauri.conf.json` pour que `tauri-action`/`tauri build` génère `latest.json` et les fichiers
  `.sig` — sans ce flag, le build produit l'installeur mais pas les artefacts updater, et
  l'auto-update échoue silencieusement. La release `v0.2.0` (premier tag) a été publiée sans ce
  flag et est restée incomplète (assets manquants) ; corrigé et retesté avec succès sur `v0.2.1`.
- **CI/CD** : `.github/workflows/release.yml`, déclenché sur push d'un tag `v*`, build Windows
  uniquement (`windows-latest`, pas de matrice multi-OS), via `tauri-apps/tauri-action`. Publie
  une release GitHub en **brouillon** (`releaseDraft: true`) — validation et publication
  manuelles par l'utilisateur à chaque fois, pas d'auto-publish. Secrets requis :
  `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (clé générée via
  `tauri signer generate`, jamais commitée — `*.key`/`*.key.pub` ajoutés au `.gitignore` après
  qu'un dossier `chemin/vers/caisses.key` littéral se soit retrouvé par erreur à la racine du
  projet suite à un exemple de commande mal interprété ; clé déplacée vers `~/.tauri/`).
- **Dépôt GitHub** : `jcMilliot/Caisses`, public (décision utilisateur — pas de token à gérer
  côté poste client pour télécharger les releases ; aucune donnée client n'est jamais commitée,
  seul le code l'est). Le dépôt existait déjà côté GitHub avec un commit initial (`README.md`
  auto-généré) au moment du premier push — fusionné avec `--allow-unrelated-histories -X ours`
  pour conserver le README local (template `create-tauri-app`) plutôt que le titre seul.
- Convention de version : `tauri.conf.json`, `package.json` et `Cargo.toml` bumpés ensemble, tag
  `v{version}` correspondant.
- Build de test local (`npm run tauri build -- --debug`) et cycle complet réel (tag → CI →
  release brouillon → publication manuelle) validés de bout en bout sur `v0.2.1`.

### 2026-07-30 — Verrouillage applicatif par section/affaire (multi-poste)

- **Contexte** : suite à la mise en place du dossier BDD réseau partagé (session précédente le
  même jour), risque de corruption SQLite si deux postes écrivent en même temps. Décision de
  mitiger par un verrouillage applicatif ("qui a la main") plutôt que de construire tout de suite
  un vrai serveur central. Portée actée avec l'utilisateur : verrou sur l'écran entier pour
  Demandes/Caisses en stock/Demandes d'achats, verrou par affaire précise pour Simulations —
  jamais plus fin. Pris à l'ouverture (écriture par défaut), libéré en quittant l'écran, après 5
  min d'inactivité, ou via une demande explicite ("demander le crayon") approuvée/refusée par le
  titulaire actuel. Synchronisation par polling (7s), pas de serveur temps réel. **Pas de
  redirection forcée** en cas de perte de la main : l'écran reste ouvert, bascule juste en lecture
  seule sur place (brouillon `DemandesList` conservé mais figé, pas de perte de données).
- **Modèle** : une seule table générique `section_lock` (`migrations/0007_add_section_lock.sql`,
  voir "Modèle de données" ci-dessus) — `section_key` encode la portée
  (`"demandes"`/`"stock"`/`"achats"`/`` `affaire:{id}` ``), évite une FK obligatoire vers `affaire`
  puisque 3 des 4 sections n'ont pas de ligne associée.
- **Backend** (`commands/locks.rs`) : `acquire_lock` atomique via un seul
  `INSERT ... ON CONFLICT(section_key) DO UPDATE ... WHERE` (idempotent si même titulaire, ou si
  le verrou existant est périmé) — élimine la course "deux postes ouvrent la même affaire jamais
  verrouillée en même temps" sans lecture préalable côté application. `heartbeat(renew: bool)`
  fait à la fois office de poll (état courant) et de "preuve de vie" : `renew=false` quand le
  client détecte une inactivité locale, pour que l'expiration corresponde à une vraie inactivité
  utilisateur et pas juste "écran resté ouvert". `request_pen`/`respond_pen_request` pour la
  demande/réponse de crayon, `list_locks` en un seul appel batch (pas de N+1) pour les badges de
  `AffairesList`.
- **Frontend** : hook générique `hooks/useSectionLock.ts` (acquire au montage, release au
  démontage via un `ref` pour éviter la closure périmée dans le cleanup — même pattern que
  `brouillonRef`/`demandesRef` déjà en place dans `DemandesList.tsx`), polling 7s, détection
  d'activité `window` (`mousemove`/`keydown`/`click`) pour piloter `renew`. Composant partagé
  `components/LockBanner.tsx` (bandeau "verrouillé par XYZ" + bouton "Demander le crayon", ou
  bannière d'approbation si une demande est entrante) réutilisé par les 3 écrans concernés.
  Chaque écran/composant de table (`ArticlesTable`, `DemandesTable`, `CaisseCard`) reçoit une
  prop `readOnly` qui désactive les actions d'écriture (édition inline, drag & drop, boutons
  Créer/Modifier/Supprimer) sans changer leur state local — pas de remaniement structurel.
- **Identité trigramme** : fichier séparé `user_config.rs`/`user-identity.json` (délibérément
  distinct de `db-location.json` — cycles de vie différents, le trigramme est per-poste et sera
  probablement remplacé par un vrai système de comptes plus tard, sans toucher au choix de
  dossier). Écran `TrigrammeSetup.tsx` au premier lancement, gating séquentiel dans `App.tsx`
  après celui du dossier BDD (`useDbSetup` puis `useUserSetup`). `trigramme` passé en prop directe
  aux 3 routes consommatrices (pas de context, cohérent avec le reste du code).
- Validation : `cargo check`, `npx tsc --noEmit` et `npm run tauri build -- --debug` (bundle
  complet) tous passés avec succès. **Non testé : scénario réel à deux postes/instances**
  (acquisition/libération, timeout d'inactivité, demande de crayon, course à la première
  acquisition) — le plan de test détaillé (deux `npm run tauri dev` pointées vers le même dossier,
  trigrammes différents) reste à exécuter manuellement à la prochaine session.
- **Risques connus, actés avec l'utilisateur** (non bloquants) : dérive d'horloge entre postes
  (l'expiration est évaluée par l'horloge du poste appelant, pas une horloge serveur centrale) ;
  perte de connexion réseau pendant qu'un poste tient un verrou → bloqué jusqu'à expiration des 5
  minutes, aucune détection précoce ; une demande de crayon reste "en_attente" indéfiniment si le
  titulaire ne poll plus (pas d'auto-expiration de la demande elle-même dans cette itération).

## Prochaines étapes

1. **Tester manuellement en conditions réelles** la nouvelle section Demandes (collage Excel
   19 colonnes, édition inline, cases à cocher, tri) et la navigation par menu — même limitation
   que précédemment : pas d'outil d'automation UI dans l'environnement de dev assisté.
2. Ajouter `@tauri-apps/plugin-dialog` côté JS si on veut remplacer les `window.confirm()`
   actuels (suppression affaire/caisse/demande, confirmation de déplacement drag & drop) par des
   dialogues natifs Tauri — le plugin Rust est déjà présent (`tauri-plugin-dialog` dans
   `Cargo.toml`) mais pas encore utilisé côté frontend.
3. Définir le contenu de "Caisses en stock" (actuellement un stub).
4. Définir le contenu et le mode d'envoi de "Demandes d'achats" (génération de l'affiche +
   envoi par mail, actuellement un stub).
5. Export/impression d'un récapitulatif d'affaire (explicitement hors v1, mentionné par
   l'utilisateur pour plus tard).
6. Icônes de l'app (`src-tauri/icons/`) — actuellement les icônes par défaut de `create-tauri-app`.
7. Réfléchir à un identifiant d'app plus définitif que `com.xan.caisses` si distribution au-delà
   de la machine de l'auteur.
8. **⚠️ Risque connu — dossier BDD réseau partagé** : décision utilisateur (2026-07-30) d'utiliser
   un dossier réseau partagé pour `caisses.sqlite3` afin que plusieurs postes travaillent sur les
   mêmes données. SQLite n'est pas conçu pour des écritures concurrentes fiables sur un partage
   réseau (SMB/CIFS) — verrouillage fichier peu fiable dans ce contexte, risque de corruption
   silencieuse du fichier en cas d'écritures simultanées depuis deux postes. Accepté
   temporairement par l'utilisateur en attendant un vrai système de verrouillage applicatif (voir
   point suivant). **Recommandation en attendant** : éviter d'éditer la même affaire depuis deux
   postes en même temps, et mettre en place une sauvegarde régulière (voir point 10 ci-dessous).
9. **Verrouillage par section/affaire (multi-poste)** — **implémenté le 2026-07-30** (voir journal
   ci-dessus, table `section_lock`, `commands/locks.rs`, `hooks/useSectionLock.ts`), mais **non
   testé en conditions réelles à deux postes/instances**. À faire à la prochaine session : exécuter
   le plan de test décrit dans le journal (deux `npm run tauri dev` pointées vers le même dossier
   BDD, trigrammes différents — acquisition/libération, timeout d'inactivité réduit pour le test,
   demande/approbation/refus de crayon, course à la première acquisition sur une affaire jamais
   verrouillée). Pas d'auto-expiration de la demande de crayon elle-même si le titulaire arrête de
   poller — à reconsidérer si ça devient gênant en usage réel. Si le besoin de temps réel/fiabilité
   dépasse ce que permet le polling, le bon moment pour introduire le petit serveur HTTP déjà
   anticipé par la séparation `data/` (cf. section Architecture).
10. **Sauvegarde régulière de `caisses.sqlite3`** — pas encore mise en place. Tant que le
    verrouillage par affaire (point 9) n'existe pas et que la base peut vivre sur un dossier
    réseau partagé (point 8), une copie de sauvegarde à intervalle régulier vers un autre
    emplacement (pas le même dossier/serveur, pour survivre à une panne du partage lui-même) est
    nécessaire. Fréquence à définir avec l'utilisateur — pas encore tranché : candidats évidents
    quotidien ou hebdomadaire selon le volume réel de saisie. Pourrait être un simple script/tâche
    planifiée Windows dans un premier temps, ou une fonctionnalité intégrée à l'app plus tard
    (bouton "Sauvegarder maintenant" + copie automatique périodique).
