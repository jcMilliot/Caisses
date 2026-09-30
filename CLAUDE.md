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
- **Caisses en stock** : CRUD des caisses en stock et caisses de récup, affectables à une
  demande (`CaissesStockList.tsx`).
- **Demandes d'achats** : génération des "affiches" des demandes « OK pour être commandées », à
  copier dans un mail pour S2C (`DemandesAchatsList.tsx`, `AfficheCaisseCard.tsx`).

Utilisateur unique pour l'instant (l'auteur, développeur freelance), usage quotidien.
Sessions de travail espacées dans le temps → **ce fichier est la mémoire de reprise du projet.**

**En cas d'ambiguïté sur une décision structurante (modèle de données, choix technique difficile
à inverser, portée d'une fonctionnalité), s'arrêter et demander plutôt que de trancher seul.**
Les sessions sont espacées et l'utilisateur seul décideur — deviner silencieusement un choix
structurant coûte plus cher à corriger après coup qu'une question posée au bon moment. Ça ne
s'applique pas aux décisions d'implémentation réversibles (nom de variable, détail de style) :
là, avancer directement.

Documents complémentaires à ce fichier :
- **[Bugs.md](Bugs.md)** : index des bugs résolus non triviaux, par symptôme — à consulter avant
  de re-déboguer quelque chose qui semble déjà familier, et à compléter quand un nouveau bug non
  trivial est corrigé.
- **[docs/ADR/](docs/ADR/README.md)** : décisions structurantes actées (pourquoi ce choix plutôt
  qu'un autre), pour ne pas remettre en question sans contexte un arbitrage déjà tranché.

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
    caisse_stock.rs   → CRUD caisses en stock + transfer + set_caisse_stock_validee ;
                        update répercute dims / type d'ouverture sur les lignes non livrées
                        liées (+ count_caisse_stock_lignes_liees pour la confirmation)
    admin.rs          → comptes protégés par mot de passe (Argon2) + session admin en mémoire
                        (AdminSession, require_admin) : get_compte_status / admin_unlock /
                        admin_session_active / admin_lock / change_mot_de_passe /
                        enregistrer_connexion / list_utilisateurs
    backup.rs         → sauvegarde de caisses.sqlite3 (VACUUM INTO) : get/set_backup_config,
                        choose_backup_folder, backup_now (admin), backup_if_due (tout poste)
    restauration.rs   → présence des postes (PosteId, signaler_presence) + restauration d'une
                        sauvegarde (admin) : list_sauvegardes, choose_fichier_restauration,
                        restore_sauvegarde
    journal.rs        → journal d'audit : journaliser() appelé par les commandes concernées +
                        list_journal (session admin requise, onglet de la page Admin)
    locks.rs          → verrouillage applicatif multi-poste (acquire/release/heartbeat/
                        request_pen/respond_pen_request/list_locks + require_lock)
    options_liste.rs  → valeurs personnalisées des listes déroulantes Demandes (moteurs /
                        module_lineaire / terminaux) — list/create/rename/count_usage/delete ;
                        rename_option_liste répercute la nouvelle valeur sur demande /
                        demande_caisse (transaction)
    setup.rs          → get_db_status / choose_db_folder / set_db_folder / init_db
    user.rs           → get_user_status / set_trigramme (mot de passe exigé pour un trigramme
                        protégé — AJC)
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

État au 2026-09-28 : migrations `0001` à `0025` (dernière :
`0025_ouverture_4c_par_dessus.sql` ; pas de `0019_reorder` — supprimé avant
publication, cf. journal des listes).
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
         moteurs, module_lineaire, terminaux, informations_supp, observations,  -- terminaux : 0021
         cde_passee_affaire BOOL, cde_passee_achat_stock BOOL, contre_plaque BOOL,
         caisse_stock_id INTEGER NULL, ordre)

caisse_stock (id, nom, longueur_mm, largeur_mm, hauteur_mm, quantite, observations,  -- 0006
         affaire_id INTEGER NULL REFERENCES affaire ON DELETE SET NULL,
         validee BOOL,                    -- 0012
         demandeur, demande_le, demande_statut,  -- 0012, 'aucune'|'en_attente'|… (réaffectation)
         demande_affaire_cible_id INTEGER NULL, demande_cible_id INTEGER NULL,  -- 0013
         type_ouverture TEXT DEFAULT 'Par dessus',  -- 0024, repris (et verrouillé) sur la
                                                    --   ligne de demande qui sélectionne la caisse
         ordre, date_creation)

section_lock (section_key TEXT PRIMARY KEY,  -- "demandes" | "stock" | "achats" | "affaire:{id}"
              titulaire, acquis_le, dernier_battement,  -- trigramme + horodatages
              demandeur NULL, demande_le NULL, demande_statut)  -- 'aucune'|'en_attente'|'refusee'

journal (id, horodatage, trigramme, action, entite, entite_id NULL, details)  -- 0019
         -- journal d'audit des actions à effet fort. `action` ∈ 'creation' | 'suppression' |
         -- 'modification_dimensions' | 'reference_ajout' | 'reference_modification' |
         -- 'reference_suppression' | 'restauration'. `entite` ∈ 'demande' | 'demande_caisse' |
         -- 'option_liste' | 'base' (restauration d'une sauvegarde).
         -- Écriture par journaliser() (best-effort, jamais bloquant) ; lecture (list_journal)
         -- réservée à la session admin (page Admin, mot de passe AJC). Les auteurs restent des
         -- trigrammes déclaratifs, pas une preuve.

option_liste (id, liste TEXT, valeur TEXT, ordre, UNIQUE(liste, valeur))  -- 0016 + seed 0017
         -- valeurs des listes déroulantes de la section Demandes ; `liste` ∈ 'moteurs' |
         -- 'module_lineaire' | 'terminaux'. Depuis 0017 TOUT vit ici (les anciennes valeurs
         -- "de base" 1..10 MOTEURS / TERMINAUX y ont été seedées) — plus de socle codé en dur,
         -- tout est modifiable / supprimable via l'outil « Gérer les références ».
         -- 0017 seede moteurs (1..10) + terminaux (1..10) ; 0018 seede `module_lineaire`
         -- (18 modules FESTO fournis le 2026-09-01, libellé complet avec dimensions
         -- informatives entre parenthèses). Migration séparée car 0017 était déjà appliquée
         -- sur les bases de dev sans ces valeurs.

compte (trigramme PK, mot_de_passe_hash, role DEFAULT 'admin', cree_le, modifie_le)  -- 0022
         -- trigrammes protégés par mot de passe (hash Argon2, format PHC). Seul AJC pour
         -- l'instant ; `role` = base pour de futurs droits par tâche.

utilisateur (trigramme PK, premiere_connexion, derniere_connexion)  -- 0022
         -- trigrammes saisis sur les postes (déclaratifs), rafraîchi à chaque démarrage ;
         -- seedé à la migration depuis `journal` et `section_lock`.

parametre (cle PK, valeur)  -- 0022, paramètres partagés clé/valeur
         -- backup_dossier, backup_frequence ('desactivee'|'quotidienne'|'hebdomadaire'),
         -- backup_conservation (nb de fichiers), backup_derniere (UTC), backup_dernier_poste,
         -- backup_derniere_erreur.

poste_actif (poste_id PK, trigramme, dernier_battement)  -- 0023
         -- postes qui ont l'app ouverte : identifiant tiré au hasard au lancement (PosteId),
         -- battement toutes les 30 s (usePresence). Sert à refuser une restauration tant qu'un
         -- autre poste a battu dans les 2 dernières minutes.
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

### Soumission à Microsoft Defender — fiche à copier-coller

**Contexte** : Defender détecte l'installeur comme `Trojan:Win32/Bearfoos.B!ml` — détection
par machine learning, faux positif classique des binaires Tauri non signés lancés par
l'auto-updater. Observé pour la première fois sur v0.8.0 le 2026-09-02 ; première soumission
**validée comme faux positif** le 2026-09-03 (le 2e poste s'est mis à jour sans problème après
approbation). Pas de signature Authenticode (abandonnée le 2026-09-09, cf. ADR 0002 et
« Annulé pour le moment ») → on reste sur cette procédure manuelle, à revoir seulement si le
nombre de postes grandit nettement ou si les faux positifs deviennent trop pénibles.

**Quand** : à chaque release, dès publication, si Defender bloque l'installeur. Remplacer
`X.Y.Z` par la version. Traité en 24-72 h en général.

1. **Récupérer l'installeur de la release** (celui de GitHub Actions, jamais celui du build
   local `src-tauri/target/…`, qui est un autre binaire) :
   ```
   & "C:\Program Files\GitHub CLI\gh.exe" release download vX.Y.Z --repo jcMilliot/Caisses --pattern "*setup.exe" --dir "$env:USERPROFILE\Downloads"
   Get-FileHash "$env:USERPROFILE\Downloads\Caisses_X.Y.Z_x64-setup.exe" -Algorithm SHA256
   ```
