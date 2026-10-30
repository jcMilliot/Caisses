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
