# Bugs résolus — index par symptôme

Objectif : retrouver en quelques secondes si un bug déjà rencontré revient sous une forme
légèrement différente, sans re-déboguer depuis zéro. Le détail narratif complet (contexte,
investigation) reste dans le "Journal des étapes" de `CLAUDE.md` — ce fichier est un index de
recherche rapide, pas un doublon.

Convention : un bug par entrée, titré par le **symptôme observé** (pas la cause), avec la cause
racine, le fix, et un lien vers l'entrée de journal correspondante pour le détail complet.

---

## Collage Excel : une ligne coupée en deux articles (AR = fin de la désignation)

**Symptôme** : après « Coller depuis Excel » dans Simulations, un article apparaît en double :
la 2e ligne a pour AR la fin de la désignation de la 1re (ex. `20X47X24"`), puis ses dimensions
dans les colonnes Référence / Désignation.

**Cause** : la désignation était une cellule Excel sur **plusieurs lignes** (Alt+Entrée), qu'Excel
copie entre guillemets. Le texte était découpé en deux passes (lignes, puis colonnes) ; dans la
passe « lignes », seul un retour à la ligne marquait un début de champ, pas une tabulation — un
champ quoté hors de la 1re colonne n'était donc pas reconnu et son retour à la ligne interne
coupait la ligne.

**Fix** (2026-09-30, `domain/tsv.ts::decouperTableauTsv`) : découpage lignes + colonnes en une
seule passe, un guillemet ouvre un champ quoté en début de champ (après tabulation ou retour à
la ligne). La règle des guillemets nus du 2026-09-03 (`G1/8" m`) est conservée. Retour à la
ligne interne de la désignation remplacé par un espace à l'import.

---

## Alerte « date dans le passé » en boucle pendant la frappe, date du calendrier perdue

**Symptôme** : dans « Créer une nouvelle caisse », saisir la date demandée à S2C au clavier
déclenche l'alerte « date dans le passé » avant d'avoir fini l'année (et à nouveau à chaque
chiffre) ; choisir la date à la souris dans le calendrier ne l'enregistre pas, comme un clic à
côté.

**Cause** : la vérification était faite dans le `onChange` du `<input type="date">`, qui se
déclenche à chaque frappe — pendant la saisie de l'année, la date vaut transitoirement 0002,
0020, 0202… (passé). La valeur n'était appliquée qu'après la confirmation, et le dialogue ouvert
en pleine saisie / sélection faisait perdre la valeur.

