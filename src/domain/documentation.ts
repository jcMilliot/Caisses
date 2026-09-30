// Contenu par défaut de la page Documentation (réécrit le 2026-09-28 d'après le texte de
// l'utilisateur, mis à jour depuis). Les administrateurs peuvent modifier chaque texte depuis la
// page (textes seulement : la liste des sections et des points est fixe) ; seules les
// modifications sont enregistrées en base, par clé (`cleTexte`), le reste vient d'ici.
// **gras** : mise en gras. Ne pas y mentionner le journal ni la page Admin (demande de
// l'utilisateur, 2026-09-28).

export type BlocDoc = { type: "h3"; texte: string } | { type: "li"; texte: string; sous?: string[] };

export interface SectionDoc {
  id: string;
  sommaire: string;
  titre: string;
  blocs: BlocDoc[];
}

export const ENTETE_DOC = {
  titre: "Comment ça marche",
  intro: "Le processus complet, de la demande de caisse jusqu'à la commande.",
};

const li = (texte: string, sous?: string[]): BlocDoc => ({ type: "li", texte, sous });
const h3 = (texte: string): BlocDoc => ({ type: "h3", texte });

export const SECTIONS_DOC: SectionDoc[] = [
  {
    id: "gestion-caisses",
    sommaire: "1. Gestion des caisses",
    titre: "1. Gestion des caisses — point de départ",
    blocs: [
      h3("La création"),
      li(
        "« + Créer une nouvelle caisse » : le nom d'affaire, la quantité et la date de picking sont **obligatoires** (champ au fond orangé tant qu'ils sont vides). Le reste des informations peut être renseigné tout de suite ou plus tard, directement dans le tableau.",
      ),
      li(
        "Selon le type d'envoi de la caisse, le traitement « NIMP15 » et le type d'ouverture sont renseignés automatiquement (une caisse 4C s'ouvre toujours par dessus), ainsi qu'une information sur la taille maximum et sur la présence d'une mousse de protection, qui réduit le volume disponible de la caisse.",
      ),
      li(
        "La sélection d'une caisse de stock ou de récup reprend automatiquement ses dimensions et son type d'ouverture (qui n'est alors plus modifiable), et coche « Cde passée sur achat stock ». Pas de caisse de stock pour un envoi 4B ou 4C.",
      ),
      li("Pour créer plusieurs caisses d'un coup, cliquer sur « + Ajouter une caisse » et reproduire le même schéma que précédemment."),
      li("Une fois créées, les caisses apparaissent dans le tableau principal."),
      h3("La gestion"),
      li(
        "Le tableau est trié par défaut de la date de picking la plus lointaine dans le futur à la plus ancienne ; l'ordre se modifie dans le bouton « Options ».",
      ),
      li(
        "Les informations se modifient directement dans le tableau, et certaines modifications en déclenchent d'autres : changer le type d'envoi agit sur le type d'ouverture et le traitement, sélectionner une caisse de stock agit sur les dimensions et le type d'ouverture, etc. Les modifications ne sont enregistrées qu'au clic sur « Enregistrer » (« Annuler » revient à l'état enregistré).",
      ),
      li(
        "La première colonne contient des cases à cocher : dès qu'une ligne est cochée, des boutons permettent de valider ou de dévalider la livraison de toute la sélection.",
      ),
      li(
        "La deuxième colonne, « OK pour être commandée », génère l'affiche à copier dans le mail de demande d'achat, à condition que les informations nécessaires soient remplies (voir « Passer la commande »).",
      ),
      li("Sur la dernière colonne (« Actions ») :", [
        "**Livré** valide la livraison de la caisse (« Dévalider » pour revenir en arrière). Une caisse livrée ne peut plus être modifiée tant qu'elle n'a pas été dévalidée.",
        "**+ Caisse** ajoute une nouvelle caisse à cette affaire. Elle hérite de la caisse mère : type d'envoi, date de picking, traitement (s'il y en a un).",
        "**Suppr.** supprime l'affaire du tableau, après confirmation.",
        "**Simuler** ouvre la ou les caisses de cette affaire dans la page Simulations, pour y ajouter les articles, estimer le volume et vérifier que la caisse correspond bien au besoin.",
      ]),
    ],
  },
  {
    id: "simuler",
    sommaire: "2. Simuler l'affaire",
    titre: "2. Simuler l'affaire",
    blocs: [
      li(
        "Depuis le tableau Gestion des caisses, au clic sur « Simuler » : si l'affaire n'existe pas encore dans Simulations, une proposition de création apparaît, avec une caisse reprenant les dimensions et le type d'envoi du tableau.",
      ),
      li(
        "L'écran Simulations affiche un bandeau récapitulatif en haut de page (dimensions maximales, volume total, poids total, avertissement mousse pour les caisses 4C), ainsi que les deux alertes automatiques : un article qui ne rentre pas dans sa caisse, et un volume d'affaire supérieur à la capacité cumulée des caisses.",
      ),
      li(
        "Chaque caisse est représentée par une carte détaillant volume interne, volume occupé, volume disponible, poids, seuil d'alerte, dimensions maximales des articles assignés et taux de remplissage avec code couleur (vert / orange / rouge).",
      ),
      li(
        "Le bouton « + Nouvelle caisse » permet d'en ajouter d'autres à la volée. Les dimensions restent synchronisées dans les deux sens avec le tableau Gestion des caisses.",
      ),
    ],
  },
  {
    id: "entreprise",
    sommaire: "3. Récupérer les articles (entreprise)",
    titre: "3. Récupérer les articles depuis l'intranet entreprise",
    blocs: [
      li("Sur le picking de l'affaire, dans l'intranet entreprise : menu Options → « Exporter toutes les lignes » → génère un fichier Excel."),
      li(
        "Ouvrir le fichier « Aide colisage dimensions V1 » : coller les références AR dans la première colonne et les quantités dans la colonne Qté, puis cliquer sur « Récupérer les infos » pour obtenir référence, désignation, dimensions et poids de chaque article.",
      ),
      li(
        "Sélectionner et copier cette liste, puis la coller dans le bouton « Coller depuis Excel » de la section Simulations et valider l'import. L'outil met immédiatement en évidence la plus grande longueur / largeur / hauteur de l'affaire — un indice utile pour dimensionner les caisses.",
      ),
      li(
        "Si l'AR d'une ligne ne commence ni par « AR » ni par « ZR », l'application demande s'il faut l'ajouter quand même. Les lignes non ajoutées restent listées sous le tableau d'articles (« Ces lignes n'ont pas été collées ») ; un administrateur peut les corriger, les ajouter au tableau ou les supprimer.",
      ),
    ],
  },
  {
    id: "assigner",
    sommaire: "4. Assigner et vérifier",
    titre: "4. Assigner et vérifier",
    blocs: [
      li(
        "Assigner des articles à une caisse : sélection multiple + « Assigner à → », glisser-déposer directement sur la carte de la caisse (tous les articles cochés partent ensemble si l'on attrape l'un d'eux), ou création d'une caisse à la volée depuis la sélection. Le taux de remplissage indique si le volume rentre, avec un seuil d'alerte commun à toutes les affaires (70 % par défaut), réglé par l'administrateur.",
      ),
      li("Multi-caisses : répartir les articles entre plusieurs caisses d'une même affaire — le nom de la caisse d'assignation s'affiche sur chaque ligne d'article du tableau."),
      li(
        "Deux alertes à surveiller : un article dont une dimension dépasse celle de sa caisse, et un volume total d'affaire supérieur à la capacité cumulée des caisses. Le bouton « Manque d'informations » (actif par défaut) repère les articles dont une dimension ou le poids manque.",
      ),
    ],
  },
  {
    id: "commande",
    sommaire: "5. Passer la commande",
    titre: "5. Passer la commande",
    blocs: [
      li(
        "Une fois la simulation validée et la date de commande atteinte : cocher « OK pour être commandée » sur l'affaire génère l'affiche destinée au service Achat (les éventuelles multi-caisses sont incluses dans la même demande). La case ne se coche que si l'affaire, les trois dimensions, la quantité, la date demandée à S2C et le type d'ouverture sont renseignés ; sinon, un message indique ce qui manque. Le trigramme de la personne qui coche la case est enregistré et apparaît comme demandeur sur l'affiche.",
      ),
      li(
        "**Alerte « À commander »** : une affaire à commander (hors caisse de stock et ACHSTOCK) dont le picking est dans 7 jours ou moins — ou déjà passé — sans être cochée « OK pour être commandée » s'affiche en rouge avec la mention « À commander » en tête du bloc « Caisses à commander cette semaine » de l'accueil. Une pastille rouge « ! » apparaît aussi dans la première colonne du tableau Gestion des caisses et sur l'icône de l'application dans la barre des tâches. L'alerte disparaît dès que la case est cochée.",
      ),
      li(
        "Dans la section « Demandes d'achats » : copier une affiche individuellement, ou en sélectionner plusieurs (voire toutes) et utiliser « Copier la sélection » pour coller directement dans le mail à envoyer. La mise en forme et les mentions de prestation (soudure/fermeture pour les caisses 4C, etc.) sont détectées automatiquement si la demande est correctement remplie.",
      ),
      li(
        "Lorsque la ou les caisses ont été livrées : sélectionner une ou plusieurs affaires et cliquer sur le bouton « Valider la sélection », ou cliquer sur le bouton « Livré » de la dernière colonne du tableau, validant ainsi l'affaire.",
      ),
    ],
  },
  {
    id: "stock",
    sommaire: "Caisses en stock",
    titre: "Caisses en stock (section indépendante)",
    blocs: [
      li(
        "Répertorie les caisses actuellement en stock. Les références « AR_CAISS » n'ont pas de quantité et ne sont reliées à aucune autre donnée — c'est une liste purement indicative.",
      ),
      li(
        "Les caisses « de récupération » peuvent être affectées à une affaire : à la création de la caisse ou directement dans le tableau Gestion des caisses, en sélectionnant la caisse en stock, ses dimensions et son type d'ouverture sont repris automatiquement. Une caisse de récup ne peut être affectée qu'à une seule affaire à la fois ; une fois l'affaire validée, elle n'est plus proposée.",
      ),
      li("Le tableau est en lecture seule : il affiche nom, dimensions, type d'ouverture, observations et l'affaire à laquelle chaque caisse est affectée."),
      h3("Gérer les caisses"),
      li(
        "Le bouton « Gérer les caisses » est le seul endroit où l'on crée, modifie ou supprime une caisse en stock : nom, dimensions, type d'ouverture (« Par dessus », « Par devant » ou « Par dessus et par devant ») et observations.",
      ),
      li(
        "Modifier les dimensions ou le type d'ouverture d'une caisse déjà sélectionnée dans Gestion des caisses les reporte, après confirmation, sur les caisses pas encore livrées qui l'utilisent (et sur leurs caisses dans Simulations). Les caisses déjà livrées gardent leurs valeurs.",
      ),
      li("Supprimer une caisse encore utilisée affiche un avertissement : les lignes concernées gardent leurs dimensions, mais la caisse n'y est plus sélectionnée."),
    ],
  },
  {
    id: "references",
    sommaire: "Gérer les références",
    titre: "Gérer les références (bouton en tête de Gestion des caisses)",
    blocs: [
      li(
        "Contrôle le contenu des listes déroulantes des colonnes Moteurs / Module linéaire / Terminaux, utilisées à la fois dans l'édition du tableau et dans le dialogue « + Créer une nouvelle caisse ».",
      ),
      li(
        "Par colonne : ajouter une valeur, la **renommer** (le nouveau libellé est répercuté automatiquement sur toutes les lignes qui l'utilisaient déjà, avec confirmation si des lignes sont concernées), ou en **supprimer** une ou plusieurs (sélection multiple ; la valeur disparaît de la liste mais les lignes qui la portaient gardent le texte tel quel — avertissement si la valeur est utilisée).",
      ),
      li("Les valeurs sont triées automatiquement par quantité puis par numéro de référence (par exemple « 1 MOTEUR » avant « 2 MOTEURS » avant « 10 MOTEURS »)."),
    ],
  },
  {
    id: "verrouillage",
    sommaire: "Verrouillage & demande d'écriture",
    titre: "Verrouillage multi-poste et demande d'écriture",
    blocs: [
      li(
        "Plusieurs postes peuvent travailler sur la même base de données (dossier réseau partagé) : le verrouillage évite que deux personnes modifient la même chose au même moment.",
      ),
      li(
        "Portée : un verrou couvre l'écran entier pour Gestion des caisses, Caisses en stock et Demandes d'achats ; pour Simulations, le verrou est pris par affaire précise.",
      ),
      li(
        "La prise du verrou est automatique à l'ouverture de l'écran ou de l'affaire — aucune action volontaire n'est nécessaire. Il se libère en quittant l'écran, ou après 5 minutes sans activité (souris ou clavier).",
      ),
      li(
        "Quand un autre poste détient déjà la main, un bandeau « Verrouillé en écriture par XYZ » s'affiche : l'écran reste consultable mais passe en lecture seule, sans redirection forcée et sans perte de la saisie en cours.",
      ),
      li(
        "Le bouton « Demande d'écriture » du bandeau envoie une demande au titulaire actuel, qui voit apparaître une bannière lui permettant d'approuver ou de refuser. Si le titulaire ne répond pas et que son poste ne donne plus signe d'activité, le demandeur reprend automatiquement la main après 90 secondes — sans attendre les 5 minutes d'expiration classique du verrou.",
      ),
      li("Une personne au rôle « Lecteur » consulte tous les écrans en lecture seule, sans jamais bloquer les autres."),
    ],
  },
  {
    id: "base",
    sommaire: "Base de données et sauvegarde",
    titre: "Base de données et sauvegarde",
    blocs: [
      li(
        "Toutes les données (caisses, affaires, articles, caisses en stock, références) sont dans un seul fichier, **caisses.sqlite3**, placé dans le dossier choisi au premier lancement de l'application. Ce dossier peut être sur le réseau pour que plusieurs postes partagent les mêmes données.",
      ),
      li("L'enregistrement est immédiat dans Simulations et Caisses en stock. Dans Gestion des caisses, les modifications restent en attente jusqu'au clic sur « Enregistrer »."),
      li(
        "La base est copiée automatiquement (chaque jour ou chaque semaine) dans un dossier de sauvegarde, sous le nom **caisses_JJ-MM-AAAA_HH-MM-SS.sqlite3**. La copie est faite par le premier poste ouvert au moment où elle est due, un seul poste à la fois ; les plus anciennes sont supprimées au-delà d'un nombre de copies fixé (30 par défaut).",
      ),
      li(
        "En cas de problème, la base peut être remplacée par une sauvegarde plus ancienne. Cette opération est réservée à l'administrateur et nécessite que l'application soit fermée sur tous les autres postes.",
      ),
    ],
  },
];

// Clés des textes modifiables : "entete.titre", "entete.intro", "<section>.sommaire",
// "<section>.titre", "<section>.<n° de bloc>", "<section>.<n° de bloc>.<n° de sous-point>".
export function textesParDefaut(): Record<string, string> {
  const t: Record<string, string> = { "entete.titre": ENTETE_DOC.titre, "entete.intro": ENTETE_DOC.intro };
  for (const s of SECTIONS_DOC) {
    t[`${s.id}.sommaire`] = s.sommaire;
    t[`${s.id}.titre`] = s.titre;
    s.blocs.forEach((b, i) => {
      t[`${s.id}.${i}`] = b.texte;
      if (b.type === "li") b.sous?.forEach((x, j) => (t[`${s.id}.${i}.${j}`] = x));
    });
  }
  return t;
}
