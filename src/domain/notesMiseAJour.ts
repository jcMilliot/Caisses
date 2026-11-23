// Notes de mise à jour (page « Notes de mise à jour » de l'accueil, 2026-10-29) : ce qui change
// à chaque version, écrit pour les utilisateurs, SANS termes techniques (demande de l'utilisateur :
// les autres utilisateurs ne sont pas du métier informatique). À compléter à chaque release, en
// tête de liste. `**gras**` est rendu en gras.

export type GenreRubrique = "nouveau" | "ameliore" | "corrige";

export interface PointNote {
  icone: string;
  titre: string;
  texte: string;
  details?: string[];
}

export interface Rubrique {
  genre: GenreRubrique;
  points: PointNote[];
}

export interface NoteVersion {
  version: string;
  // JJ/MM/AAAA
  date: string;
  resume: string;
  rubriques: Rubrique[];
}

export const LIBELLE_RUBRIQUE: Record<GenreRubrique, { titre: string; icone: string }> = {
  nouveau: { titre: "Nouveautés", icone: "🆕" },
  ameliore: { titre: "Améliorations", icone: "✨" },
  corrige: { titre: "Corrections", icone: "🔧" },
};

export const NOTES_MISE_A_JOUR: NoteVersion[] = [
  {
    version: "0.24.1",
    date: "23/11/2026",
    resume: "Petite correction d'affichage dans Demandes d'achats.",
    rubriques: [
      {
        genre: "corrige",
        points: [
          {
            icone: "🖼️",
            titre: "Demandes d'achats : titre bien lisible",
            texte:
              "Quand on fait défiler plusieurs affiches, elles ne réapparaissent plus en transparence au-dessus du titre de la page.",
          },
        ],
      },
    ],
  },
  {
    version: "0.24.0",
    date: "17/11/2026",
    resume: "Le contrôle dimensionnel se met à jour tout seul depuis l'intranet, et l'export calcule les écarts.",
    rubriques: [
      {
        genre: "ameliore",
        points: [
          {
            icone: "📏",
            titre: "Contrôle dimensionnel : toujours à jour",
            texte:
              "À l'ouverture de la page, l'application relit l'intranet pour **toutes les affaires en cours** : les nouveaux articles apparaissent sans avoir à ouvrir chaque affaire dans Simulations, et les colonnes « Affaires » et « Dispo pour ctrl » sont à jour.",
            details: [
              "Le bouton **« Actualiser depuis l'intranet »** relit tout à la demande.",
              "Une pièce **décolisée** revient avec son affaire ; une pièce colisée depuis disparaît.",
            ],
          },
          {
            icone: "📄",
            titre: "Export « À contrôler » : écarts calculés",
            texte:
              "Quatre colonnes **« Écart »** (longueur, largeur, hauteur, poids) suivent les valeurs actuelles : elles se remplissent toutes seules quand on saisit les mesures dans le fichier, avec un **point** pour les décimales.",
          },
          {
            icone: "📦",
            titre: "Simulations : pièces décolisées libérées",
            texte:
              "Une pièce qui n'est pas dans un colis n'est plus verrouillée, même si elle était prévue dans une caisse déjà livrée : on peut la mettre dans la caisse qui part ensuite.",
          },
        ],
      },
      {
        genre: "corrige",
        points: [
          {
            icone: "🔧",
            titre: "Message de l'intranet plus clair",
            texte: "Quand l'intranet répond de façon inhabituelle pour une affaire, le message dit maintenant ce qu'il a renvoyé.",
          },
        ],
      },
    ],
  },
  {
    version: "0.23.0",
    date: "17/11/2026",
    resume: "Les caisses de stock et de récup ne passent plus par S2C, et l'export du contrôle dimensionnel est plus pratique à remplir.",
    rubriques: [
      {
        genre: "ameliore",
        points: [
          {
            icone: "📋",
            titre: "Gestion des caisses : caisse de stock ou de récup",
            texte:
              "Une ligne qui utilise une caisse **de stock** ou **de récup** ne demande rien à S2C : la **date demandée à S2C** est grisée et n'est plus obligatoire pour cocher « OK pour être commandée », et **aucune affiche** n'est créée.",
            details: [
              "Les lignes **ACHSTOCK** (caisses achetées pour le stock) ne changent pas : la date reste demandée et la ligne apparaît dans la copie du mail.",
            ],
          },
          {
            icone: "📏",
            titre: "Contrôle dimensionnel : export « À contrôler »",
            texte:
              "Les colonnes sont dans l'ordre du relevé : **Affaire**, **Article**, les quatre mesures à noter, puis les valeurs actuelles sur **fond bleu-gris** pour les distinguer.",
          },
        ],
      },
      {
        genre: "corrige",
        points: [
          {
            icone: "🛒",
            titre: "Demandes d'achats : référence des caisses ACHSTOCK",
            texte: "La référence de la caisse commandée pour le stock s'affiche de nouveau, dans la liste comme dans la copie du mail (elle apparaissait parfois en « — »).",
          },
        ],
      },
    ],
  },
  {
    version: "0.22.0",
    date: "17/11/2026",
    resume: "Le contrôle dimensionnel indique les pièces qu'on peut aller mesurer tout de suite.",
    rubriques: [
      {
        genre: "nouveau",
        points: [
          {
            icone: "📏",
            titre: "Contrôle dimensionnel : « Dispo pour ctrl »",
            texte:
              "Une nouvelle colonne **« Dispo pour ctrl »** dit, pour chaque article à contrôler, si la pièce est **en stock** ou **déjà sortie** dans une des affaires listées. L'affaire où la trouver ressort **en vert**.",
            details: [
              "L'information est relue à chaque ouverture de la page ; le bouton **« Actualiser la dispo »** la relit à la demande.",
              "La case **« Dispo pour ctrl seulement »** ne garde que les pièces disponibles, à l'écran comme dans l'export Excel.",
              "Un « ? » signale une affaire dont l'information n'a pas pu être lue.",
            ],
          },
        ],
      },
      {
        genre: "corrige",
        points: [
          {
            icone: "📄",
            titre: "Export Excel",
            texte: "Les nombres des exports du contrôle dimensionnel s'écrivent avec un **point** (400.5) et non plus une virgule.",
          },
        ],
      },
    ],
  },
  {
    version: "0.21.1",
    date: "17/11/2026",
    resume: "Le contrôle dimensionnel n'indique plus les affaires déjà expédiées.",
    rubriques: [
      {
        genre: "corrige",
        points: [
          {
            icone: "📏",
            titre: "Contrôle dimensionnel : où trouver la pièce",
            texte:
              "La colonne **« Affaires »** ne cite plus que les affaires où la pièce est encore là : plus d'affaire **déjà expédiée**, ni de pièce rangée dans une caisse **déjà livrée**.",
            details: [
              "Si une affaire part en plusieurs fois, elle reste indiquée tant qu'une caisse est encore à livrer.",
              "Une pièce qui n'est plus nulle part reste dans la liste à contrôler, sans affaire : on attend sa prochaine arrivée.",
            ],
          },
        ],
      },
    ],
  },
  {
    version: "0.21.0",
    date: "16/11/2026",
    resume: "Un nouvel outil pour vérifier les mesures des grands articles, et l'ajout d'une caisse après une première expédition.",
    rubriques: [
      {
        genre: "nouveau",
        points: [
          {
            icone: "📏",
            titre: "Contrôle dimensionnel",
            texte:
              "Les mesures des articles sont prises à la main et une erreur fausse tout le colisage. Une nouvelle carte de l'accueil, **« Contrôle dimensionnel »**, liste les articles à revérifier : ceux dont **2 dimensions sur 3 atteignent 350 mm**.",
            details: [
              "La liste se remplit toute seule avec les articles des simulations, et avec chaque nouveau picking.",
              "Tant qu'il reste des articles à contrôler, la carte de l'accueil est entourée d'un **halo rouge**.",
              "Pièce en main : **« Conforme »** si les mesures sont bonnes, sinon **« Corriger… »** pour noter les bonnes dimensions et le bon poids.",
              "Un article validé reste tranquille **un an**, puis revient dans la liste.",
              "Les articles corrigés passent dans l'onglet **« Dimensions corrigées »**. Une fois la fiche de l'article corrigée, on les valide un par un ou plusieurs à la fois.",
              "**« Exporter en Excel »** donne la liste à imprimer ou à ouvrir sur une tablette près des pièces, avec des colonnes vides pour noter les mesures, ainsi que la liste des corrections à reporter.",
              "La colonne « Affaires » indique où trouver la pièce, sauf si elle est déjà dans un colis : on attend alors sa prochaine arrivée.",
            ],
          },
        ],
      },
      {
        genre: "ameliore",
        points: [
          {
            icone: "🚚",
            titre: "Ajouter une caisse après une première expédition",
            texte:
              "Dans une simulation dont la première caisse est déjà livrée, une nouvelle caisse peut maintenant être ajoutée dans **Gestion des caisses**, sous la ligne de l'affaire, avec la même date de picking. Elle reste à commander et à livrer.",
            details: [
              "L'ajout est proposé par **« + Nouvelle caisse »** comme par **« Assigner à → Nouvelle caisse »**.",
              "Dans **« Lier… »**, une ligne déjà livrée ou déjà liée à une autre caisse ne peut plus être choisie.",
            ],
          },
        ],
      },
      {
        genre: "corrige",
        points: [
          {
            icone: "🏠",
            titre: "Accueil",
            texte: "Le lien **« Documentation »** est passé en haut à droite : il ne cache plus la carte « Notes de mise à jour » quand la fenêtre est petite.",
          },
        ],
      },
    ],
  },
  {
    version: "0.20.1",
    date: "30/10/2026",
    resume: "Le comparatif de Colisage en cours donne une idée juste des dimensions, même quand le colisage n'est pas terminé.",
    rubriques: [
      {
        genre: "ameliore",
        points: [
          {
            icone: "📦",
            titre: "Colisage en cours : un comparatif plus juste",
            texte:
              "Jusqu'ici, la colonne **« Colisage en cours »** ne comptait que ce qui était déjà dans un colis : en plein colisage, l'écart avec le picking ne voulait pas dire grand-chose. Maintenant, elle part de **toutes les pièces du picking** et s'affine au fur et à mesure qu'on colise.",
            details: [
              "Une pièce **pas encore colisée** compte avec ses propres dimensions, dans la caisse où elle est rangée dans le Picking.",
              "Un **colis avec un carton** compte pour la taille de son carton, une seule fois pour tout ce qu'il contient.",
              "Au départ, les deux colonnes sont égales ; l'écart apparaît à mesure qu'on choisit les cartons, et le taux de remplissage se met à jour tout seul.",
              "La carte de chaque caisse indique combien d'articles ne sont pas encore colisés.",
            ],
          },
        ],
      },
    ],
  },
  {
    version: "0.20.0",
    date: "29/10/2026",
    resume: "Une affaire peut maintenant être expédiée en plusieurs fois : une caisse d'abord, les autres plus tard.",
    rubriques: [
      {
        genre: "nouveau",
        points: [
          {
            icone: "🚚",
            titre: "Expédier une affaire en plusieurs fois",
            texte:
              "Dans **Gestion des caisses**, chaque caisse détaillée (les lignes sous la caisse principale) se commande et se livre maintenant **toute seule**. On peut envoyer la caisse principale tout de suite et les autres plus tard.",
            details: [
              "Chaque caisse détaillée a sa propre case **« OK pour être commandée »** : seule une caisse cochée part dans les affiches de Demandes d'achats.",
              "Chaque caisse détaillée a son propre bouton **« Livré »**. Le bouton « Livré » de la caisse principale livre aussi les caisses détaillées déjà cochées ; les autres restent à livrer.",
              "Une caisse détaillée peut avoir **sa propre date de picking**.",
              "La **date demandée à S2C** n'est plus recopiée de la caisse principale : elle est à remplir au moment de commander la caisse.",
            ],
          },
          {
            icone: "⏰",
            titre: "Alerte « À commander » pour chaque caisse",
            texte:
              "Une caisse détaillée pas encore commandée, dont le picking approche, est signalée comme les autres : en rouge sur l'accueil (par exemple **« USACM109 caisse 2 — À commander »**), par la pastille rouge du tableau et sur l'icône de l'application.",
          },
          {
            icone: "🔒",
            titre: "Les pièces déjà parties sont verrouillées",
            texte:
              "Dans **Simulations**, une caisse livrée affiche **« Livrée le … »**. Ses articles portent un cadenas : on ne peut plus les changer de caisse, et la caisse livrée ne reçoit plus de nouvel article. On ne travaille plus que sur ce qui reste à envoyer.",
          },
          {
            icone: "🗂️",
            titre: "Colisage en cours : un onglet par envoi",
            texte:
              "Quand une partie de l'affaire est déjà livrée, l'onglet **Colisage en cours** se découpe : **« 1er envoi »** (ce qui est parti, avec ses colis et ses calculs), **« 2ème envoi »** (les caisses pas encore livrées et les pièces restantes), et ainsi de suite à chaque livraison.",
          },
          {
            icone: "🔢",
            titre: "Un numéro pour chaque caisse",
            texte:
              "Toutes les caisses d'une affaire portent le nom de l'affaire. Pour les distinguer, chaque caisse a un **numéro de couleur** (1, 2…), sur sa carte et dans la colonne **Caisse** du tableau. On peut trier et filtrer sur ce numéro.",
          },
          {
            icone: "📰",
            titre: "Cette page",
            texte: "Les nouveautés de chaque version sont expliquées ici, depuis la carte **« Notes de mise à jour »** de l'accueil.",
          },
        ],
      },
      {
        genre: "ameliore",
        points: [
          {
            icone: "⬇️",
            titre: "Mise à jour en un clic",
            texte:
              "Quand une nouvelle version est disponible, la barre bleue en haut de l'écran affiche un seul bouton, plus grand : **« Mettre à jour »**. L'application s'installe et redémarre toute seule.",
          },
          {
            icone: "🏷️",
            titre: "Nom des nouvelles caisses",
            texte: "Une caisse ajoutée dans une simulation prend directement **le nom de l'affaire** (plus de « Caisse 2 » à renommer).",
          },
        ],
      },
      {
        genre: "corrige",
        points: [
          {
            icone: "🌲",
            titre: "Pas de caisse de récup pour une caisse traitée NIMP15",
            texte:
              "L'application proposait parfois une caisse de récup ou une caisse en stock pour une caisse qui doit être traitée **NIMP15** (envoi 4B ou 4C). Ce n'est plus le cas.",
          },
        ],
      },
    ],
  },
  {
    version: "0.19.0",
    date: "28/10/2026",
    resume: "Le colisage reprend la caisse de chaque colis depuis l'intranet.",
    rubriques: [
      {
        genre: "nouveau",
        points: [
          {
            icone: "📦",
            titre: "Caisse des colis donnée par l'intranet",
            texte:
              "Quand un colis est déjà rangé dans une caisse dans l'intranet, il est rangé dans la même caisse dans **Colisage en cours**, sans rien faire. Les changements sont montrés dans le résumé de mise à jour du picking, avant de valider.",
          },
          {
            icone: "1️⃣",
            titre: "Affaire à une seule caisse",
            texte: "Si l'affaire n'a qu'une caisse, tous ses colis y sont rangés d'office.",
          },
        ],
      },
      {
        genre: "ameliore",
        points: [
          {
            icone: "🔍",
            titre: "Nombre de lignes filtrées",
            texte:
              "Quand un filtre est actif dans le tableau des articles, le compteur affiche bien en évidence **« lignes affichées / total »**.",
          },
        ],
      },
    ],
  },
  {
    version: "0.18.0",
    date: "27/10/2026",
    resume: "Le picking se met à jour tout seul à l'ouverture d'une affaire.",
    rubriques: [
      {
        genre: "nouveau",
        points: [
          {
            icone: "🔄",
            titre: "Picking à jour à l'ouverture",
            texte:
              "En ouvrant une affaire, l'application va chercher le picking dans l'intranet et affiche un **résumé des changements à valider**. Les étapes (Picking → Mise à jour → Colisage en cours) sont rappelées en haut de l'écran.",
          },
          {
            icone: "📐",
            titre: "Caisses reprises dans le colisage",
            texte:
              "Les caisses de la simulation sont recopiées d'office dans **Colisage en cours**. Changer les dimensions d'un côté propose de les changer aussi de l'autre.",
          },
          {
            icone: "⚠️",
            titre: "Ligne plus volumineuse que son carton",
            texte:
              "Une ligne qui, à elle seule, prend plus de place que son carton est signalée (dimensions souvent à vérifier dans l'intranet). Le bouton **« Accepter »** retire l'alerte si c'est normal.",
          },
        ],
      },
      {
        genre: "ameliore",
        points: [
          {
            icone: "🏷️",
            titre: "Noms des onglets",
            texte: "Les onglets d'une affaire s'appellent maintenant **« Picking »** et **« Colisage en cours »**.",
          },
          {
            icone: "☑️",
            titre: "Tout sélectionner",
            texte: "Avec un filtre actif, la case « tout sélectionner » ne coche plus que **les lignes affichées**.",
          },
        ],
      },
    ],
  },
  {
    version: "0.17",
    date: "20/10/2026 et 23/10/2026",
    resume: "Nouvelle page Alertes et enregistrement automatique de Gestion des caisses.",
    rubriques: [
      {
        genre: "nouveau",
        points: [
          {
            icone: "⏰",
            titre: "Page Alertes",
            texte:
              "Pour chaque affaire, on peut noter une **date d'expédition anticipée ou repoussée** et un commentaire. Cette date est prise en compte par l'alerte « À commander » et par l'accueil.",
          },
          {
            icone: "💾",
            titre: "Plus besoin d'« Enregistrer »",
            texte:
              "Dans **Gestion des caisses**, chaque modification est enregistrée tout de suite. Une confirmation est demandée avant de marquer une caisse « Livré ».",
          },
        ],
      },
      {
        genre: "ameliore",
        points: [
          {
            icone: "⚖️",
            titre: "Caisses pesées",
            texte: "Dans **Consommable › Poids**, les caisses en bois et en contreplaqué ont chacune leur couleur et peuvent être filtrées.",
          },
        ],
      },
    ],
  },
];
