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
  main.rs           → point d'entrée, appelle lib.rs::run()
  lib.rs            → setup Tauri, enregistrement des commandes, migration one-shot de config, init DB
  db.rs             → ouverture connexion SQLite + runner de migrations versionnées au démarrage
  config.rs         → db-location.json (dossier BDD) + migrate_from (récup depuis ancien identifiant)
  user_config.rs    → user-identity.json (trigramme) + migrate_from
  models.rs         → structs serde partagées (Affaire, Caisse, Article, NewArticle, Demande,
                      NewDemande, CaisseStock, DemandeCaisse, section_lock…)
  commands/
    affaires.rs       → CRUD affaire
    caisses.rs        → CRUD caisse (+ type_envoi_caisse, contre_plaque, link_caisse_demande_caisse)
    articles.rs       → CRUD article + bulk_create_articles (collage Excel) + assign_articles
    demandes.rs       → CRUD demande + bulk_create_demandes (collage Excel) + set_demande_validee,
                        table indépendante (pas de FK vers affaire — `affaire` = texte libre)
    demande_caisse.rs → CRUD sous-caisses d'une demande (multi-caisses par demande)
    caisse_stock.rs   → CRUD caisses en stock + transfer + set_caisse_stock_validee
    journal.rs        → journal d'audit : journaliser() appelé par les commandes concernées +
                        list_journal / peut_lire_journal (lecture réservée au trigramme AJC)
    locks.rs          → verrouillage applicatif multi-poste (acquire/release/heartbeat/
                        request_pen/respond_pen_request/list_locks + require_lock)
    options_liste.rs  → valeurs personnalisées des listes déroulantes Demandes (moteurs /
                        module_lineaire / terminaux) — list/create/rename/count_usage/delete ;
                        rename_option_liste répercute la nouvelle valeur sur demande /
                        demande_caisse (transaction)
    setup.rs          → get_db_status / choose_db_folder / set_db_folder / init_db
    user.rs           → get_user_status / set_trigramme
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

État au 2026-09-02 : migrations `0001` à `0020` (dernière : `0020_add_caisse_demande_id.sql` ;
pas de `0019_reorder` — supprimé avant publication, cf. journal des listes).
Note : `option_liste.ordre` n'est plus un ordre d'affichage — les listes déroulantes sont
triées côté frontend par `demandeOptions.ts::comparerOption` (quantité de tête puis n° de
référence, ex. `1 MOTEUR` < `2 MOTEURS` < `10 MOTEURS` ; `1 FESTO 426` < `1 FESTO 485` <
`2 FESTO 494`). Vaut aussi pour les valeurs ajoutées ensuite via « Gérer les références ».
Le dossier `migrations/` est **à la racine du repo** (pas sous `src-tauri/`) — `db.rs` y accède
via `include_str!("../../migrations/…")`.

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
        type_envoi_caisse TEXT,       -- ajouté 0014 (standard / 4B / 4C…)
        demande_caisse_id INTEGER NULL,  -- 0014, lien vers une SOUS-caisse de demande
        demande_id        INTEGER NULL,  -- 0020, lien vers la ligne de demande dont la caisse
                                          --   MÈRE est issue (synchro dims fiable même renommée)
        caisse_stock_id   INTEGER NULL,  -- 0011, lien vers une caisse en stock
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
         validee BOOL,          -- 0005, demande validée (mécanisme "Livré/Rapatriée")
         contre_plaque BOOL,    -- 0015
         caisse_stock_id INTEGER NULL,  -- 0011
         observations, ordre)

demande_caisse (id, demande_id NOT NULL REFERENCES demande ON DELETE CASCADE,  -- 0008
         -- sous-caisses d'une demande (multi-caisses par demande) ; mêmes colonnes que `demande`
         nom, type_envoi_caisse, type_ouverture, stock, traitement,
         date_picking, date_demandee_s2c, quantite,
         longueur_mm, largeur_mm, hauteur_mm, poids_kg,
         moteurs, module_lineaire, informations_supp, observations,
         cde_passee_affaire BOOL, cde_passee_achat_stock BOOL, contre_plaque BOOL,
         caisse_stock_id INTEGER NULL, ordre)

caisse_stock (id, nom, longueur_mm, largeur_mm, hauteur_mm, quantite, observations,  -- 0006
         affaire_id INTEGER NULL REFERENCES affaire ON DELETE SET NULL,
         validee BOOL,                    -- 0012
         demandeur, demande_le, demande_statut,  -- 0012, 'aucune'|'en_attente'|… (réaffectation)
         demande_affaire_cible_id INTEGER NULL, demande_cible_id INTEGER NULL,  -- 0013
         ordre, date_creation)