**Fix** (2026-09-28, `AjouterDemandesDialog.tsx`) : `onChange` applique la valeur telle quelle ;
la vérification se fait au `onBlur` (sortie du champ), en comparant à la valeur mémorisée au
`onFocus` — refus → retour à cette valeur. L'édition inline du tableau n'était pas concernée
(`EditableCellInput` ne valide déjà qu'à la sortie de la cellule / Entrée). **Règle** : ne
jamais ouvrir de dialogue depuis le `onChange` d'un champ date.

---

## Sélecteur de date en MM/DD/YYYY sur un poste réglé en JJ/MM/AAAA

**Symptôme** : sur le poste du bureau, le champ date natif (`<input type="date">`, dialogue de
création et édition inline des dates) affiche la date choisie en MM/DD/YYYY, alors que le format
régional de Windows est JJ/MM/AAAA. Le poste maison, lui, affiche bien JJ/MM/AAAA.

**Cause** : le champ date de WebView2 (Chromium) suit la **langue d'affichage** du WebView (dérivée
de la langue d'interface de Windows, probablement anglaise sur ce poste), pas le format régional
de Windows ni l'attribut `lang` de la page. Le stockage n'est pas concerné (toujours ISO
AAAA-MM-JJ) ; les dates affichées dans le tableau passent par `dateIsoVersAffichage` et étaient
déjà en JJ/MM/AAAA.

**Fix** : `tauri.conf.json` → `app.windows[0].additionalBrowserArgs` avec `--lang=fr-FR`.
Attention : ce réglage **remplace** les arguments par défaut de Tauri, qu'il faut donc
reprendre (`--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection`). `index.html` passé
aussi en `lang="fr"`. Le changement touche la config Rust : il faut une release pour qu'il
arrive sur les postes installés.

**Journal** : 2026-09-25.

---

## Dialogue de confirmation jamais visible, l'action s'applique directement

**Symptôme** : mettre une dimension à 0 sur une demande « OK pour être commandée » décochait la
case sans afficher la confirmation prévue, avec une légère latence après l'appui sur Entrée.

**Cause** : la cellule du tableau est validée par Entrée, ce qui déclenche aussitôt
`confirmerAction`. `ConfirmDialog` écoute Entrée = Confirmer sur `window` : la répétition
automatique du clavier (`event.repeat`) du **même** appui physique arrivait juste après
l'ouverture du dialogue et le confirmait avant tout affichage. La logique métier était correcte
(vérifié par logs : les champs manquants étaient bien détectés).

**Fix** : `ConfirmDialog` ignore `event.repeat` et n'arme ses raccourcis Entrée/Échap que 150 ms
après son ouverture. Vaut pour tout dialogue ouvert juste après une validation au clavier.

**Journal** : 2026-09-24.

---

## Caisse enfant ne passe pas en vert à la validation de la caisse mère

**Symptôme** : valider une demande mère (case "Cde passée sur affaire" cochée) colore bien sa
ligne en vert, mais ses sous-caisses (`demande_caisse`) gardent leur couleur pastel d'origine —
alors que la cascade est censée les valider aussi.

**Cause** : `DemandesList.handleValider` écrit l'observation `"Livré"` (sans accent final, forme
neutre) sur les sous-caisses. Mais `domain/demandeOptions.ts::estDemandeCaisseValidee` testait
`obs.includes("livrée")` (avec accent final) — `"livré"` ne contient pas `"livrée"` comme
sous-chaîne, donc le test échouait toujours pour cette orthographe précise. La ligne mère restait
correctement verte car `estDemandeValidee` teste *aussi* le booléen `d.validee` (indépendant du
texte) — un filet de sécurité que les sous-caisses n'ont pas, elles ne reposent que sur le texte
de l'observation.

**Fix** : `estDemandeCaisseValidee` et `estDemandeValidee` testent maintenant `"livré"`/`"livre"`/
`"rapatrié"`/`"rapatrie"` (sans exiger le accent final) — `"livré"` matche à la fois lui-même et
`"livrée"` en tant que sous-chaîne, donc les deux orthographes passent avec un seul test.

**Journal** : 2026-09-24.

---

## "Affaire introuvable" à l'ouverture après ajout d'une colonne DB

**Symptôme** : ouverture d'une affaire existante échoue avec "Affaire introuvable", alors que
l'affaire existe bien en base.

**Cause** : une commande de lecture (`list_articles`) échouait silencieusement sur une colonne
manquante (base ouverte avant une migration ajoutant une colonne), ce qui faisait échouer tout
le `Promise.all` de `useAffaire.reload()` et empêchait `setAffaire` de s'exécuter — l'erreur
réelle était masquée par l'échec du bloc parent.

**Fix** : remplacement du système de migration `CREATE TABLE IF NOT EXISTS` (qui ne migre jamais
une table existante) par un runner de migrations versionnées (table `_migrations`, liste
ordonnée dans `db.rs::MIGRATIONS`).

**Journal** : 2026-07-21 — "Ajout du champ AR (référence interne)".

---

## Collage Excel : lignes valides rejetées ("N colonnes trouvées, 8 attendues")

**Symptôme** : une ligne collée depuis Excel est rejetée à tort quand ses dernières cellules
sont vides.

