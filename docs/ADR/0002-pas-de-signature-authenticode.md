# 0002 — Pas de signature Authenticode de l'installeur

**Statut** : Acceptée — 2026-09-09.

## Contexte

L'installeur auto-update (NSIS, généré par le workflow CI) déclenche régulièrement un faux
positif Windows Defender (`Trojan:Win32/Bearfoos.B!ml`, détection ML classique sur des binaires
Tauri non signés — voir [Bugs.md](../../Bugs.md)). Une signature Authenticode élimine
structurellement ce type de faux positif.

## Décision

Ne pas signer l'installeur pour l'instant. Rester sur une procédure manuelle : soumission à
Microsoft Defender (https://www.microsoft.com/wdsi/filesubmission) à chaque version concernée,
plus exclusion Defender ponctuelle sur un poste bloqué si besoin.

## Alternatives écartées

- **SignPath.io, plan Open Source (Foundation)** : intégration technique validée manuellement
  (signature .msi/.exe fonctionnelle dans le dashboard), mais l'intégration CI butait sur le
  compte resté en Free trial (édition sans la vérification "Trusted Build System" requise par
  l'action GitHub officielle). **Candidature au plan Foundation refusée le 2026-09-09** :
  réponse officielle — le programme vise des projets ayant déjà une visibilité publique établie
  (stars/forks/contributeurs, articles, adoption communautaire). Caisses est un outil interne
  d'entreprise, dépôt techniquement public mais sans audience — refus jugé cohérent avec le
  profil réel du projet, pas un accident administratif.
- **Certum Open Source Code Signing** (~30 €/an) : même contrainte d'éligibilité que SignPath
  Foundation (projet OSS non commercial porté par un individu) — ne correspond pas non plus au
  profil du projet.
- **Certum Standard/Cloud Code Signing payant classique** (~90-150 $/an) : éligible (pas de
  contrainte OSS), mais jugé disproportionné pour un usage à 2-3 postes internes.

## Conséquences acceptées

- Chaque nouvelle version peut déclencher à nouveau le faux positif Defender — la soumission
  manuelle est à refaire systématiquement, pas un correctif définitif.
- Un poste peut rester temporairement bloqué le temps de la validation Microsoft (historiquement
  24-72h) — mitigation : exclusion Defender manuelle si urgent.
- Le workflow `.github/workflows/release.yml` reste sans étape de signature (remis dans son état
  d'avant les essais SignPath).

## Quand reconsidérer

Si le nombre de postes/utilisateurs grandit significativement, ou si le rythme des faux positifs
Defender devient trop pénible en pratique — repasser sur un abonnement payant classique
(Certum Standard/Cloud ou équivalent), sans contrainte d'éligibilité OSS à respecter cette fois.
