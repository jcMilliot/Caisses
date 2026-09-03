# Caisses

Application de bureau (Windows) qui remplace un fichier Excel pour dimensionner
des **caisses en bois d'expédition** : on saisit des articles avec leurs
dimensions et leur poids, on les répartit dans des caisses, et l'application
calcule pour chaque caisse le volume occupé, le taux de remplissage et le poids
total, avec une alerte visuelle selon un seuil paramétrable.

L'app s'organise autour de quatre sections :

- **Gestion des caisses** — tableau de suivi des demandes de caisses (multi-lignes,
  collage depuis Excel, caisses détaillées par demande).
- **Simulations** — le cœur historique : créer des *affaires* (un dossier de calcul
  par projet), y saisir des articles, créer plusieurs caisses et assigner les
  articles, avec calcul automatique des volumes / poids / taux de remplissage.
- **Caisses en stock** — inventaire des caisses disponibles.
- **Demandes d'achats** — génération des « affiches » de commande à envoyer par mail.

Utilisation interne, multi-poste (base de données partagée), avec un verrouillage
applicatif « qui a la main » et un journal d'audit.

## Stack technique

- **[Tauri 2](https://tauri.app/)** — backend Rust, WebView système (pas de runtime
  Electron / Chromium embarqué)
- **React 19 + TypeScript**, Vite
- **SQLite local** (`rusqlite`, SQLite compilé depuis les sources) — un seul fichier
  `caisses.sqlite3` dans un dossier choisi au premier lancement (peut être un
  partage réseau)
- Aucune télémétrie. La seule activité réseau est la vérification de mise à jour
  auprès de GitHub Releases.

## Développement

Prérequis : Rust (toolchain `stable-msvc`), Visual Studio Build Tools 2022
(workload « Desktop development with C++ »), WebView2 runtime (présent par défaut
sur Windows 10/11 à jour), Node.js.

```bash
npm install                    # dépendances JS
npm run tauri dev              # app en dev (hot reload frontend + backend)
npm run tauri build            # build de production (installeurs MSI + NSIS)
npx tsc --noEmit               # vérification des types TypeScript
cd src-tauri && cargo check    # vérification de compilation du backend Rust
```

Le schéma SQLite évolue par migrations versionnées (`migrations/000N_*.sql`,
embarquées dans le binaire et listées dans `src-tauri/src/db.rs`).

## Distribution

Les binaires Windows sont produits automatiquement par un workflow GitHub Actions
(`.github/workflows/release.yml`) au push d'un tag `vX.Y.Z`, publiés en release
brouillon sur GitHub. Les postes installés se mettent à jour via l'auto-updater
Tauri (endpoint : GitHub Releases).

## Signature de code

Les binaires Windows de ce projet sont signés (Authenticode) à l'aide d'un
certificat fourni gracieusement par la [SignPath Foundation](https://signpath.org/)
(demande en cours au moment de la rédaction).

## Licence

[MIT](LICENSE).