**Cause** : Excel n'émet pas de tabulation pour les cellules vides en fin de ligne lors du
copier-coller — le nombre de segments après `split("\t")` est inférieur au nombre de colonnes
attendu alors que la ligne est valide.

**Fix** : `parseColle` complète les colonnes manquantes en fin de ligne avec des chaînes vides
au lieu de rejeter la ligne ; seul un excès de colonnes reste une erreur.

**Journal** : 2026-07-24 — "Retours utilisateur après premier vrai usage".

---

## Collage Excel : désignation avec guillemet (`G1/8" m`) fusionne plusieurs lignes en un seul champ

**Symptôme** : une désignation contenant un `"` au milieu du texte fait disparaître le retour à
la ligne suivant — plusieurs lignes Excel se retrouvent fusionnées dans un seul champ importé.

**Cause** : le parseur TSV traitait tout `"` comme ouvrant/fermant un champ "quoté" (convention
CSV), quelle que soit sa position dans le champ.

**Fix** : un `"` n'est traité comme ouvrant un champ quoté que s'il est **en début de champ**
(juste après une tabulation ou un retour à la ligne) ; ailleurs c'est un littéral. `domain/tsv.ts`
partage cette logique (`decouper()`) entre découpage lignes et colonnes.

**Journal** : 2026-09-03 — "Collage Excel — robustesse".

---

## Copie groupée des affiches (Demandes d'achats) : marche seulement au 2ᵉ essai

**Symptôme** : la première tentative de "Copier la sélection" colle un mail sans aucune image ;
recommencer immédiatement fonctionne.

**Cause** : `capturerPng` (html-to-image) était appelé juste après le montage d'une carte, avant
que le `<img>` du logo (base64 injecté via `dangerouslySetInnerHTML`) n'ait fini de décoder.
`img.complete` peut être `true` avant le premier paint réel — un raccourci sur cette seule
propriété ne suffit pas à garantir que l'image est prête à être capturée.

**Fix** : `capturerAvecRetries` — `img.decode()` sur *toutes* les images du conteneur + 2
`requestAnimationFrame` + jusqu'à 4 retentatives avec pause croissante, rejet des blobs < 1 ko.

**Journal** : 2026-08-26 (bug initial) puis 2026-09-03 (durcissement — c'était la vraie cause).

---

## Icône de la barre des tâches pas mise à jour après changement de logo

**Symptôme** : après une release avec nouveau logo, les raccourcis/l'explorateur affichent la
nouvelle icône, mais la barre des tâches Windows garde l'ancienne.

**Cause probable (non confirmée)** : cache d'icônes Windows (`IconCache.db`) qui ne se
rafraîchit pas automatiquement après remplacement du `.ico` embarqué par l'auto-updater —
comportement connu de l'Explorateur Windows, pas spécifique à Tauri.

**Statut** : pas encore confirmé/corrigé — voir "À faire" dans `CLAUDE.md`. À mettre à jour ici
avec le vrai correctif une fois tranché (purge de cache, redémarrage Explorer, ou invalidation
forcée par le NSIS à l'installation).

**Journal** : 2026-09-11.

---

## Faux positif Windows Defender sur l'installeur auto-update

**Symptôme** : l'auto-updater télécharge un installeur détecté comme
`Trojan:Win32/Bearfoos.B!ml` par Windows Defender.

**Cause** : détection ML de Defender, faux positif classique sur des binaires Tauri non signés
(pas de certificat Authenticode — voir `docs/ADR/0002-pas-de-signature-authenticode.md`).

**Fix (procédure, pas un correctif de code)** : soumission à
https://www.microsoft.com/wdsi/filesubmission (produit "Microsoft Defender Antivirus") à chaque
version concernée — validé comme faux positif en 24-72h historiquement. Si un poste reste
bloqué en attendant : exclusion Defender du dossier d'install + du dossier temporaire de
l'updater (`%TEMP%\Caisses-*-updater-*`).

**Journal** : 2026-09-02 (v0.8.0), confirmé 2026-09-03.
