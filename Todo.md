# Todo

## Lancer l'application en local

```bash
npm run tauri dev
```

## Évolution : menu principal à 4 sections

- [x] **Simulations** — ancien écran d'accueil, déplacé sous le menu (aucun changement fonctionnel).
- [x] **Demandes** — tableau des colonnes du fichier Excel (AFFAIRE, type envoi, dimensions,
      dates, moteurs, etc.), avec collage multi-lignes depuis Excel, édition inline, tri,
      cases à cocher pour les 3 champs booléens. Implémenté le 2026-07-27 — **à tester
      manuellement en conditions réelles** avec le vrai contenu du fichier Excel.
- [ ] **Caisses en stock** — stub pour l'instant. Présentation à définir.
- [ ] **Demandes d'achats** — stub pour l'instant. Doit générer l'"affiche" (date, affaire,
      dimensions intérieures, qté, transpalette, délai, position fermeture, contre-plaqué) à
      envoyer par mail. Modalités d'envoi et mise en page à définir.

Voir le journal détaillé (2026-07-27) et le modèle de données dans `CLAUDE.md`.

## À développer

- [ ] Générer un exécutable installable (build de prod, `npm run tauri build`) pour tester
      l'app hors du mode dev — actuellement testée uniquement via `npm run tauri dev`.
- [ ] Idée : proposition automatique de dimensions de caisse — quand une affaire (Simulations)
      contient déjà des articles, proposer une caisse dont L/l/H reprennent la plus grande
      longueur, la plus grande largeur et la plus grande hauteur parmi les articles de
      l'affaire. Attention à la conversion d'unité : dimensions articles en mm, caisse attendue
      en mètres pour la saisie utilisateur (cohérent avec le reste de l'app qui stocke tout en
      mm en interne).
- [ ] Idée : une fois qu'une demande est validée (verte), verrouiller la case "Ok pour passer
      cde" pour qu'elle ne puisse plus être décochée/modifiée par erreur.
- [ ] Idée (Demandes d'achats) : quand une ligne est cochée "Ok pour passer cde", pré-remplir
      automatiquement dans l'onglet "Demandes d'achats" une mini affiche reprenant les infos de
      la demande + d'autres infos à définir, adaptée selon le type d'envoi. Une affiche par
      affaire cochée (se multiplie selon le nombre de lignes en Ok pour cde). Usage prévu dans
      un premier temps : copier le contenu dans un mail pour passer commande — pas forcément un
      rendu image, potentiellement un tableau qui se remplit au fur et à mesure. Modalités
      précises (champs exacts, mise en page, règles par type d'envoi) à définir avec
      l'utilisateur avant implémentation.