2. **Formulaire** : https://www.microsoft.com/wdsi/filesubmission — les intitulés exacts des
   champs peuvent évoluer, les valeurs ci-dessous restent valables :

   | Champ | Valeur |
   |---|---|
   | Type de soumission | Software developer (sinon Home customer) |
   | Produit | Microsoft Defender Antivirus |
   | Fichier | `Caisses_X.Y.Z_x64-setup.exe` |
   | Ce que vous pensez du fichier | Incorrectly detected as malware/malicious (faux positif) |
   | Nom de la détection | `Trojan:Win32/Bearfoos.B!ml` |
   | Company name (si demandé) | Caisses (outil interne) |

   **Texte « Additional information »** (en anglais, lu par les analystes Microsoft) :
   ```
   False positive. Caisses is an internal business desktop application (Tauri 2: Rust
   backend + WebView2 frontend) that we develop ourselves and distribute only to our own
   company workstations through its built-in auto-updater. This file is the NSIS installer
   of release vX.Y.Z, built by our GitHub Actions release workflow from the public source
   repository https://github.com/jcMilliot/Caisses. The installer is not Authenticode-signed,
   which we believe triggers the machine-learning detection. Previous versions of the same
   application were reviewed and confirmed as false positives. SHA-256: <coller le hash>
   ```
3. En attendant la réponse, si un poste est bloqué : exclusion Defender du dossier
   d'installation et du dossier temporaire de l'updater (`%TEMP%\Caisses-*-updater-*`), ou
   déblocage manuel via la notification Defender.

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

### 2026-09-11 — Nouveau logo, Terminaux sur caisses enfants, boutons d'action par ligne

- **Nouveau logo de l'app** : jeu d'icônes complet régénéré via `npx tauri icon` depuis un
  visuel fourni par l'utilisateur (caisse en bois stylisée). Le contenu du visuel source était
  déjà proche du bord du canevas mais `tauri icon` ajoutait sa propre marge de sécurité sur les
  petites tailles (32×32, utilisée dans la barre des tâches), ce qui le faisait paraître plus
  petit que les icônes voisines — corrigé en recadrant sur le contenu réel puis en le
  ré-agrandissant à ~99 % du canevas 512×512 avant régénération. Dossiers `ios/`/`android/`
  générés par l'outil supprimés (app desktop-only, jamais utilisés).
- **Champ `terminaux` ajouté aux caisses enfants (`demande_caisse`)** — jusqu'ici ce champ
  n'existait que sur la ligne mère (`demande`), les sous-caisses n'avaient pas d'équivalent
  (case vide, non éditable). Migration `0021_add_demande_caisse_terminaux.sql` (nouvelle
  colonne, défaut `''`), portée dans `models.rs`/`commands/demande_caisse.rs`
  (SELECT/INSERT/UPDATE) et `domain/types.ts`. Côté `DemandesTable.tsx` : `terminaux` ajouté à
  `parChampSousLigne` (menu déroulant, mêmes options que la ligne mère + « Autre… ») et au
  mapping `CHAMP_SOUS_LIGNE` — non verrouillé, donc éditable inline comme `moteurs`/
  `module_lineaire`. `AffaireDetail.tsx`/`DemandesList.tsx` mis à jour pour la construction des
  sous-caisses (synchro caisse mère → sous-caisse, brouillon de sous-caisse).
- **Boutons d'action par ligne dans le tableau Demandes**, en plus du clic droit existant
  (conservé tel quel, pas de suppression de fonctionnalités) : colonne actions élargie
  (90→210px) pour accueillir, à côté de « Suppr. », trois nouveaux boutons compacts par ligne —
  **Valider/Dévalider**, **Simuler**, **+ Caisse** (créer une caisse enfant). Décision actée avec
  l'utilisateur : « Simuler l'affaire » et « Créer une nouvelle caisse enfant » ciblent toujours
  une ligne précise (pas de sens en action de sélection groupée à la différence de Valider, qui
  a déjà sa barre d'action groupée « Valider la sélection (N) »), d'où un bouton par ligne plutôt
  qu'un bouton en tête de tableau. « Simuler » n'est jamais désactivé en lecture seule (simple
  navigation, cohérent avec le clic droit qui ne le bloquait pas non plus).
- **Couleurs pastel des boutons d'action** : 3 nouvelles classes CSS réutilisables
  `.btn-pastel-green`/`.btn-pastel-blue`/`.btn-pastel-orange` (`index.css`, combinables avec
  `.btn-sm`), s'appuyant sur les tokens de couleur existants (`--ok-*`, `--warn-*`) plus un
  nouveau token bleu `--info-*`. Valider → bleu, Simuler → orange, + Caisse → vert (même famille
  que le gros bouton d'en-tête). `.btn-success` (existant, plus gros/gras) reste dédié au bouton
  d'en-tête « + Créer une nouvelle caisse », mis en avant à la demande de l'utilisateur (fond vert
  pastel, un cran plus grand que les autres boutons du bandeau).
- **« Coller depuis Excel » retiré de la page Gestion des caisses** (bouton + tout le code
  associé : état `importOuvert`, handler `handleImport`, import et rendu de
  `PasteImportZoneDemandes`) — décision utilisateur, le composant `PasteImportZoneDemandes.tsx`
  lui-même n'est pas supprimé (orphelin, gardé au cas où la fonctionnalité reviendrait ailleurs).
- `cargo check`, `npx tsc --noEmit` et `npm run tauri build -- --debug` (bundle complet MSI+NSIS)
  validés. Version bumpée à `0.8.1` (`tauri.conf.json`/`package.json`/`Cargo.toml`), release à
  préparer avec l'utilisateur (soumission Microsoft Defender à faire dès publication, cf.
  « Distribution et releases › Soumission à Microsoft Defender » — procédure manuelle actée le
  2026-09-09, pas de signature Authenticode).

### 2026-09-28 — Compte admin (mot de passe AJC), page Admin, sauvegarde automatique

- **Décisions actées avec l'utilisateur** (détail et alternatives :
  [ADR 0003](docs/ADR/0003-compte-admin-et-sauvegarde.md)) : mot de passe stocké **en base**
  (table `compte`, valable sur tous les postes) ; demandé **au choix du trigramme AJC** puis **à
  l'ouverture de la page Admin** une fois par lancement de l'app (inutile si on vient de le
  saisir au choix du trigramme) ; liste des utilisateurs = trigrammes saisis par les gens
  eux-mêmes (pas de liste imposée — des droits par tâche viendront plus tard) ; sauvegarde faite
  par **n'importe quel poste ouvert**, un seul à la fois.
- **Mot de passe** : Argon2 (`argon2` + `rand_core` feature `getrandom`), 6 caractères min.
  Premier choix d'AJC sans mot de passe en base → écran de création (+ confirmation).
  `TrigrammeSetup` passe à une 2e étape si `get_compte_status` indique un trigramme protégé ;
  `set_trigramme` refuse sans le bon mot de passe. Un poste déjà configuré en AJC avant cette
  version n'a rien à ressaisir au démarrage — le mot de passe sera créé à la 1re ouverture de
  l'Admin. **Mot de passe oublié** : pas de procédure dans l'app — supprimer la ligne AJC de la
  table `compte` (outil SQLite) pour le recréer au prochain passage.
- **Session admin** : `AdminSession` (état Tauri en mémoire, jamais persisté) ouverte par
  `set_trigramme` ou `admin_unlock`, refermée par le bouton « Verrouiller » ou la fermeture de
  l'app. `require_admin` protège `list_journal`, `list_utilisateurs`, la config de sauvegarde et
  `backup_now` — la garde n'est plus « trigramme == AJC » (qui s'obtient en éditant
  `user-identity.json`) mais le mot de passe vérifié. `peut_lire_journal` supprimé.
- **Page Admin** (`routes/Admin.tsx`, entrée « Admin » de la navbar à la place de « Journal »,
  visible pour AJC) : onglets **Utilisateurs** (trigramme, rôle, première/dernière connexion),
  **Sauvegarde**, **Journal** (`routes/Journal.tsx`, devenu un onglet). Bouton « Changer le mot
  de passe ». `formaterHorodatage` déplacé dans `domain/dates.ts`.