section_lock (section_key TEXT PRIMARY KEY,  -- "demandes" | "stock" | "achats" | "affaire:{id}"
              titulaire, acquis_le, dernier_battement,  -- trigramme + horodatages
              demandeur NULL, demande_le NULL, demande_statut)  -- 'aucune'|'en_attente'|'refusee'

journal (id, horodatage, trigramme, action, entite, entite_id NULL, details)  -- 0019
         -- journal d'audit des actions à effet fort. `action` ∈ 'creation' | 'suppression' |
         -- 'modification_dimensions' | 'reference_ajout' | 'reference_modification' |
         -- 'reference_suppression'. `entite` ∈ 'demande' | 'demande_caisse' | 'option_liste'.
         -- Écriture par journaliser() (best-effort, jamais bloquant) ; lecture (list_journal)
         -- réservée au trigramme AJC — identité = trigramme déclaratif, pas une preuve.

option_liste (id, liste TEXT, valeur TEXT, ordre, UNIQUE(liste, valeur))  -- 0016 + seed 0017
         -- valeurs des listes déroulantes de la section Demandes ; `liste` ∈ 'moteurs' |
         -- 'module_lineaire' | 'terminaux'. Depuis 0017 TOUT vit ici (les anciennes valeurs
         -- "de base" 1..10 MOTEURS / TERMINAUX y ont été seedées) — plus de socle codé en dur,
         -- tout est modifiable / supprimable via l'outil « Gérer les références ».
         -- 0017 seede moteurs (1..10) + terminaux (1..10) ; 0018 seede `module_lineaire`
         -- (18 modules FESTO fournis le 2026-09-01, libellé complet avec dimensions
         -- informatives entre parenthèses). Migration séparée car 0017 était déjà appliquée
         -- sur les bases de dev sans ces valeurs.