- **Sauvegarde** (`commands/backup.rs`, `hooks/useBackupAuto.ts`) : config en table `parametre`
  (dossier, fréquence désactivée/quotidienne/hebdomadaire, nb de fichiers conservés, défaut 30).
  Chaque poste appelle `backup_if_due` 1 min après le démarrage puis toutes les 30 min ; le
  poste qui « réserve » la sauvegarde par un `UPDATE ... WHERE` conditionnel sur
  `backup_derniere` est le seul à la faire. Échéance en jours calendaires locaux (quotidienne =
  pas encore faite aujourd'hui ; hebdo = dernière il y a ≥ 7 jours). Copie via `VACUUM INTO`
  vers `caisses_JJ-MM-AAAA_HH-MM-SS.sqlite3` (format choisi par l'utilisateur), puis
  suppression des plus anciens au-delà de la conservation — tri sur la date relue dans le nom
  (`cle_chronologique`), l'ordre alphabétique n'étant pas chronologique avec le jour en tête ;
  seuls les fichiers qui suivent exactement ce format sont concernés, aucun autre n'est touché.
  En cas d'échec (dossier inaccessible depuis un poste…) : réservation annulée, erreur notée en
  base (`backup_derniere_erreur`, avec le trigramme du poste) et affichée dans l'onglet
  Sauvegarde. Bouton « Sauvegarder maintenant ». Restauration depuis l'app ajoutée le même jour
  (bloc suivant).
- Validation : `cargo check`, `cargo test --lib backup` (2 tests : création/vérification du mot
  de passe ; réservation unique par jour + rétention), `npx tsc --noEmit`,
  `npm run tauri build -- --debug` (MSI + NSIS). **Non testé en conditions réelles** (pas
  d'automation UI) : parcours choix AJC → création du mot de passe, déverrouillage Admin,
  sauvegarde vers un vrai dossier réseau depuis deux postes.

### 2026-09-28 — Restauration d'une sauvegarde depuis la page Admin

- **Décisions actées avec l'utilisateur** : choix dans la **liste des sauvegardes** du dossier
  configuré (plus récente en haut) + bouton « Autre fichier… » (n'importe quel `.sqlite3`) ;
  restauration **bloquée si un autre poste a l'app ouverte**. Détail dans
  [ADR 0003](docs/ADR/0003-compte-admin-et-sauvegarde.md).
- **Présence des postes** : table `poste_actif` (migration `0023`), identifiant tiré au hasard
  au lancement (`PosteId`, état Tauri — pas le trigramme, deux postes pouvant partager le même),
  `signaler_presence` toutes les 30 s (`hooks/usePresence.ts`). Un poste qui n'a pas battu
  depuis 2 min est considéré fermé.
- **Restauration** (`commands/restauration.rs::restaurer`, onglet Admin › Sauvegarde) :
  1. refus si un autre poste est actif (message listant les trigrammes) ;
  2. vérification du fichier (`PRAGMA quick_check`, présence des tables `_migrations` et
     `affaire` — refuse un fichier qui n'est pas une base Caisses) ;
  3. copie de sécurité de la base actuelle à côté d'elle,
     `caisses_avant-restauration_JJ-MM-AAAA_HH-MM-SS.sqlite3` (hors format des sauvegardes :
     jamais listée ni supprimée par la rétention ; pour annuler, « Autre fichier… ») ;
  4. copie par l'API backup de SQLite (`Connection::restore`, feature rusqlite `backup`) dans la
     connexion ouverte — pas de copie de fichier à la main ;
  5. migrations rejouées (`db::appliquer_migrations`, extrait de `open_at`) si la sauvegarde
     date d'un schéma plus ancien ;
  6. **comptes (mot de passe AJC) et paramètres `backup_*` actuels réécrits** : ce sont des
     réglages, une vieille sauvegarde les ferait revenir en arrière. `section_lock` et
     `poste_actif` vidés. Entrée `restauration` au journal ;
  7. l'app redémarre (`relaunch`) : l'interface gardait l'ancien état en mémoire.
- Validation : `cargo test --lib` (3 tests, dont restauration : blocage par un autre poste,
  données remplacées, compte et config conservés, copie de sécurité correcte, faux fichier
  refusé), `npx tsc --noEmit`. **Non testé en conditions réelles** (pas d'automation UI).

### 2026-09-28 — Caisses en stock : « Gérer les caisses » et type d'ouverture

- **Décisions actées avec l'utilisateur** :
  - le tableau Caisses en stock passe en **lecture seule** ; création / modification /
    suppression uniquement dans le dialogue « Gérer les caisses »
    (`components/GererCaissesStockDialog.tsx`, même principe que « Gérer les références ») ;
  - nouvelle colonne **type d'ouverture** (`caisse_stock.type_ouverture`, migration `0024`,
    défaut « Par dessus » = ce qui était imposé jusqu'ici) : « Par dessus » / « Par devant » /
    « Par dessus et par devant » ;
  - dans Gestion des caisses, sélectionner une caisse en stock reprend ses dimensions **et son
    type d'ouverture**, qui devient **non modifiable** tant qu'elle est sélectionnée
    (`ouvertureVerrouilleeParStock` — dialogue de création, ligne mère, sous-ligne) ;
  - **pas de caisse en stock en 4B / 4C** (`stockAutorisePourEnvoi`) : le menu Stock est
    désactivé pour ces types, et passer une ligne en 4B/4C retire la caisse en stock (d'elle et
    de ses sous-caisses) après confirmation — règle portée par `appliquerReglesCaisse`, qui ne
    force plus « Par dessus » sur une ligne liée au stock ;
  - modifier les dimensions ou le type d'ouverture d'une caisse en stock est **répercuté sur les
    lignes non livrées** qui l'utilisent (demandes, sous-caisses, et leurs caisses Simulations
    liées par `demande_id` / `demande_caisse_id`), après confirmation indiquant le nombre de
    lignes. Les lignes livrées / rapatriées gardent leurs valeurs. Côté backend
    (`update_caisse_stock`, une transaction), avec une entrée `modification_dimensions` au
    journal par ligne si les dimensions changent. Règle « non livrée » dupliquée en SQL
    (`OBSERVATION_NON_LIVREE`) — **à garder alignée** avec `estDemandeValidee` /
    `estDemandeCaisseValidee`.
- Inchangé : modifier une dimension sur une ligne de Gestion des caisses désélectionne toujours
  la caisse en stock (le type d'ouverture reste celui repris, redevient modifiable).
- Validation : `cargo test --lib` (4 tests, dont répercussion : lignes non livrées et caisse
  Simulations mises à jour, lignes livrées intactes), `npx tsc --noEmit`. **Non testé en
  conditions réelles** (pas d'automation UI).

### 2026-09-28 — 4C « Par dessus » imposé, lignes livrées figées

- **4C** : type d'ouverture imposé à « Par dessus », affiché sans menu déroulant (dialogue de
  création, ligne mère, sous-ligne). `demandeOptions.ts::ouvertureImposee` réunit les deux cas de
  type d'ouverture imposé (caisse en stock → celui de la caisse ; 4C → « Par dessus ») et
  `motifOuvertureImposee` le texte d'infobulle ; `appliquerReglesCaisse` pose « Par dessus » dès
  le passage en 4C, même si rien n'était saisi. Migration `0025` : aligne les lignes 4C
  existantes (`demande` et `demande_caisse`) sur « Par dessus » — sinon le champ verrouillé
  resterait vide et bloquerait « OK pour être commandée ».
- **Ligne livrée / rapatriée figée** (`estDemandeValidee`) dans `DemandesTable` : cellules,
  cases à cocher, menu Stock, « + Caisse », « Suppr. », « Créer une nouvelle caisse » du clic
  droit et sous-caisses non modifiables. Restent actifs : **« Dévalider »** (seul moyen de
  revenir en édition) et « Simuler » (navigation). Choix de l'assistant, à confirmer à l'usage :
  la suppression est aussi bloquée (dévalider d'abord).
- **Création de caisse + caisse en stock → « Cde passée sur achat stock » cochée**
  (`AjouterDemandesDialog::synchroCdeAchatStock`, « Cde passée sur affaire » décochée) ; retirer
  la caisse en stock (« — Choisir — », dimension modifiée, passage en 4B/4C) la décoche.
  Dialogue de création uniquement (demande de l'utilisateur) — pas l'édition inline du tableau.
- **Simulations — glisser-déposer de plusieurs articles** (`AffaireDetail::articlesGlisses` /
  `handleDropArticle`) : attraper un article **coché** emporte toute la sélection (sinon l'article
  seul, comme avant) → un seul `assign_articles`. Une seule confirmation listant les caisses
  d'origine si certains sont déjà dans une autre caisse ; ceux déjà dans la caisse cible sont
  ignorés. L'étiquette qui suit la souris affiche « N articles ». Sélection vidée après un dépôt
  groupé (même convention que « Assigner à → »).
- Validation : `cargo test --lib` (4 tests, migrations appliquées sur base neuve),
  `npx tsc --noEmit`. **Non testé en conditions réelles**.

## Prochaines étapes

### Fait

- **Simulations — alerte « article plus grand que sa caisse »** (2026-09-03, `domain/calculs.ts`
  + `types.ts`, `CaisseCard.tsx`, `FillRateBadge.tsx`) : `calculerCaisse` compare chaque article
  assigné aux dimensions de la caisse (**comparaison stricte des axes** : dim1↔longueur,
  dim2↔largeur, dim3↔hauteur, tolérance 0,5 mm, ignoré si la caisse n'a pas de dimensions).
  `CaisseCalculee.articlesTropGrands` liste les articles fautifs avec les axes qui dépassent
  (valeur article / valeur caisse). Rendu : bandeau rouge sur la `CaisseCard` détaillant chaque
  article (« AR — 610 mm > longueur de la caisse (500 mm) »), `niveauAlerte` passe à `alerte`
  (bordure + badge rouges), tooltip du `FillRateBadge` adapté.

- **Simulations — alerte « volume affaire > capacité des caisses »** (2026-09-03,
  `domain/calculs.ts::calculerCapaciteAffaire`, `RecapAffaireBandeau` dans `AffaireDetail.tsx`) :
  compare le volume cumulé de **tous** les articles de l'affaire (assignés + non assignés) à la
  capacité utile cumulée des caisses = Σ (volume interne, mousse déduite pour les 4C) × seuil de
  remplissage (celui de la caisse, ou le seuil par défaut de l'affaire). Bandeau rouge dans le
  récap sticky du haut si dépassement. **Pas d'alerte** s'il n'y a aucune caisse, ou si une
  caisse n'a pas encore de dimensions.

- **Collage Excel — robustesse** (2026-09-03, `domain/tsv.ts`, `PasteImportZone.tsx`,
  `ArticlesTable.tsx`) :
  - **Guillemets nus** : un `"` au milieu d'une désignation (ex. `G1/8" m`) faisait passer le
    parseur en mode « champ quoté » et fusionnait toutes les lignes suivantes dans un seul
    champ. Le parseur ne traite désormais un `"` comme ouvrant que s'il est **en début de
    champ** (après une tabulation / un retour à la ligne) ; ailleurs c'est un littéral. `""`
    reste un `"` littéral dans un champ quoté (cas Excel standard). `decouperLignesTsv` /
    `decouperColonnesTsv` partagent une fonction `decouper()` commune.
  - **Colonnes en trop** (articles) : le fichier Excel a souvent 2 colonnes de volume calculé
    après les 8 utiles ; l'import ne rejette plus ces lignes, il **prend les 8 premières
    colonnes** et affiche un avertissement global unique (les volumes sont recalculés par l'app).
  - **Collage direct dans une cellule** du tableau `ArticlesTable` : si le presse-papiers
    contient une tabulation ou un retour à la ligne (= plusieurs cellules Excel), le collage
    n'est plus mis dans le seul champ édité — il ouvre le dialogue « Coller depuis Excel »
    pré-rempli (`onCollageMultiCellules` → `PasteImportZone` prop `texteInitial`).

- **Dialogues de confirmation** — décision 2026-09-03 : on **garde le dialogue React custom**
  (`ConfirmDialog` + `ConfirmDialogHost`, mécanisme `confirmerAction` / `confirmerSuppression`
  dans `data/confirm.ts`) plutôt que les dialogues natifs du plugin `@tauri-apps/plugin-dialog`.
  Raisons : cohérence visuelle avec le reste de l'app, gestion du titre et du niveau `danger`,
  aucune régression. Le crate Rust `tauri-plugin-dialog` reste utilisé pour le **choix de
  dossier natif** (`blocking_pick_folder`, `commands/setup.rs`, écran de premier lancement) ;
  le paquet npm `@tauri-apps/plugin-dialog`, jamais importé côté JS (le picker passe par la
  commande Rust `choose_db_folder`), a été **retiré** de `package.json`. `window.confirm()`
  reste un fallback jamais atteint en pratique (le host est monté dès que l'app est prête).
  Ajout de raccourcis clavier Échap / Entrée sur `ConfirmDialog`.

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
  Auto-expiration de la demande de crayon ajoutée depuis (2026-09-01) ; droits par utilisateur
  volontairement écartés (cf. « À réfléchir plus tard »).
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
    **Renforcé le 2026-09-03** (`capturerAvecRetries`) : `img.decode()` sur *toutes* les images
    (pas de raccourci sur `img.complete`, qui peut être `true` avant le premier paint) + 2
    `requestAnimationFrame` + jusqu'à 4 retentatives avec pause croissante et rejet des blobs
    < 1 ko. **C'était la vraie cause** du « la copie groupée marche seulement à la 2e fois ».
  - **Format de la copie groupée** : après un essai d'image PNG unique composée sur `<canvas>`
    (module `imageComposite.ts`, abandonné et supprimé le 2026-09-03 — image trop lourde,
    ~900 ko pour 5 affiches), on **revient au `text/html` avec plusieurs `<img data:>`** +
    `text/plain` en fallback. Ça fonctionne sur le client mail du poste de travail (testé) ;
    Outlook strippe les images `data:` → dans ce cas, repli sur la copie affiche par affiche
    (bouton de chaque carte, `handleCopier`, qui met un `image/png` direct dans le
    presse-papiers). Logique de texte entre types (intro, mention 4C avant le groupe 4C,
    « Ainsi que : » avant l'ACHSTOCK) conservée.
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
  - Divers : colonne Observations retirée de `AjouterDemandesDialog` ; nom d'affaire **exactement
    8 caractères** obligatoire (`AffairesList`, `CreerAffaireDialog` — règle resserrée de ≥8 à
    =8 le 2026-09-24, voir bloc ci-dessous) ; notification de blocage si un champ obligatoire
    manque dans `AjouterDemandesDialog` ; `DimInput` (state texte local) pour saisir « 0.xx »
    sans perdre le 0 ; confirmation avant de fermer le dialogue avec de la saisie ; champs
    obligatoires (Affaire, Qté) au fond orangé.

- **Gestion des caisses — retours utilisateur 2026-09-11 (lot complet)** — implémenté le
  2026-09-24 (`AffairesList.tsx`, `CreerAffaireDialog.tsx`, `AjouterDemandesDialog.tsx`,
  `DemandesList.tsx`, `DemandesTable.tsx`, `domain/demandeOptions.ts`, `index.css`) :
  - **Nom d'affaire : exactement 8 caractères** (et non plus « minimum 8 ») — resserré partout :
    `AffairesList`/`CreerAffaireDialog` (Simulations) et `AjouterDemandesDialog` (Demandes,
    n'avait jusque-là aucun contrôle de longueur). `maxLength={8}` sur les champs concernés en
    plus de la validation. **✅ Fait quand** : impossible de créer une affaire dont le nom trimé
    ne fait pas exactement 8 caractères, dans les deux écrans — vérifié par lecture de code
    (`nom.trim().length !== 8` gate la soumission partout) ; `npx tsc --noEmit` OK.
  - **Date picking obligatoire** dans `AjouterDemandesDialog` (fond orangé + bloquant), au même
    titre qu'Affaire et Qté. **✅ Fait quand** : `champsManquants` refuse une ligne sans date de
    picking — vérifié par lecture de code.
  - **Doublon de nom d'affaire bloqué dans un même ajout local** : `handleAjouter` détecte deux
    lignes du même nom (trim + uppercase) avant tout appel serveur et affiche un message dédié,
    en plus de la détection déjà existante contre les affaires *déjà enregistrées*
    (`confirmerAffairesDejaPresentes`). **✅ Fait quand** : deux lignes portant le même nom dans
    le dialogue empêchent la création tant qu'elles ne sont pas différenciées.
  - **Bouton « Annuler » rapproché d'« Enregistrer »** dans le bandeau `DemandesList` — déplacé
    juste avant Enregistrer plutôt qu'en début de groupe.
  - **Bug corrigé : caisse enfant ne passait pas en vert à la validation de la mère** — cause
    racine trouvée par lecture de code (pas de repro UI disponible) : `handleValider` écrit
    l'observation `"Livré"` (sans accent final) sur les sous-caisses, mais
    `domain/demandeOptions.ts::estDemandeCaisseValidee` ne testait que `"livrée"` (avec accent) en
    sous-chaîne — `"livré"` ne contenant pas `"livrée"`, le test échouait toujours pour cette
    orthographe. La ligne mère restait verte car `estDemandeValidee` teste aussi le booléen
    `d.validee`, un filet de sécurité que les sous-caisses n'ont pas. Fix : les deux fonctions
    testent désormais `"livré"`/`"rapatrié"` (sans exigence d'accent final), qui matchent aussi
    la forme accentuée en sous-chaîne. Documenté dans [Bugs.md](Bugs.md). **✅ Fait quand** :
    valider une demande mère avec une sous-caisse colore aussi la sous-caisse en vert — confirmé
    par le mécanisme de test (`node -e` sur les regex de correspondance) après fix ;
    **reste à confirmer en usage réel** à la prochaine session.
  - **Bug corrigé : boutons d'action de ligne restaient affichés après suppression de l'affaire
    avant enregistrement** — `DemandesTable` purge maintenant `selectedIds` par un `useEffect`
    dès que la liste `demandes` (prop) ne contient plus un id sélectionné, au lieu d'attendre un
    `toggleSelect`/`validerSelection` explicite. **✅ Fait quand** : supprimer une ligne
    sélectionnée avant d'enregistrer fait disparaître la barre d'actions groupées associée.
  - **Couleurs des boutons échangées** : Valider (ligne) → vert (`.btn-pastel-green`), libellé
    "Livré" au lieu de "Valider" (Dévalider inchangé) ; "+ Caisse" (ligne) et "+ Créer une
    nouvelle caisse" (en-tête) → bleu (`.btn-pastel-blue` / nouvelle classe `.btn-info`, même
    gabarit que `.btn-success` mais bleue). **✅ Fait quand** : les couleurs et libellés
    correspondent à la description ci-dessus — vérifié visuellement dans le code CSS/JSX.
  - **Bouton "Enregistrer" passé en vert plein** (`.btn-success-solid`, nouvelle classe, même
    gabarit que `.btn-primary` mais fond `--ok-text`) sur demande explicite du 2026-09-24, pour
    le distinguer des variantes pastel des boutons de ligne.
  - **Suppression d'une demande sans `reload()` complet** : `handleDelete` (`DemandesList.tsx`)
    retire la ligne et ses sous-caisses des états locaux (`demandes`, `brouillon`,
    `demandeCaisses`, `demandeCaissesServeur`) au lieu de refaire les 5 appels réseau de
    `reload()` — demande explicite du 2026-09-24 (pas de nécessité fonctionnelle à tout
    recharger, l'id supprimé et ses dépendances sont déjà connus côté client).
  - `npx tsc --noEmit` validé après l'ensemble. **Non testé en conditions réelles** (pas
    d'automation UI disponible) — en particulier le point caisse enfant/vert, à confirmer à la
    prochaine session avec l'app ouverte.

- **Simulations — volumes de petites pièces illisibles (affichaient 0.0000)** — corrigé le
  2026-09-24 (`domain/calculs.ts::formaterVolumeM3`, `ArticlesTable.tsx`, `AffaireDetail.tsx`,
  `CaisseCard.tsx`). **Ce n'était pas un bug de calcul** : `volumeUnitaireM3` ne dépend que des 3
  dimensions (le poids n'y entre jamais, vérifié par lecture du type `Pick<Article, "dim1_mm" |
  "dim2_mm" | "dim3_mm">`) — pour de petites pièces mécaniques (vis, joints, écrous, dimensions
  de l'ordre de 5 à 30 mm), le volume réel est de l'ordre de `0.0000006` à `0.0000028` m³,
  invisible avec 3-4 décimales fixes (`toFixed(4)` affichait "0.0000" pour un volume pourtant
  strictement positif). Cas confirmé avec l'utilisateur sur des références réelles (ex.
  `AR_COVAL_00078`, 16.66 × 5.93 × 5.93 mm → 0.00000059 m³).
  Nouvelle fonction `formaterVolumeM3()` : arrondi **par excès** (`Math.ceil`, jamais de
  sous-estimation visuelle — répond aussi au point "arrondi par excès" ci-dessous) avec un
  nombre de décimales qui s'élargit automatiquement (3 à 9) jusqu'à obtenir au moins 2 chiffres
  significatifs, au lieu d'un nombre de décimales fixe pour tous les volumes. Appliquée partout
  où un volume est affiché : colonne "Vol. u." (`ArticlesTable`), bandeau récap affaire (volume
  total + message de dépassement de capacité), cartes de caisse (interne/occupé/disponible dans
  `CaisseCard`). **✅ Fait quand** : un article dont les 3 dimensions sont renseignées mais
  minuscules affiche un volume non nul et distinctif (pas "0.0000", pas la même valeur que
  d'autres petites pièces) — vérifié par calcul direct sur les 7 références de la capture
  utilisateur, toutes distinctes après fix. `npx tsc --noEmit` validé.

- **Message de l'alerte "volume affaire > capacité des caisses" clarifié** — corrigé le
  2026-09-24 (`AffaireDetail.tsx::RecapAffaireBandeau`), sur demande explicite de reformulation
  (l'ancien message manquait de clarté, sans qu'un comportement erroné n'ait finalement été
  identifié — la logique de déclenchement de `calculerCapaciteAffaire` elle-même n'a pas changé).
  Nouveau texte : « Le volume total de l'affaire ({volume} m³) ne peut être contenu dans la
  caisse/les caisses (capacité utile : {capacité} m³, seuil de remplissage appliqué). Veuillez
  vérifier les dimensions. » — accord singulier/pluriel selon le nombre de caisses de l'affaire.
  **✅ Fait quand** : le message reflète la formulation validée avec l'utilisateur — fait,
  `npx tsc --noEmit` validé.

- **Icône de la barre des tâches après changement de logo (v0.8.1)** — confirmé résolu par
  l'utilisateur le 2026-09-24 (plus de détail sur la cause exacte ni le correctif appliqué,
  l'icône est simplement à jour). Retiré du "À faire".

- **Bouton "Manque d'informations" à côté des caisses** — implémenté le 2026-09-24
  (`domain/calculs.ts::champsManquants`, `AffaireDetail.tsx`, `ArticlesTable.tsx`). Nouvelle
  fonction pure `champsManquants(article)` : un champ `dim1_mm`/`dim2_mm`/`dim3_mm`/
  `poids_unitaire_kg` à 0 ou négatif est considéré manquant (aucune pièce réelle n'a une
  dimension ou un poids nul), distinct de l'alerte existante "article > caisse". Bouton
  « ⚠ Manque d'informations (N) » dans le header du panneau Caisses, visible seulement s'il y a
  au moins un article concerné ; bascule on/off (`surlignerManques` state dans `AffaireDetail`).
  Actif, il surligne (fond + contour rouge, tooltip) la cellule AR de la ligne (dès qu'au moins
  un champ manque, pour repérer vite la référence) et les cellules précises des champs manquants
  — **pas** toute la ligne uniformément, comportement confirmé avec l'utilisateur le 2026-09-24
  ("juste la cellule de l'article et celles des dim/poids qui manquent"). **✅ Fait quand** : sur
  une affaire de test avec un article à dimension/poids manquant, le bouton apparaît, surligne
  exactement la cellule AR + les cellules concernées au premier clic, et retire le surlignage au
  second clic — vérifié par lecture de code et confirmé par l'utilisateur pour le périmètre du
  surlignage. `npx tsc --noEmit` validé.

- **Panneau Caisses (Simulations) — boutons sous le titre + couleurs** — corrigé le 2026-09-24
  (`AffaireDetail.tsx`), sur retour visuel direct de l'utilisateur (capture d'écran : les
  boutons écrasaient le titre "Caisses" en colonne étroite). Header du panneau passé de
  `justifyContent: space-between` (titre + boutons sur une ligne) à `flexDirection: column`
  (boutons sur leur propre ligne, en dessous du titre, avec `flexWrap`). Couleurs : "+ Nouvelle
  caisse" en bleu pastel (`.btn-pastel-blue`, cohérent avec "+ Caisse"/"+ Créer une nouvelle
  caisse" de Gestion des caisses) ; "⚠ Manque d'informations" en orange pastel
  (`.btn-pastel-orange`) au repos, bascule en rouge quand le surlignage est actif.

- **Message "volume affaire > capacité" affiné (2e passe)** — 2026-09-24, sur demande explicite
  après la première reformulation (`AffaireDetail.tsx::RecapAffaireBandeau`) : « capacité
  utile » → « capacité disponible », et le seuil de remplissage appliqué (`seuilDefaut` de
  l'affaire) est maintenant affiché en clair dans le message (« seuil de remplissage appliqué :
  70% ») plutôt que mentionné sans valeur. Le seuil peut différer par caisse
  (`caisse.seuil_pct`) ; décision actée avec l'utilisateur : toujours afficher le seuil par
  défaut de l'affaire dans ce message, pas une moyenne ou un détail par caisse.

- **Demandes d'achats — texte d'introduction du mail reformulé** — implémenté le 2026-09-24
  (`domain/affiches.ts::texteIntroductionMail`, `mettreEnEvidenceS2C`). Formulation fournie
  par l'utilisateur : « Bonjour, / / Merci de passer commande à S2C (mis en évidence) de la
  caisse suivante : » (pluriel « des caisses suivantes » si plusieurs). Un seul verbe
  (« passer commande ») dans tous les cas — l'ancienne distinction fabrication/commande selon
  `seulementAchstock` a été retirée à la demande de l'utilisateur, avec le paramètre devenu
  inutile. « S2C » mis en gras et ~5% plus grand (`mettreEnEvidenceS2C`, `<span
  style="font-weight:700;font-size:1.05em;">`) **uniquement dans le rendu HTML** collé dans le
  mail (`DemandesAchatsList.tsx` copie groupée, `AfficheCaisseCard.tsx` copie individuelle) — le
  texte brut (`text/plain`, fallback) reste simple, une mise en forme n'existant pas en texte
  pur. **✅ Fait quand** : le texte copié correspond exactement à la formulation validée —
  vérifié par lecture de code, `npx tsc --noEmit` validé.

- **Demandes d'achats — blocage "OK cde" si informations obligatoires manquantes** — implémenté
  le 2026-09-24 (`domain/demandeOptions.ts::champsManquantsPourCommande`/
  `demandePreteACommander`, `DemandesTable.tsx`, `DemandesList.tsx::handleEditLocal`). Champs
  requis décidés avec l'utilisateur : Affaire (non vide), les 3 dimensions (> 0), Qté (> 0),
  délai (`date_demandee_s2c` non vide), position de la fermeture (`type_ouverture` non vide).
  Deux comportements :
  - **Blocage à la coche** (`DemandesTable.tsx::toggleBool`) : tenter de cocher « Ok cde » sans
    que les conditions soient réunies affiche un message listant précisément les champs
    manquants pour CETTE ligne (`confirmerAction`, dialogue à un seul effet informatif) et la
    case reste décochée.
  - **Dévalidation avec confirmation** (`DemandesList.tsx::handleEditLocal`, devenu async) : si
    la demande est déjà « Ok cde » et qu'un champ conditionnant change de façon à ne plus
    satisfaire `demandePreteACommander`, une confirmation apparaît listant les champs qui
    deviendraient manquants. Si confirmé, le patch inclut `ok_pour_passer_cde: false` en plus du
    champ modifié ; si annulé, aucune modification n'est appliquée (le `patch` entier est
    abandonné, pas seulement la case).
  - **Message rendu dynamique le 2026-09-24 (2e passe)** : retour utilisateur — le premier
    message listait systématiquement toutes les conditions possibles ("Affaire, les 3
    dimensions, Qté, délai..."), pas intuitif pour identifier ce qui manque réellement.
    `champsManquantsPourCommande(d)` retourne la liste des libellés (`"Affaire"`, `"Longueur"`,
    `"Largeur"`, `"Hauteur"`, `"Qté"`, `"Date demandée à S2C"`, `"Type ouverture"`) réellement en
    défaut ; `demandePreteACommander` devient un simple raccourci (`.length === 0`) dessus.
  - Pas de champ `ok_pour_passer_cde` sur `DemandeCaisse` (sous-caisses) — non concerné par ce
    point, une seule voie d'édition pour ce champ (`toggleBool`, pas de bouton groupé).
  - **✅ Fait quand** : le message de blocage/dévalidation liste exactement (et seulement) les
    champs en défaut pour la ligne concernée, pas une liste statique de toutes les conditions —
    vérifié par lecture de code,
    `npx tsc --noEmit` validé. **Non testé en conditions réelles** (pas d'automation UI).

- **Date demandée à S2C : avertissement si dans le passé** — implémenté le 2026-09-24
  (`domain/dates.ts::dateEstDansLePasse`, `AjouterDemandesDialog.tsx`, `DemandesTable.tsx`).
  Demande explicite de l'utilisateur : `date_demandee_s2c` doit être `>=` aujourd'hui. Portée et
  comportement décidés avec l'utilisateur : **saisie manuelle uniquement** (dialogue de création
  + édition inline ligne mère et sous-ligne) — **pas** le collage Excel, qui peut légitimement
  importer des dates historiques lors d'une reprise de fichier existant. **Avertissement avec
  confirmation**, pas de blocage strict : une date passée déclenche `confirmerAction` (« La date
  demandée à S2C est dans le passé. Confirmer cette date ? ») ; si refusé, la saisie n'est pas
  appliquée. Trois points d'interception : `AjouterDemandesDialog::verifierDateDemandeeS2c`
  (en sortie du champ depuis le 2026-09-28 — vérifier à chaque frappe cassait la saisie, cf.
  [Bugs.md](Bugs.md)),
  `DemandesTable::sauvegarderChamp` (ligne mère, devenu async), et le `onCommit` de
  `EditableCellInput` dans `SousLigneCaisse` (sous-ligne). **✅ Fait quand** : saisir une date
  passée dans l'un de ces trois points déclenche la confirmation, et le refus annule la saisie —
  vérifié par lecture de code, `npx tsc --noEmit` validé. **Non testé en conditions réelles**
  (pas d'automation UI).

- **Fix : dialogue de confirmation (ConfirmDialog) fermé silencieusement par auto-repeat clavier**
  — corrigé le 2026-09-24, découvert en testant le point ci-dessus. Symptôme rapporté par
  l'utilisateur : cocher "Ok cde" sur une demande incomplète (ou vider un champ requis sur une
  demande déjà validée) ne montrait jamais le dialogue de confirmation — la case se décochait
  directement, avec une légère latence perceptible. Cause diagnostiquée par logs de debug
  temporaires (`console.log` dans `handleEditLocal`/`sauvegarderChamp`, retirés une fois la
  cause confirmée) : la détection métier fonctionnait correctement (`manquants` bien peuplé), le
  problème était dans `ConfirmDialog.tsx` — le raccourci clavier Entrée=Confirmer captait la
  répétition (`event.repeat`, auto-repeat du clavier) du **même appui physique sur Entrée** qui
  venait de valider la cellule du tableau juste avant, refermant le dialogue en confirmant sans
  qu'il soit visible ni qu'une réponse consciente ait été donnée. **Fix** : `ConfirmDialog`
  ignore désormais `event.repeat` et n'arme ses raccourcis clavier (Entrée/Échap) qu'après un
  délai de 150 ms suivant l'ouverture. Documenté dans [Bugs.md](Bugs.md). Confirmé résolu par
  l'utilisateur après retest.

- **Demandes — libellé "Ok cde" renommé "OK pour être commandée"** — 2026-09-24
  (`DemandesTable.tsx`, `DemandesList.tsx`), sur demande explicite : libellé de colonne et tous
  les messages de confirmation/blocage liés à `ok_pour_passer_cde` mis à jour pour utiliser ce
  nouveau libellé plus explicite.

- **Demandes — messages "OK pour être commandée" rendus dynamiques (précision des champs
  manquants)** — 2026-09-24, retour utilisateur : le premier message listait systématiquement
  toutes les conditions possibles, peu intuitif. `domain/demandeOptions.ts` :
  `champsManquantsPourCommande(d)` retourne la liste des libellés réellement en défaut pour la
  ligne concernée (`"Affaire"`, `"Longueur"`, `"Largeur"`, `"Hauteur"`, `"Qté"`, `"Date demandée
  à S2C"`, `"Type ouverture"`) ; `demandePreteACommander` devient un simple raccourci dessus.
  Les deux messages (blocage à la coche, dévalidation avec confirmation) affichent maintenant
  uniquement les champs concernés.

- **Demandes — enregistrement sans reload() complet** — 2026-09-24
  (`DemandesList.tsx::handleEnregistrer`), retour utilisateur : cliquer "Enregistrer" provoquait
  un "flash" visuel du tableau (perte de scroll, ré-render complet), causé par un `reload()`
  intégral (5 appels réseau) après chaque sauvegarde. Remplacé par une reconstruction du state
  local à partir de ce qui vient d'être envoyé au serveur : mapping id temporaire → id réel pour
  les demandes et sous-caisses nouvellement créées (capturé sur les retours de
  `demandesApi.bulkCreate`/`demandeCaisseApi.create`), retrait des sous-caisses supprimées, mise
  à jour des caisses en stock validées (`caisseStockApi.setValidee`). Même principe que le
  retrait du `reload()` sur la suppression de ligne (cf. bloc "Gestion des caisses" plus haut).
  Les lignes dépliées (`lignesEtendues`) ne sont plus reset à chaque enregistrement, en prime.

- **Recherche/filtre — comportement "commence par" au lieu de "contient"** — implémenté le
  2026-09-25 (`ColumnFilterMenu.tsx`). Le filtre de colonne (menu déroulant sur chaque en-tête
  filtrable du tableau Demandes) utilisait `.includes()` (contient) ; passé à `.startsWith()`
  (commence par), sur les deux points concernés : la liste de valeurs affichées dans le menu ET
  la présélection automatique pendant la frappe (`changerRecherche`, déjà en place depuis le
  2026-08-28). Taper "f" n'affiche/ne présélectionne donc plus que les valeurs commençant par
  "f", recalculé en direct à chaque lettre ajoutée/retirée. **✅ Fait quand** : la liste du menu
  de filtre et la présélection ne contiennent que les valeurs dont le début correspond
  exactement à la recherche tapée — vérifié par lecture de code, `npx tsc --noEmit` validé.

- **Demandes d'achats — contre-plaqué par défaut clarifié (pas de changement de code)** —
  2026-09-25 : confirmé avec l'utilisateur que le comportement actuel de
  `contrePlaqueParDefaut()` (coché par défaut pour STANDARD/4B, décoché par défaut pour 4C) est
  bien celui souhaité — le point du 11 septembre demandait une clarification, pas un changement.

- **Création de caisse : choisir une caisse de stock remplace les dimensions déjà saisies** —
  corrigé le 2026-09-28 (`AjouterDemandesDialog.tsx`, `DemandesList.tsx`, `DemandesTable.tsx`,
  `domain/demandeOptions.ts`). Cause : `DimInput` (dialogue de création) n'initialisait son
  texte qu'une fois et affichait l'ancienne saisie alors que l'état contenait les dimensions du
  stock. Il se resynchronise maintenant quand `valeurMm` change de l'extérieur, sauf si le texte
  en cours correspond déjà à la valeur (la saisie de « 0.xx » reste intacte). Le tableau
  n'était pas concerné (cellules rendues depuis les props).
  **Règle ajoutée à la demande de l'utilisateur** : modifier une dimension d'une caisse liée à
  une caisse en stock **désélectionne** la caisse en stock (`detacherStockSiDimsModifiees`,
  appliquée dans le dialogue, sur la ligne mère `handleEditLocal` et sur la sous-ligne
  `handleEditDemandeCaisse`). Le type d'ouverture « Par dessus » forcé par le stock est gardé
  tel quel (il reste valide). Au passage, les dimensions saisies en édition inline sont
  arrondies au mm (`0.56 * 1000` = `560.0000000000001` passait pour une modification et aurait
  détaché le stock en revalidant une cellule inchangée). `npx tsc --noEmit` validé. **Non testé
  en conditions réelles** (pas d'automation UI).

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
- **Sauvegarde régulière de `caisses.sqlite3`** — implémentée le 2026-09-28 (page Admin ›
  Sauvegarde, cf. journal). **Reste à faire par l'utilisateur** : choisir le dossier (ailleurs
  que le partage de la base, accessible depuis tous les postes) et la fréquence, puis vérifier
  qu'un fichier `caisses_*.sqlite3` apparaît. **Critère de complétude (pas encore atteint)** :
  une sauvegarde automatique réelle constatée dans le dossier choisi.
- **Tester manuellement en conditions réelles** la section Demandes (édition inline, cases à
  cocher, tri) et la navigation par menu — pas d'outil d'automation UI dans l'environnement de
  dev assisté. Le collage Excel 19 colonnes n'est plus à tester : il ne servait qu'à la reprise
  initiale des affaires, l'utilisateur ne collera plus de lignes dans Demandes (2026-09-28).

*Retours utilisateur 2026-09-25*

- **Vérifier le format des dates après la prochaine release** : correctif `--lang=fr-FR`
  (`tauri.conf.json` → `additionalBrowserArgs`, cf. [Bugs.md](Bugs.md) « Sélecteur de date en
  MM/DD/YYYY ») pas encore testé — non reproductible sur le poste maison. Une fois la release
  publiée et le poste du bureau mis à jour : ouvrir un sélecteur de date (création de caisse,
  édition inline Date picking / Date demandée à S2C) et confirmer l'affichage JJ/MM/AAAA. Si ce
  n'est pas le cas, piste suivante : remplacer `<input type="date">` par une saisie texte
  JJ/MM/AAAA contrôlée par l'app. **Critère de complétude (pas encore atteint)** : dates en
  JJ/MM/AAAA dans les sélecteurs sur le poste du bureau.

*Gestion des caisses — retours utilisateur 2026-09-11* — **tous traités, voir "Fait" ci-dessus**
(bloc "Gestion des caisses — retours utilisateur 2026-09-11 (lot complet)").

*Simulations — retours utilisateur 2026-09-11* — **tous traités, voir "Fait" ci-dessus**.

*Demandes d'achats — retours utilisateur 2026-09-11* — **tous traités, voir "Fait" ci-dessus**.
Le point contre-plaqué a été clarifié avec l'utilisateur le 2026-09-25 : le comportement actuel
(`contrePlaqueParDefaut()` — coché par défaut pour STANDARD/4B, décoché par défaut pour 4C) est
bien celui souhaité, aucun changement de code nécessaire.

*Recherche/filtre — retour utilisateur 2026-09-11* — **traité, voir "Fait" ci-dessus**.

*Global*

- **Check global du projet — fait le 2026-09-25**, corrections appliquées :
  - **Injection HTML dans les affiches** : `rendreAfficheHtml` insérait affaire / type
    d'ouverture / demandeur sans échappement dans du HTML rendu via `dangerouslySetInnerHTML`
    (CSP désactivée, `"csp": null`) et collé dans les mails. Ajout de `echapperHtml`
    (`domain/affiches.ts`), appliqué dans `ligneChamp`, au titre, et dans
    `mettreEnEvidenceS2C` (copie mail, couvre le bloc ACHSTOCK qui contient le nom d'affaire).
  - **Règle « nom d'affaire = 8 caractères »** : appliquée aussi à l'édition inline de la
    colonne Affaire (`DemandesTable::sauvegarderChamp`), qui la contournait.
  - **Code mort retiré** : `VALEURS_STOCK` (`demandeOptions.ts`, liste codée en dur remplacée
    par la table `caisse_stock`) et `estCaisseStockDisponible` (`caisseStock.ts`).
  - Doc : entrée ConfirmDialog ajoutée à `Bugs.md` (annoncée mais manquante), passages périmés
    de ce fichier corrigés (section Caisses en stock / Demandes d'achats, état des migrations).
  - Vérifié sans problème : requêtes SQL toutes paramétrées (les seuls `format!` avec nom de
    table viennent d'une liste figée, `options_liste.rs::colonnes_pour_liste`), `require_lock`
    sur toutes les commandes de mutation (sauf `create_affaire`, cohérent : ressource neuve),
    garde AJC du journal côté serveur, `foreign_keys=ON`.
  - **Reste ouvert (sans urgence)** : trois copies d'`EditableCellInput` (composant partagé
    `components/EditableCellInput.tsx` + copies locales dans `ArticlesTable` et
    `DemandesTable`) à regrouper. Gardés volontairement : `PasteImportZoneDemandes.tsx`
    orphelin, `useAffaire.supprimerArticle`. La CSP reste `null` — à réactiver un jour si
    l'app charge du contenu externe, inutile tant que tout est local et échappé.

### À réfléchir plus tard

- **Système de droits/permissions par utilisateur** — décision 2026-09-02 : inutile pour l'usage
  actuel (3 personnes, mêmes droits, interne bienveillant). **Mise à jour 2026-09-28** : un
  premier socle existe (tables `compte` avec `role` et `utilisateur`, session admin, cf. journal
  et ADR 0003) ; l'utilisateur prévoit des droits par tâche plus tard. À concevoir alors :
  quelles tâches, droits portés par `compte.role` ou une table dédiée, et si les autres
  trigrammes doivent aussi avoir un mot de passe.
- **Alias de caisse affiché dans le tableau Demandes** — quand on renomme une caisse dans
  Simulations (souvent pour la rendre explicite, ex. « caisse moteurs »), afficher ce nom sous
  le nom de l'affaire dans la colonne Affaire de la ligne de demande correspondante (caisse
  mère via `caisse.demande_id`, sous-caisse via `caisse.demande_caisse_id`). Rendu discret :
  police plus fine, gris (`--text-muted`), ~11px — purement informatif, non éditable côté
  Demandes. Nécessite de charger les `caisse` liées dans `DemandesList` (via un nouvel endpoint
  « caisses liées à des demandes » ou en filtrant `caissesApi` par affaire), et de n'afficher
  l'alias que s'il diffère du nom de l'affaire.
- **« Aide de dimensions » / dimensions conseillées** (idée notée le 2026-09-03, **jamais
  implémentée**) — un bouton (sur la `CaisseCard` en édition, et/ou dans le dialogue « Créer une
  nouvelle caisse » côté Demandes) qui pré-remplit L/l/H à partir des plus grandes dimensions
  des articles assignés (`dim1MaxMm/dim2MaxMm/dim3MaxMm`, déjà calculés dans `calculerCaisse`)
  **plus un jeu/une marge**. À décider avec l'utilisateur : marge fixe en mm ou en %, valeur,
  éventuellement différente selon STANDARD / 4B / 4C (4C = mousse → marge plus grande, cf.
  `AVERTISSEMENT_MOUSSE_4C` qui parle de +5 cm) ; le bouton pré-remplit à vide ou écrase la
  saisie. Ne rien coder tant que la règle métier n'est pas tranchée.
- **Créer une caisse enfant depuis « + Créer une nouvelle caisse »** (idée 2026-09-03) —
  aujourd'hui les sous-caisses d'une demande se créent uniquement par clic droit sur une ligne
  du tableau (« Créer une nouvelle caisse »). Voir si on ajoute la possibilité de créer
  directement une ou plusieurs caisses enfants dans le dialogue « + Créer une nouvelle caisse »
  (une case « ajouter des caisses détaillées » qui déplie des sous-lignes).
- **Sortir les actions du clic droit du tableau Demandes en boutons** (idée 2026-09-03) — le
  menu contextuel de `DemandesTable` (« Valider / Dévalider la caisse », « Simuler l'affaire »,
  « Créer une nouvelle caisse ») est peu découvrable. Envisager de rendre ces actions visibles
  sous forme de boutons (barre d'actions sur la ligne sélectionnée, ou colonne d'actions), tout
  en gardant éventuellement le clic droit en raccourci.
- **Rapprochement avec les cartons standards existants** (idée notée le 2026-09-11) — certaines
  références de carton ont des dimensions toujours identiques ; on y range des références qui
  seraient sinon comptées comme des articles à caser dans une caisse bois. Il existe un outil
  interne de « colisage » qui regroupe des pièces en colis et génère un fichier de sortie.
  Idée : comparer ce fichier de colisage à la liste d'articles d'une affaire dans Simulations —
  les références déjà présentes dans un colis du fichier seraient retirées (ou masquées) de la
  liste d'articles de l'affaire, et remplacées par le(s) colis correspondant(s) avec leurs
  dimensions propres, pour un calcul de volume/poids plus fidèle à la réalité (et garder le
  seuil d'alerte existant sur le résultat). À trancher avant tout code : format du fichier
  généré par l'outil de colisage (colonnes, un exemple réel), comment un colis est identifié
  côté import (référence de carton ? liste des AR qu'il contient ?), et si le rapprochement se
  fait par simple correspondance de référence ou nécessite une étape de vérification manuelle
  avant application.
- **Alerte « poids total de l'affaire > 350 kg »** (idée notée le 2026-09-28) — dans
  Simulations, afficher une alerte quand le poids total de l'affaire dépasse 350 kg. Candidat
  naturel : un bandeau dans `RecapAffaireBandeau` (`AffaireDetail.tsx`), comme l'alerte
  « volume affaire > capacité des caisses », le poids total étant déjà calculé côté
  `domain/calculs.ts`. À trancher avant de coder : poids des articles seuls ou poids caisse
  incluse (le poids du bois n'est pas calculé aujourd'hui) ; tous les articles de l'affaire ou
  seulement les assignés ; alerte à l'échelle de l'affaire ou aussi par caisse ; seuil fixe ou
  paramétrable (comme `seuil_defaut`) ; `> 350` ou `>= 350`.

### Documentation utilisateur

- Page **Documentation** (`src/routes/Documentation.tsx`, bouton de la navbar et en bas à gauche de
  l'accueil). Texte **réécrit le 2026-09-28 d'après celui fourni par l'utilisateur** : Gestion des
  caisses (création / gestion), Simuler, entreprise, Assigner, Passer la commande, Caisses en
  stock (+ Gérer les caisses), Gérer les références, Verrouillage et demande d'écriture, Base de
  données et sauvegarde. **Consigne** : n'y mentionner ni le journal ni la page Admin pour
  l'instant. À tenir à jour quand un comportement décrit change.
- Terme « demande de crayon » remplacé par **« demande d'écriture »** dans l'app (bouton du
  bandeau de verrouillage, 2026-09-28). Les identifiants du code (`request_pen`, `onRequestPen`…)
  et les entrées historiques de ce fichier gardent l'ancien terme.

### Annulé pour le moment

- **Export/impression d'un récapitulatif d'affaire** — abandonné (2026-09-02). Aucun besoin
  concret ; la copie d'affiche (Demandes d'achats) couvre le seul cas de sortie utile.
- **Signature Authenticode de l'installeur (contre le faux positif Windows Defender)** —
  abandonnée le 2026-09-09, deux pistes essayées puis écartées :
  - **SignPath.io plan Open Source (Foundation)** : demande envoyée le 2026-09-02, repo préparé
    en conséquence (`LICENSE` MIT, `README.md` réécrit avec mention SignPath Foundation,
    métadonnées `package.json`/`Cargo.toml`). Intégration technique validée manuellement dans le
    dashboard SignPath (organisation « Caisse », projet « Caisses », policy `test-signing`, deux
    Artifact Configurations `initial`/`nsis-installer` signant correctement .msi et .exe via
    upload direct) — seule l'intégration **CI** butait sur `Could not authorize against SignPath
    API`, causé par le compte resté en **Free trial** (édition sans la vérification « Trusted
    Build System » requise par `signpath/github-action-submit-signing-request`). **Refusée le
    2026-09-09** : réponse officielle par email — le programme Foundation vise des projets ayant
    déjà une visibilité publique établie (stars/forks/contributeurs GitHub, articles, discussions
    externes, adoption communautaire) ; Caisses, outil interne d'entreprise au dépôt
    techniquement public mais sans audience, ne correspond pas à ce profil (refus jugé cohérent,
    pas un accident administratif). Passer en payant aurait réglé le blocage CI mais tarif
    SignPath payant non public/à négocier.
  - **Certum Open Source Code Signing** (plan B envisagé, ~30 €/an, token cloud signable en CI) :
    écarté aussi — même contrainte d'éligibilité que SignPath Foundation (projet OSS non
    commercial souscrit par un individu), ne correspond pas au profil réel du projet. Le produit
    adapté serait un Certum Standard/Cloud Code Signing payant classique (~90-150 $/an selon
    revendeur, sans contrainte d'éligibilité).
  - **Décision finale** : pas d'abonnement de signature payant pour l'instant, cohérent avec un
    usage à 2-3 postes internes plutôt qu'une diffusion publique. Le workflow
    `.github/workflows/release.yml` a été remis dans son état d'avant les essais SignPath (aucune
    étape de signature). On reste sur la procédure manuelle : soumission Microsoft Defender à
    chaque version (cf. « Distribution et releases › Soumission à Microsoft Defender ») + exclusion Defender au besoin. À reconsidérer si le nombre
    de postes/utilisateurs grandit significativement, ou si le rythme des faux positifs Defender
    devient trop pénible.