```

Note sur `section_lock` (verrouillage applicatif multi-poste, cf. journal 2026-07-30) : table
générique pour les 4 sections verrouillables (l'écran entier pour Demandes/Stock/Achats, une
affaire précise pour Simulations). Pas de colonne d'expiration stockée — calculée à la volée en
SQL par comparaison de `dernier_battement` à `datetime('now', '-5 minutes')`, pour rester
indépendante de l'horloge d'un poste en particulier au moment de l'écriture. Une ligne n'existe
que si la section a déjà été verrouillée au moins une fois (absence de ligne == libre).
Depuis le 2026-09-01, `SELECT_COLS` expose aussi `demande_expiree` : une demande de crayon
restée `en_attente` >= 90 s ALORS QUE le titulaire ne bat plus non plus depuis >= 90 s → le
demandeur reprend la main automatiquement via `claim_expired_pen` (`useSectionLock` l'appelle au
tick de poll suivant), sans attendre les 5 min d'expiration du verrou. Les 90 s laissent à un
titulaire réellement présent le temps de voir la bannière et de répondre.

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

## Distribution et releases

L'app est installée sur au moins deux postes (voir journal 2026-07-30, dossier BDD/auto-update).
Les changements poussés sur `main` ne sont **pas** automatiquement visibles sur ces postes : il
faut bump la version (`tauri.conf.json` + `package.json` + `Cargo.toml`, ensemble), pousser un
tag `vX.Y.Z`, laisser le workflow GitHub Actions builder, puis **publier manuellement** la
release en brouillon sur GitHub — c'est seulement à ce moment que l'auto-update des postes
installés détecte la nouvelle version à leur prochain démarrage.

**Convention de rythme** (actée avec l'utilisateur le 2026-07-30) : ne jamais tagger/publier de
release de sa propre initiative en cours de session. À la fin d'un bloc de travail terminé et
validé (`cargo check` + `npx tsc --noEmit` + build de test OK), **proposer** à l'utilisateur de
créer une release — lui reste décisionnaire à chaque fois, mais c'est à l'assistant de penser à
le proposer plutôt que d'attendre que l'utilisateur y pense.

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
  complet) tous passés avec succès.
- **Risques connus, actés avec l'utilisateur** (non bloquants) : dérive d'horloge entre postes
  (l'expiration est évaluée par l'horloge du poste appelant, pas une horloge serveur centrale) ;
  perte de connexion réseau pendant qu'un poste tient un verrou → bloqué jusqu'à expiration des 5
  minutes, aucune détection précoce ; une demande de crayon reste "en_attente" indéfiniment si le
  titulaire ne poll plus (pas d'auto-expiration de la demande elle-même dans cette itération).

### 2026-07-31 — Test réel à deux postes + verrouillage appliqué au backend (pas seulement l'UI)

- **Test du scénario multi-poste exécuté avec succès** : deux instances `npm run tauri dev`
  isolées (dossiers `APPDATA`/copie de repo/ports Vite distincts pour simuler deux postes sur
  la même machine), pointées vers un même dossier BDD partagé, trigrammes différents. Timeouts
  de verrou temporairement réduits pendant le test (12s/15s au lieu de 5 min), remis à leur
  valeur normale ensuite. Acquisition/libération, expiration par inactivité et affichage du
  badge "verrouillée par XYZ" dans `AffairesList` validés en conditions réelles.
- **Bug repéré pendant le test** : le bouton "Supprimer" dans `AffairesList` (écran de liste,
  avant même d'ouvrir une affaire) n'était bloqué par aucune vérification — une affaire
  verrouillée par un autre poste pouvait être supprimée depuis la liste. Plus largement,
  **aucune commande Rust ne vérifiait le verrou avant d'écrire** : jusqu'ici la protection
  multi-poste reposait entièrement sur le `readOnly` côté frontend (désactivation de boutons),
  ce qui n'aide pas pour un écran comme `AffairesList` qui n'est pas lui-même verrouillé.
- **Correctif structurel** : nouvelle fonction `require_lock(conn, section_key, trigramme)`
  dans `commands/locks.rs`, appelée en tête de **toutes** les commandes de mutation
  (`create`/`update`/`delete`/`assign`/`set_*`) sur affaires, caisses, articles, demandes et
  caisses en stock — pas seulement les suppressions. Sémantique retenue : refuse l'action
  seulement si la ressource est *activement* détenue par un **autre** titulaire (verrou non
  expiré) ; une ressource jamais verrouillée (ex. suppression depuis `AffairesList` sans avoir
  ouvert l'affaire) ou dont le verrou a expiré reste autorisée — pas besoin d'acquérir le verrou
  au préalable pour agir. Pour les commandes qui ne reçoivent qu'un `id` de ligne (article,
  caisse), l'`affaire_id` propriétaire est résolue côté Rust par une sous-requête
  (`require_lock_for_article`/`require_lock_for_caisse`) plutôt que transmise par le frontend.
  `assign_articles` ne vérifie que l'affaire du premier article de la liste (l'UI ne mélange
  jamais plusieurs affaires dans un seul appel). Toutes les commandes concernées prennent
  désormais un paramètre `trigramme` supplémentaire ; tous les modules `data/*.ts` et leurs
  appelants (`useAffaire`, `AffairesList`, `DemandesList`, `CaissesStockList`, `App.tsx`) mis à
  jour en conséquence. Côté UI, `AffairesList` désactive maintenant aussi le bouton Supprimer
  quand l'affaire est verrouillée par un autre trigramme (pas seulement un blocage silencieux
  côté backend).
- Portée volontairement limitée aux mutations d'écriture (pas de verrouillage plus fin, pas de
  système de droits/permissions par utilisateur — **noté comme évolution future**, cf.
  "Prochaines étapes").
- `cargo check`, `npx tsc --noEmit` et `npm run tauri build -- --debug` validés après le
  correctif.

## Prochaines étapes

### Fait

- **Verrouillage applicatif multi-poste — complet** : table `section_lock`,
  `commands/locks.rs::require_lock` sur toutes les mutations, `hooks/useSectionLock.ts` (polling
  7 s, détection d'activité). Testé à deux postes le 2026-07-31. Auto-expiration de la demande
  de crayon ajoutée le 2026-09-01 (`demande_expiree` + `claim_expired_pen`, seuil 90 s). Les
  seuls « restes » sont des choix assumés, pas des bugs (dérive d'horloge entre postes,
  pas de droits par utilisateur — cf. « À réfléchir plus tard »).
- **Journal d'audit** — implémenté le 2026-09-02 (`commands/journal.rs`, migration `0019`,
  route `src/routes/Journal.tsx`). Périmètre restreint (décision utilisateur) :
  création/suppression de caisse (`demande`) et sous-caisse (`demande_caisse`), modification
  des dimensions d'une caisse depuis Demandes, ajout/renommage/suppression de référence
  (`option_liste`). `journaliser()` appelé dans les commandes concernées, dans la même
  transaction quand il y en a une, best-effort (une erreur d'écriture du journal ne fait jamais
  échouer l'action métier). Identité = trigramme déclaratif (pas d'auth). Consultation réservée
  au trigramme **AJC** (garde côté `list_journal` + entrée de menu masquée sinon). **Rétention
  2 mois** : trigger `trg_journal_purge` AFTER INSERT + purge au démarrage dans `db.rs`. Pour
  élargir le périmètre : `journaliser(...)` dans la commande visée + libellé dans `Journal.tsx`.
- **Contenu de "Caisses en stock"** : `src/routes/CaissesStockList.tsx` est un CRUD complet
  (nom/dimensions/quantité/observations, édition inline, verrouillage, suppression), ce n'est
  plus un stub. Vérifié le 2026-08-25.
- **Contenu et génération des affiches "Demandes d'achats"** : `src/routes/DemandesAchatsList.tsx`
  + `src/components/AfficheCaisseCard.tsx` génèrent les affiches et permettent de les copier
  (texte/image presse-papiers, `handleCopier`). L'envoi reste un copier-coller manuel dans le
  mail — voir les points "À faire" sur les affiches ci-dessous qui affinent ce flux. Vérifié le
  2026-08-25.
- **Identifiant d'app définitif** : `src-tauri/tauri.conf.json` utilise `"com.caisses.app"`
  (au lieu de `com.xan.caisses`). Vérifié le 2026-08-25. Ce changement d'identifiant déplace le
  dossier `%APPDATA%\<identifier>` : au premier démarrage sur la version 0.5.0, `lib.rs::setup()`
  fait une **migration one-shot** best-effort — si `db-location.json` / `user-identity.json`
  n'existent pas dans le nouveau dossier mais sont présents dans l'ancien `com.xan.caisses`, ils
  sont recopiés (`config::migrate_from` / `user_config::migrate_from`). L'ancien dossier n'est
  jamais modifié ; en cas d'échec on retombe sur le choix manuel du dossier BDD comme au premier
  lancement.
- **Verrouillage par section/affaire (multi-poste)** — implémenté le 2026-07-30, testé en
  conditions réelles à deux postes/instances et durci côté backend le 2026-07-31 (voir journal
  ci-dessus : table `section_lock`, `commands/locks.rs::require_lock`, `hooks/useSectionLock.ts`).
  Restes connus listés dans "À faire" (auto-expiration de la demande de crayon, droits par
  utilisateur).
- **Page d'accueil en cards + blocs "caisses à commander/à rapatrier"** — implémenté le
  2026-08-03. Nouvelle route `src/routes/Accueil.tsx` (section `"accueil"`, écran par défaut au
  démarrage dans `App.tsx`), menu principal sous forme de 4 cards (grille 2×2) au lieu de boutons
  de navbar ; la navbar classique ne s'affiche plus que sur les autres sections (bouton
  "← Accueil" ajouté pour y revenir). À droite, séparés par un liseret, deux blocs calculés à
  partir de `demandesApi.list()` (logique pure dans `src/domain/caissesACommander.ts`) :
  - **"Caisses à commander cette semaine"** : demandes avec `stock` vide dont la commande doit
    partir cette semaine calendaire — règle actée avec l'utilisateur : on commande la semaine
    calendaire précédant celle du picking (fermeture le week-end, donc semaine complète d'avance).
  - **"Caisses à rapatrier cette semaine"** : demandes avec `stock` renseigné (caisse déjà en
    stock à faire revenir) — règle : si `date_picking` tombe un lundi, rapatrier la semaine
    calendaire d'avant ; sinon la semaine calendaire du picking suffit.
  - Ces deux blocs ne modifient ni ne consultent la table `affaire`/`caisse` de Simulations —
    uniquement `demande`, conformément à la réponse de l'utilisateur sur la source des données.
  - Cas ACHSTOCK sur la page d'accueil : toujours exclu de ces deux blocs (`estAchstock` dans
    `caissesACommander.ts`) — traité différemment dans Demandes d'achats (voir ci-dessous), pas
    ici (pas de date de picking à positionner dans le temps pour ces lignes).
- **Multi-caisses et affiches (section Demandes d'achats)** — implémenté le 2026-08-26, vérifié
  et confirmé par l'utilisateur le 2026-08-28 :
  - **Validation en cascade caisse mère → caisses filles** : `DemandesList.handleValider` applique
    aussi `observations = "Livré"/"Rapatriée"` à toutes les sous-caisses (`demande_caisse`) d'une
    demande mère validée — fonction `estDemandeCaisseValidee()` (`domain/demandeOptions.ts`),
    réutilise le même mécanisme texte que la mère (pas de nouvelle colonne DB). `construireAffiches`
    (`domain/affiches.ts`) exclut les sous-caisses validées de la même façon que la mère, et
    `DemandesTable` colore leur ligne en vert pastel comme la mère.
  - **Code couleur des affiches** : pastille + bordure gauche colorée sur chaque carte
    (`AfficheCaisseCard`), reprenant la couleur du rendu HTML de l'affiche (`couleurAffiche()`),
    avec libellé `libelleCategorie()`. Couleurs fixées avec l'utilisateur le 2026-08-31
    (`COULEUR_AFFICHE` dans `domain/affiches.ts`) : Standard `#99ccff`, 4B `#dbf9e7`, 4C
    `#a7e0e0` ; `accentAffiche()` (bordure basse de l'en-tête HTML) réaligné sur des teintes plus
    soutenues des mêmes couleurs.
  - **Icône déroulant multi-caisses grossie** : chevron `▸`/`▾` dans `DemandesTable` passé de 11px
    à 18px avec plus de padding cliquable.
  - **Taille des affiches réduite au collage** : gabarit HTML resserré (`max-width` 620px→440px)
    dans `rendreAfficheHtml`, capture `html-to-image` en `pixelRatio: 1.2`. **Bug corrigé en cours
    de route** : le conteneur capturé (`apercuRef`) avait un `minWidth: 480` alors que l'affiche
    fait 440px max — ce vide se retrouvait capturé comme fond hors-cadre une fois collé. Retiré.
  - **Mesures max 4C** : alerte non bloquante (⚠️ + tooltip) `depassementMesuresMax4C()`
    (`domain/demandeOptions.ts`, seuils `MESURES_MAX_4C_MM` 2.22 × 0.80 × 0.80 m) sur les colonnes
    de dimensions dans `DemandesTable`, ligne mère et sous-lignes.
  - **Texte d'accompagnement mail + mention soudure 4C + regroupement par type** :
    `texteIntroductionMail()` et `MENTION_SOUDURE_4C` (`domain/affiches.ts`). Un seul "Bonjour,
    merci de..." en tête de la copie groupée (`DemandesAchatsList.handleCopierSelection`), affiches
    regroupées par `categorieEnvoi()` dans un ordre fixe standard → 4B → 4C, la mention soudure/
    fermeture n'apparaît qu'une fois juste avant le bloc 4C (après les autres types s'il y en a).
    Même logique simplifiée en copie individuelle (`AfficheCaisseCard.handleCopier`).
  - **Bug de fiabilité corrigé** : `capturerPng` échouait silencieusement (blob raté, absorbé par
    un `catch` muet) quand appelé juste après le montage d'une carte, avant que le `<img>` du logo
    (base64 injecté via `dangerouslySetInnerHTML`) n'ait fini de décoder — la copie groupée se
    retrouvait alors sans aucune image. Corrigé par `attendreImagesDecodees()` (attend
    `img.decode()` sur les images du conteneur avant capture) + une retentative automatique.
  - `npx tsc --noEmit` validé après l'ensemble ; aucun fichier Rust touché, pas de migration.
- **Cas ACHSTOCK dans Demandes d'achats** — implémenté le 2026-08-28. Une demande ACHSTOCK
  (`estDemandeAchstock()`, `affaire` contient "ACHSTOCK") n'a pas de dimensions à fabriquer et ne
  génère donc plus de carte d'affiche (exclue dans `construireAffiches`). Elle apparaît à la place
  dans un panneau dédié "ACHSTOCK — caisses en stock à commander" (`DemandesAchatsList`, liste
  `demandesAchstockAEnvoyer()`) : une ligne compacte par référence `stock` (`AR_CAISS_XXXXX`),
  sélection partagée avec les affiches classiques via des clés `achstock:{id}` dans le même Set.
  À la copie groupée, le bloc ACHSTOCK (`rendreBlocAchstock()` — référence / Qté / Affaire / Délais
  par ligne) est toujours placé en dernier, précédé de "Ainsi que :" s'il y a aussi des affiches
  classiques sélectionnées ; sinon l'intro générique bascule sur "Merci de bien vouloir passer
  commande..." plutôt que "prévoir la fabrication..." (`texteIntroductionMail(qte, seulementAchstock)`).
- **Tableau Demandes — tri par défaut et filtrage progressif** — implémenté le 2026-08-28.
  - Tri par défaut `date_picking` décroissante à l'arrivée sur l'écran (`TRI_PAR_DEFAUT` dans
    `DemandesTable.tsx`), actif tant que l'utilisateur n'a jamais choisi un tri lui-même (son choix,
    sauvegardé en `localStorage`, reste toujours prioritaire une fois défini).
  - Filtrage progressif de la sélection dans `ColumnFilterMenu` : taper dans la recherche recale
    maintenant `selectionLocale` sur les seules valeurs correspondant au filtre courant au fil de
    la frappe (`changerRecherche()`), sans devoir cliquer "Tout désélectionner" en plus avant de
    valider.

- **Section Demandes — édition inline, sous-caisses en brouillon, listes déroulantes, options
  personnalisées** — implémenté le 2026-08-31 (`DemandesTable.tsx`, `DemandesList.tsx`,
  `App.tsx`, back `commands/options_liste.rs` + migration `0016`) :
  - **Triangle 4C** : le ⚠ de `depassementMesuresMax4C` s'affiche en rouge (`--danger-text`,
    ~+2px) au lieu d'orange, pour le distinguer de l'avertissement mousse 4C.
  - **Pop-up « quitter sans enregistrer ? »** : `DemandesList` remonte `modifie` à `App` via
    `onDirtyChange` ; `App.confirmerSortieDemandes()` intercepte navigation menu / « ← Accueil »
    / « Simuler l'affaire » quand des modifs sont en cours (le garde `beforeunload` natif reste).
  - **Option « Tableau inversé »** (menu Options, `localStorage` `caisses:inverse:demandes`) :
    anciens en haut / récents en bas + scroll auto en bas à l'activation ; n'affecte que
    l'ordre d'affichage (la liste triée est juste retournée).
  - **Sous-caisses créables avant enregistrement** : sur une demande brouillon (`id < 0`),
    « Créer une nouvelle caisse » ajoute une sous-caisse **brouillon** (id temporaire négatif,
    `demande_id` = id temporaire de la mère) ; `handleEnregistrer` les persiste après
    `bulkCreate` en reliant chaque id temporaire à l'id réel (mapping par ordre). Annuler /
    supprimer la mère retire ses sous-caisses brouillon. Le flag `modifie` en tient compte.
  - **Listes déroulantes à l'édition inline** (`EditableCellSelect`) : clic sur une cellule de
    `type_envoi_caisse` / `type_ouverture` / `moteurs` / `module_lineaire` / `terminaux` /
    `traitement` (ligne mère) ou leurs équivalents sur sous-ligne → liste des choix + « Autre… »
    (bascule en saisie libre). La valeur courante hors-liste est toujours proposée.
  - **Gérer les références connues** : bouton « Gérer les références » en tête de la section
    (`GererReferencesDialog`, a remplacé `AjouterOptionDialog` le 2026-09-01) → par colonne
    (Moteurs / Module linéaire / Terminaux) : ajouter, **renommer** (répercuté sur les lignes
    `demande` / `demande_caisse` via `rename_option_liste`, confirmation si des lignes
    l'utilisent — `count_option_liste_usage`), **supprimer** une ou plusieurs valeurs (l'option
    disparaît de la liste, les lignes gardent le texte ; avertissement si utilisée).
  - **Toutes les valeurs vivent en base** depuis la migration `0017` : les anciennes valeurs
    "de base" (1..10 MOTEURS / TERMINAUX, codées en dur dans `demandeOptions.ts`) ont été
    seedées dans `option_liste`. Plus de socle en dur — `optionsListe()` renvoie juste les
    lignes de la table triées par `ordre`. `module_lineaire` démarre vide.
    `MOTEURS`/`TERMINAUX`/`MODULES_LINEAIRES` supprimés de `demandeOptions.ts`. `DemandesTable`
    ET `AjouterDemandesDialog` reçoivent `optionsPersonnalisees` en prop (plus de valeurs par
    défaut ailleurs). Édition inline `DemandesTable` : le `<select>` s'affiche même si la liste
    est vide (gating sur présence de la clé, pas sur `.length`) — `module_lineaire` a donc le
    même menu déroulant que les deux autres.
  - **Menu contextuel recadré** (`positionMenuContextuel`) : ne déborde plus en bas/droite de
    l'écran ; + 80px de marge sous le tableau.

- **Section Simulations — dimensions max par caisse, bandeau sticky, ergonomie tableau** —
  implémenté le 2026-08-31 (`ArticlesTable.tsx`, `AffaireDetail.tsx`, `CaisseCard.tsx`,
  `domain/calculs.ts` + `types.ts`) :
  - **Surlignage « dimension max » de l'affaire** (`idArticleMaxParChamp`, inchangé quant à la
    portée : max sur *toute l'affaire*, pas par caisse) : la cellule max est désormais rendue
    avec un badge plein `--accent` / texte blanc + gras (au lieu du léger fond `--accent-soft`),
    lisible même sur une ligne colorée.
  - **Dim. max articles sur la `CaisseCard`** : `CaisseCalculee` porte `dim1MaxMm/dim2MaxMm/
    dim3MaxMm` (`calculerCaisse`, calculés depuis les articles assignés), affichés en ligne
    « Dim. max articles (L×l×H) » — recalculés à chaque assignation/édition via `useAffaire`.
    C'est là (et pas dans le tableau) qu'on met en évidence le max par caisse.
  - **Lignes teintées = couleur exacte de la caisse** : une ligne d'article assigné prend
    `caisseAssignee.couleur` telle quelle (avant : `color-mix(... 55%, white)`).
  - **En-têtes de tableau sticky** : le conteneur d'articles (`AffaireDetail`) passe à
    `maxHeight: calc(100vh - 190px)` pour redevenir une vraie zone de scroll interne — sans ça
    c'était la page qui scrollait et le `<thead>` sticky (`top: 0`, `zIndex: 2`) sortait du
    viewport avec elle.
  - **Bandeau récap sticky** : `RecapAffaireBandeau` en `position: sticky; top: 46` (sous la
    navbar) ; panneau caisses de droite à `top: 120` / `maxHeight: calc(100vh - 140px)`.
  - **Tableau élargi** : `maxWidth` du conteneur `AffaireDetail` 1400 → 1600.
  - **Suffixe « (mm) »** sur les en-têtes `Dim1 (mm)` / `Dim2 (mm)` / `Dim3 (mm)`.

- **Détection de nom d'affaire déjà existant** — implémenté le 2026-08-31
  (`domain/demandeOptions.ts` : `memeNomAffaire()` comparaison **exacte** trim + casse —
  `UUSPM01D` ≠ `UUSPM010`, les variantes portent toujours un suffixe assumé ;
  `demandesActivesPourAffaire()` = demandes de même nom **non validées**) :
  - Demandes : `DemandesList.confirmerAffairesDejaPresentes()` avertit avant d'ajouter des
    lignes (`AjouterDemandesDialog`) ou de coller depuis Excel (`PasteImportZoneDemandes`) si
    une demande **non validée** porte déjà le même nom. L'utilisateur confirme → ligne
    distincte ajoutée ; annule → dialogue/collage conservé (les deux composants renvoient
    `false` pour rester ouverts).
  - Simulations : `AffairesList.handleCreate()` avertit si une affaire du même nom existe déjà.
  - `AffaireDetail` : la synchro « ajouter/répercuter une caisse dans la demande » ne se
    déclenche plus si la demande de même nom est **validée** (close) — `demandeParente` filtre
    sur `!estDemandeValidee`.

- **Section Demandes — règles métier dynamiques, brouillon complet, sync bidirectionnelle** —
  2026-09-02 (`domain/demandeOptions.ts`, `DemandesTable.tsx`, `DemandesList.tsx`,
  `AjouterDemandesDialog.tsx`, `AffaireDetail.tsx`) :
  - **Règles caisse centralisées** (`demandeOptions.ts`) : `ouverturesAutorisees(état)` — 4C →
    « Par dessus » uniquement (pas d'ouverture par devant) ; caisse en stock → « Par dessus »
    forcé. `appliquerReglesCaisse(état)` renvoie le patch à appliquer après un changement de
    type d'envoi / de caisse en stock : ouverture ramenée à « Par dessus » si plus autorisée,
    NIMP15 forcé si 4B/4C et **retiré** si STANDARD, contre-plaqué recalculé. Appliqué partout
    (édition inline mère + sous-ligne, `AjouterDemandesDialog`, sélection de caisse en stock).
  - **Édition entièrement en brouillon** : les sous-caisses (création, édition, suppression) et
    la sélection de caisse en stock passent désormais par le brouillon comme les lignes mères —
    plus rien n'est persisté avant « Enregistrer », « Annuler » restaure tout.
    `handleEnregistrer` diffe et applique création/modif/suppression des sous-caisses ;
    `sousCaissesSupprimees` mémorise les suppressions de sous-caisses déjà en base.
  - **Cascade mère → sous-caisses** : la date de picking et le type d'envoi de la mère sont
    répercutés sur ses sous-caisses (`handleEditLocal`), avec ré-application des règles pour le
    type d'envoi.
  - **Sync bidirectionnelle des dimensions** avec Simulations, à l'enregistrement :
    - Lien fiable caisse mère ↔ demande via `caisse.demande_id` (migration `0020`,
      `link_caisse_demande`), posé par `App.creerCaissesManquantes` — la synchro ne dépend plus
      du nom (qu'on renomme souvent dans Simulations pour être explicite). Fallback : caisse du
      même nom que l'affaire non liée à une sous-caisse.
    - Demandes → Simu : `repercuterDimsVersSimulation()` — pour chaque demande créée / dont les
      dims ont changé, si l'affaire existe et a la caisse cible, propose de la mettre à jour
      (une confirmation par affaire ; erreur affichée si le verrou de l'affaire est pris
      ailleurs).
    - Simu → Demandes : `AffaireDetail` — sous-caisse liée (`demande_caisse_id`) OU caisse mère
      (`demande_id`, sinon nom) → `demandeCaisseApi.update` / `demandesApi.update`.
  - **Dévalidation** : « Dévalider la sélection » / le menu contextuel effacent maintenant aussi
    l'observation « Livré/Rapatriée » (sinon `estDemandeValidee` la considère toujours validée
    via l'observation), en cascade sur les sous-caisses.
  - **Filtres qui respectent « masquer les caisses reçues »** : `thFiltrable` calcule les
    valeurs proposées sur `demandesVisibles` filtré par les *autres* colonnes — on ne peut plus
    sélectionner une valeur qui vide le tableau.
  - Divers : colonne Observations retirée de `AjouterDemandesDialog` ; nom d'affaire **≥ 8
    caractères** obligatoire (`AffairesList`, `CreerAffaireDialog`) ; notification de blocage
    si un champ obligatoire manque dans `AjouterDemandesDialog` ; `DimInput` (state texte local)
    pour saisir « 0.xx » sans perdre le 0 ; confirmation avant de fermer le dialogue avec de la
    saisie ; champs obligatoires (Affaire, Qté) au fond orangé.

### À faire

*Fiabilité et infrastructure*

- **⚠️ Risque connu — dossier BDD réseau partagé** : décision utilisateur (2026-07-30) d'utiliser
  un dossier réseau partagé pour `caisses.sqlite3` afin que plusieurs postes travaillent sur les
  mêmes données. SQLite n'est pas conçu pour des écritures concurrentes fiables sur un partage
  réseau (SMB/CIFS) — verrouillage fichier peu fiable dans ce contexte, risque de corruption
  silencieuse du fichier en cas d'écritures simultanées depuis deux postes. Mitigé par le
  verrouillage applicatif (voir "Fait" ci-dessus), mais pas éliminé. **Recommandation en
  attendant** : éviter d'éditer la même affaire depuis deux postes en même temps, et mettre en
  place une sauvegarde régulière (point suivant).
- **Sauvegarde régulière de `caisses.sqlite3`** — pas encore mise en place. Tant que la base peut
  vivre sur un dossier réseau partagé (point précédent), une copie de sauvegarde à intervalle
  régulier vers un autre emplacement (pas le même dossier/serveur, pour survivre à une panne du
  partage lui-même) est nécessaire. Fréquence à définir avec l'utilisateur — pas encore tranché :
  candidats évidents quotidien ou hebdomadaire selon le volume réel de saisie. Pourrait être un
  simple script/tâche planifiée Windows dans un premier temps, ou une fonctionnalité intégrée à
  l'app plus tard (bouton "Sauvegarder maintenant" + copie automatique périodique).
- **Dialogues natifs Tauri** : `@tauri-apps/plugin-dialog` est bien dans `package.json`
  (dépendance présente côté JS) mais toujours pas branché : `src/data/confirm.ts` utilise encore
  `window.confirm()` en fallback. Reste à remplacer par les dialogues natifs du plugin
  (suppression affaire/caisse/demande, confirmation de déplacement drag & drop).
- **Icônes de l'app** (`src-tauri/icons/`) — le jeu de fichiers présent correspond aux noms par
  défaut de `create-tauri-app` (`icon.ico`, `Square*Logo.png`, etc.) ; à confirmer visuellement si
  des icônes personnalisées ont depuis été déposées sous ces mêmes noms.
- **Tester manuellement en conditions réelles** la section Demandes (collage Excel 19 colonnes,
  édition inline, cases à cocher, tri) et la navigation par menu — pas d'outil d'automation UI
  dans l'environnement de dev assisté.

*Global*

- **Faire un check global du projet** : passe de revue pour repérer les failles de sécurité, le
  code mort ou à supprimer, et les incohérences à corriger — à planifier une fois les points
  ci-dessus stabilisés plutôt qu'en parallèle, pour reviewer un état du code qui ne bouge pas sous
  le pied de la revue.

### À réfléchir plus tard

- **Système de droits/permissions par utilisateur** — décision 2026-09-02 : inutile pour l'usage
  actuel (3 personnes, mêmes droits, interne bienveillant). À reconsidérer seulement si (a) un
  poste « consultation seule » apparaît → option légère : `role` dans `user-identity.json` +
  refus des mutations côté Rust ; (b) besoin d'identités vérifiées → table `utilisateur` + PIN,
  ou serveur HTTP central (le bon moment = quand le partage SQLite réseau devient un problème).
- **Colonne « type d'ouverture » dans le tableau Caisses en stock** — aujourd'hui une caisse en
  stock n'a pas de type d'ouverture ; quand on en sélectionne une dans Demandes, le type
  d'ouverture est forcé à « Par dessus ». Si le besoin d'un autre type par caisse en stock
  apparaît, ajouter la colonne (migration + CRUD `caisse_stock`) et lever le forçage.
- **Alias de caisse affiché dans le tableau Demandes** — quand on renomme une caisse dans
  Simulations (souvent pour la rendre explicite, ex. « caisse moteurs »), afficher ce nom sous
  le nom de l'affaire dans la colonne Affaire de la ligne de demande correspondante (caisse
  mère via `caisse.demande_id`, sous-caisse via `caisse.demande_caisse_id`). Rendu discret :
  police plus fine, gris (`--text-muted`), ~11px — purement informatif, non éditable côté
  Demandes. Nécessite de charger les `caisse` liées dans `DemandesList` (via un nouvel endpoint
  « caisses liées à des demandes » ou en filtrant `caissesApi` par affaire), et de n'afficher
  l'alias que s'il diffère du nom de l'affaire.

### Annulé pour le moment

- **Export/impression d'un récapitulatif d'affaire** — abandonné (2026-09-02). Aucun besoin
  concret ; la copie d'affiche (Demandes d'achats) couvre le seul cas de sortie utile.
