// Contenu de la page Documentation (réécrit le 2026-09-28 d'après le texte de l'utilisateur, revu
// entièrement le 2026-11-24). Plus modifiable dans l'app depuis le 2026-11-26 (demande de
// l'utilisateur) : sections et points se changent librement ici. **gras** : mise en gras. Ne pas
// y mentionner le journal. La page Admin peut être citée là où un réglage s'y fait (accord de
// l'utilisateur du 2026-11-24).

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
        "« + Créer une nouvelle caisse » : le nom d'affaire (8 caractères), la quantité et la date de picking sont **obligatoires** (champ au fond orangé tant qu'ils sont vides). Le reste des informations peut être renseigné tout de suite ou plus tard, directement dans le tableau.",
      ),
      li(
        "Selon le type d'envoi de la caisse, le traitement « NIMP15 » et le type d'ouverture sont renseignés automatiquement (une caisse 4C s'ouvre toujours par dessus), ainsi qu'une information sur la taille maximum et sur la présence d'une mousse de protection, qui réduit le volume disponible de la caisse.",
      ),
      li(
        "La sélection d'une caisse de stock ou de récup reprend automatiquement ses dimensions et son type d'ouverture (qui n'est alors plus modifiable), et coche « Cde passée sur achat stock » (la retirer recoche « Cde passée sur affaire »). Pas de caisse de stock pour un envoi 4B ou 4C. Modifier ensuite une dimension retire la caisse de stock.",
      ),
      li("Pour créer plusieurs caisses d'un coup, cliquer sur « + Ajouter une caisse » et reproduire le même schéma que précédemment."),
      li("Une fois créées, les caisses apparaissent dans le tableau principal."),
      h3("La gestion"),
      li(
        "Le tableau est trié par défaut de la date de picking la plus lointaine à la plus ancienne. Un clic sur l'icône d'une colonne permet de la trier et de la filtrer. Le bouton « Options » permet d'inverser l'ordre du tableau, de choisir et de déplacer les colonnes, de masquer les caisses reçues et de passer en affichage compact (le tableau tient alors dans la largeur de l'écran).",
      ),
      li(
        "Les informations se modifient directement dans le tableau, et certaines modifications en déclenchent d'autres : changer le type d'envoi agit sur le type d'ouverture et le traitement, sélectionner une caisse de stock agit sur les dimensions et le type d'ouverture, etc. Chaque modification est enregistrée automatiquement, sans bouton à cliquer. Les dimensions d'une ligne se saisissent ensemble dans une fenêtre (clic sur l'une d'elles), qui propose aussi de les reporter sur la caisse de Simulations si l'affaire est simulée.",
      ),
      li(
        "La colonne « Taux de remplissage » reprend le remplissage de la caisse correspondante dans Simulations : violet sous le seuil d'alerte, orange à partir du seuil, rouge au-delà de 100 %.",
      ),
      li(
        "La colonne « OK pour être commandée » génère l'affiche à copier dans le mail de demande d'achat, à condition que les informations nécessaires soient remplies (voir « Passer la commande »).",
      ),
      li("La dernière colonne, « Actions », regroupe les boutons de chaque ligne :", [
        "**Livré** valide la livraison de la caisse, après confirmation (« Non livré » pour revenir en arrière). Une caisse livrée ne peut plus être modifiée tant qu'elle n'a pas été repassée en « Non livré ». Si elle utilise une caisse AR_CAISS, le stock de cette caisse est mis à jour.",
        "**+ Caisse** ajoute une caisse détaillée à cette affaire, même déjà livrée (caisse envoyée plus tard). Elle hérite de la caisse mère : type d'envoi, date de picking, traitement (s'il y en a un). La date demandée à S2C reste à saisir.",
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
        "Depuis le tableau Gestion des caisses, au clic sur « Simuler » : si l'affaire n'existe pas encore dans Simulations, une proposition de création apparaît, avec une caisse reprenant les dimensions et le type d'envoi du tableau. La liste des affaires de Simulations affiche le remplissage de chaque caisse.",
      ),
      li(
        "Une affaire a deux onglets : **Picking** (la liste des articles et les caisses) et **Colisage en cours** (voir la section du même nom). Au-dessus, un repère en trois étapes indique où en est l'affaire : Picking, Mise à jour (depuis l'intranet), Colisage en cours.",
      ),
      li(
        "Le bandeau en haut de page récapitule l'affaire : dimensions maximales, volume total, poids total des articles, seuil d'alerte, avertissement mousse pour les caisses 4C, et une alerte si le volume de l'affaire dépasse la capacité cumulée des caisses.",
      ),
      li(
        "Chaque caisse est représentée par une carte : volume interne, volume occupé, volume disponible, taux de remplissage avec code couleur (vert / orange / rouge), dimensions maximales des articles, poids total des articles, poids de la caisse et poids au m². Toutes les caisses portent le nom de l'affaire ; un numéro (1, 2…) à leur couleur les distingue, sur la carte comme dans la colonne « Caisse » du tableau.",
      ),
      li(
        "**Poids de la caisse** : estimé d'après ses dimensions et sa matière (contreplaqué pour STANDARD et 4B, bois avec mousse et bâche pour 4C), ou la tare d'une caisse en stock choisie. L'alerte « Charge trop lourde » apparaît quand le poids au m² (articles + caisse, sur le fond de la caisse) atteint la limite réglée dans l'Admin (400 kg/m² par défaut).",
      ),
      li(
        "**Suggestion de caisse en stock** : quand une caisse STANDARD peut être remplacée par une caisse en stock ou de récup assez grande, la carte la propose ; « Utiliser » reprend ses dimensions et la sélectionne aussi dans Gestion des caisses. Pas de suggestion pour une caisse 4B, 4C ou NIMP15.",
      ),
      li(
        "Le bouton « + Nouvelle caisse » permet d'en ajouter d'autres à la volée ; l'application propose de créer la caisse détaillée correspondante dans Gestion des caisses, même si l'affaire est déjà livrée. Les dimensions restent synchronisées dans les deux sens avec le tableau Gestion des caisses. Une caisse qui n'est reliée à aucune ligne de Gestion des caisses affiche « non liée » et un bouton « Lier… » pour choisir sa ligne (ou la créer).",
      ),
    ],
  },
  {
    id: "recuperer-articles",
    sommaire: "3. Récupérer les articles",
    titre: "3. Récupérer les articles depuis l'intranet",
    blocs: [
      li(
        "Les articles viennent du **picking de l'intranet**, avec le compte utilisé pour se connecter à l'application. À l'ouverture d'une affaire, l'application récupère le picking toute seule : la première fois, elle importe les articles ; ensuite, elle vérifie s'il a changé. Si un autre poste a la main sur l'affaire, la mise à jour attend qu'on la reprenne.",
      ),
      li(
        "Quand le picking a changé, un résumé s'affiche avant d'appliquer quoi que ce soit : lignes ajoutées, modifiées (par exemple « Qté 2 → 1 »), supprimées ou revenues, et changements de caisse des colis. Rien n'est modifié tant que le résumé n'est pas validé. Sous le repère d'étapes, l'application indique la date de la dernière mise à jour, ou pourquoi elle n'a pas pu se faire (intranet injoignable, affaire introuvable).",
      ),
      li(
        "Le bouton « Vérifier la mise à jour du picking » (« Importer le picking » la première fois) relance la récupération à tout moment.",
      ),
      li(
        "Seules les lignes « AR » sont reprises. Une ligne sans numéro de besoin n'est pas importée : le bouton « ⚠ Pas de numéro de besoin » les liste. Une ligne supprimée dans l'intranet sort du tableau, des calculs et de sa caisse, et apparaît sous le tableau (« Lignes supprimées dans l'intranet ») ; elle revient si elle réapparaît dans le picking.",
      ),
      li(
        "Quand la quantité a changé depuis le début du picking, « Qté initiale : N » s'affiche sous l'AR. La colonne « Colis » indique le colis ou la lettre donnés par l'intranet. Le tableau met en évidence la plus grande longueur / largeur / hauteur de l'affaire — un indice utile pour dimensionner les caisses.",
      ),
    ],
  },
  {
    id: "assigner",
    sommaire: "4. Assigner et vérifier",
    titre: "4. Assigner et vérifier",
    blocs: [
      li(
        "Assigner des articles à une caisse : sélection multiple + « Assigner à → », glisser-déposer directement sur la carte de la caisse (tous les articles cochés partent ensemble si l'on attrape l'un d'eux), ou création d'une caisse à la volée depuis la sélection. Le taux de remplissage indique si le volume rentre, avec un seuil d'alerte commun à toutes les affaires (70 % par défaut), réglé dans l'Admin.",
      ),
      li(
        "Avec un filtre actif, la case « tout sélectionner » ne coche que les lignes affichées, et le compteur du titre « Articles » indique le nombre de lignes affichées sur le total. Les colonnes du tableau se redimensionnent par le bord droit de leur en-tête (double-clic : largeur par défaut).",
      ),
      li(
        "Deux alertes à surveiller : un article dont une dimension dépasse celle de sa caisse, et un volume total d'affaire supérieur à la capacité cumulée des caisses. Pour les calculs, les dimensions d'une pièce sont toujours remises dans l'ordre : **longueur = plus grande cote, largeur = cote moyenne, hauteur = plus petite**, c'est ainsi qu'elle est posée dans la caisse ou le colis. Quand l'ordre saisi est différent, « Calcul : N mm » s'affiche sous la dimension. Le bouton « Manque d'informations » (actif par défaut) repère les articles dont une dimension ou le poids manque.",
      ),
      li(
        "Une caisse livrée ne reçoit plus d'articles : les articles colisés qui sont partis avec elle sont verrouillés (🔒). Un article qui n'est pas dans un colis reste libre, pour pouvoir le déplacer vers la caisse qui part ensuite.",
      ),
    ],
  },
  {
    id: "commande",
    sommaire: "5. Passer la commande",
    titre: "5. Passer la commande",
    blocs: [
      li(
        "Une fois la simulation validée et la date de commande atteinte : cocher « OK pour être commandée » sur l'affaire génère l'affiche destinée au service Achat. La case ne se coche que si l'affaire, les trois dimensions, la quantité, la date demandée à S2C et le type d'ouverture sont renseignés ; sinon, un message indique ce qui manque. Le trigramme de la personne qui coche la case est enregistré et apparaît comme demandeur sur l'affiche.",
      ),
      li(
        "**Envoi en partiel** : chaque caisse détaillée a sa propre case « OK pour être commandée » et sa propre date de picking. On peut commander la caisse principale maintenant et une caisse détaillée plus tard. « Livré » sur l'affaire livre aussi ses caisses détaillées cochées ; les autres gardent leur propre bouton « Livré ».",
      ),
      li(
        "Une ligne qui utilise une caisse de stock ou de récup ne demande rien à S2C : sa date demandée à S2C est grisée, n'est pas exigée, et elle ne génère pas d'affiche. Une ligne ACHSTOCK (caisses commandées pour le stock) apparaît, une fois cochée, dans le bloc ACHSTOCK de Demandes d'achats et dans la copie du mail.",
      ),
      li(
        "**Alerte « À commander »** : une affaire ou une caisse détaillée à commander (hors caisse de stock et ACHSTOCK) dont le picking est dans 7 jours ou moins — ou déjà passé — sans être cochée « OK pour être commandée » s'affiche en rouge avec la mention « À commander » en tête du bloc « Caisses à commander cette semaine » de l'accueil. Une pastille rouge « ! » apparaît aussi dans la première colonne du tableau Gestion des caisses et sur l'icône de l'application dans la barre des tâches. L'alerte disparaît dès que la case est cochée.",
      ),
      li(
        "Dans la section « Demandes d'achats » : copier une affiche individuellement, ou en sélectionner plusieurs (voire toutes) et utiliser « Copier la sélection » pour coller directement dans le mail à envoyer. La mise en forme et les mentions de prestation (soudure/fermeture pour les caisses 4C, etc.) sont détectées automatiquement si la demande est correctement remplie.",
      ),
      li(
        "Lorsque la ou les caisses ont été livrées : cliquer sur le bouton « Livré » de la ligne (dernière colonne du tableau), validant ainsi l'affaire.",
      ),
    ],
  },
  {
    id: "colisage",
    sommaire: "Colisage en cours",
    titre: "Colisage en cours",
    blocs: [
      li(
        "L'onglet **Colisage en cours** d'une affaire s'ouvre dès qu'au moins un article est colisé dans l'intranet. Il regroupe les articles par colis : d'abord les **lettres** (A, B… = pièces posées directement dans la caisse A, B…), puis les **colis** numérotés (1, 2…). Chaque bloc se déplie pour voir ses pièces.",
      ),
      h3("Cartons"),
      li(
        "Chaque colis reçoit un carton, choisi dans l'en-tête de son bloc : un carton de Consommable › Cartons conso, ou un **carton libre** (carton de récup) dont on saisit les dimensions extérieures et, si on le connaît, le poids. L'en-tête affiche le volume et le poids des pièces, le volume du carton et son taux de remplissage.",
      ),
      li("Trois alertes, bloc bordé de rouge :", [
        "**Volume des pièces supérieur au volume du carton.**",
        "**Une pièce ne rentre pas dans le carton**, quelle que soit son orientation. « Accepter » si elle passe en diagonale : l'alerte disparaît pour ce carton, et revient si l'on change de carton.",
        "**Une ligne est, à elle seule, plus volumineuse que le carton** : ses dimensions sont souvent celles de sa boîte, à vérifier dans l'intranet. « Accepter » retire l'alerte de la ligne pour ce carton ; son volume compte toujours.",
      ]),
      h3("Caisses"),
      li(
        "Les caisses de l'onglet Picking sont reprises d'office dans le panneau des caisses. Modifier les dimensions d'une caisse d'un côté propose de les reporter de l'autre.",
      ),
      li(
        "Une **lettre** est rangée d'office dans la caisse de même rang (A dans la 1re caisse, B dans la 2e…). Un **colis** va dans la caisse indiquée par l'intranet ; à défaut, dans la seule caisse de l'affaire s'il n'y en a qu'une ; sinon, on la choisit dans le menu « Caisse : » de son bloc.",
      ),
      li(
        "Le récapitulatif compare le Picking et le Colisage en cours, au total et par caisse : les pièces pas encore colisées comptent pour leur volume, un colis pour le volume extérieur de son carton. L'écart montre si les dimensions des pièces sont justes.",
      ),
      li(
        "Quand une partie de l'affaire est déjà livrée, un onglet par livraison apparaît (« 1er envoi », « 2ème envoi »…) avec ses caisses, ses colis et ses calculs. Les colis d'une caisse livrée ne sont plus modifiables.",
      ),
    ],
  },
  {
    id: "alertes",
    sommaire: "Alertes",
    titre: "Alertes (expédition anticipée)",
    blocs: [
      li(
        "La page « Alertes » (carte de l'accueil ou onglet de la barre) liste les affaires de Gestion des caisses pas encore livrées (hors ACHSTOCK) avec leur date d'expédition initiale (date de picking).",
      ),
      li(
        "Quand une expédition est demandée plus tôt que prévu, saisir la **date anticipée** : elle remplace la date de picking pour l'alerte « À commander » (pastilles rouges, barre des tâches) et pour les blocs « Caisses à commander / à rapatrier cette semaine » de l'accueil. La date de picking elle-même n'est pas modifiée ; la nouvelle date apparaît en orange sous elle dans Gestion des caisses (« Anticipée » si elle est plus tôt, « Repoussée » si elle est plus tard) et sert au tri par date de picking, ici comme dans Gestion des caisses.",
      ),
      li("La colonne « Commentaires » est libre. Tout est enregistré immédiatement ; effacer la date anticipée revient à la date de picking."),
    ],
  },
  {
    id: "controle-dimensionnel",
    sommaire: "Contrôle dimensionnel",
    titre: "Contrôle dimensionnel",
    blocs: [
      li(
        "Les mesures des articles sont prises à la main et peuvent être fausses. Chaque article importé dans Simulations est retenu avec ses dimensions et son poids. Ceux dont **2 dimensions sur 3 atteignent ou dépassent le seuil** (350 mm par défaut, réglé dans l'Admin) sont à recontrôler : c'est la partie **Contrôles annuels**.",
      ),
      li(
        "Onglet **À contrôler** : quand on a l'article sous la main, on le mesure. « Conforme » si les mesures correspondent ; sinon on corrige directement l'ERP : dès que l'application lit les nouvelles valeurs (ouverture d'une affaire qui contient la pièce, ou « Actualiser depuis l'intranet »), l'article passe tout seul en « Validé », avec « ERP » comme contrôleur. À l'ouverture de la page (et par « Actualiser depuis l'intranet »), l'application relit le picking de toutes les affaires en cours de Simulations : les nouveaux articles entrent dans la liste et les colonnes « Affaires » et « Dispo pour ctrl » sont à jour, sans avoir à ouvrir chaque affaire. La colonne « Affaires » liste les affaires où trouver la pièce (pas celles où elle est déjà dans un colis, ni les affaires expédiées). Tant qu'il y a des articles à contrôler, la carte de l'accueil est entourée d'un halo rouge.",
      ),
      li(
        "« Dispo pour ctrl » indique si la pièce est en stock ou a été mouvementée — l'affaire concernée ressort en vert. « Dispo pour ctrl seulement » filtre la liste ; le menu des affaires n'affiche que les pièces dispo dans l'affaire choisie, pour faire les contrôles affaire par affaire.",
      ),
      li(
        "Les pièces ne pouvant pas toujours être approchées de l'ordinateur, « Exporter en Excel » donne la liste affichée, à imprimer ou à ouvrir sur une tablette : affaire, article, colonnes vides pour noter les mesures relevées, valeurs de l'ERP, puis les écarts, calculés dès qu'une mesure est saisie.",
      ),
      li(
        "Onglet **Validés** : un contrôle reste valable 12 mois (durée réglée dans l'Admin), puis l'article revient dans « À contrôler ».",
      ),
      li(
        "Onglet **Dimensions corrigées** : n'apparaît que tant qu'il reste des corrections saisies avant la validation automatique, à reporter dans l'ERP. Une fois l'ERP corrigé, elles se valident toutes seules à la lecture des nouvelles valeurs, ou à la main avec « Reporté dans l'ERP ». L'onglet disparaît quand il n'en reste plus.",
      ),
      li(
        "Les articles de Simulations ne sont pas modifiés par les contrôles annuels : ils prennent les bonnes mesures à la mise à jour du picking, une fois l'ERP corrigé.",
      ),
      li(
        "Partie **Petits volumes** : les articles sous le seuil des contrôles annuels. On indique une seule fois, sans rappel, comment chaque pièce est livrée : **Carton** (carton ou boîte, les dimensions de l'ERP sont justes), **Sachet** ou **Sans emballage** (les dimensions de l'ERP sont justes). Pour un sachet, on saisit les dimensions d'une pièce hors sachet : dans Simulations, le volume de la ligne est alors calculé avec ces dimensions et la quantité, majoré d'une petite marge pour le sachet (10 % par défaut, réglée dans l'Admin). Le tableau du Picking garde les dimensions de l'ERP et rappelle en dessous « Hors sachet : … mm ». « À traiter » ne montre que les pièces des pickings en cours ; la colonne « Sortie » indique s'il y a eu un mouvement de sortie de la pièce, avec le nom des affaires concernées ; « Traités » permet de modifier un choix.",
      ),
    ],
  },
  {
    id: "stock",
    sommaire: "Consommable",
    titre: "Consommable (section indépendante)",
    blocs: [
      li("La section a trois onglets : **Poids**, **Caisses en stock** et **Cartons conso**."),
      h3("Caisses en stock"),
      li(
        "Les caisses **AR_CAISS** ont une quantité en stock : elle diminue à la livraison d'une ligne de Gestion des caisses qui utilise la caisse, et augmente à la livraison d'une ligne ACHSTOCK (réception). Au passage en « Non livré », l'application propose de remettre la quantité en stock. Pour une caisse « gérée » (une caisse qu'on recommande), l'alerte « à commander » apparaît ici et sur l'accueil quand la quantité descend au seuil choisi. « Gérée », la quantité et le seuil se règlent dans l'Admin › Caisses.",
      ),
      li(
        "Les caisses « de récupération » peuvent être affectées à une affaire : à la création de la caisse ou directement dans le tableau Gestion des caisses, en sélectionnant la caisse en stock, ses dimensions et son type d'ouverture sont repris automatiquement. Une caisse de récup ne peut être affectée qu'à une seule affaire à la fois ; une fois l'affaire livrée, elle disparaît de la liste.",
      ),
      li("Le tableau est en lecture seule : il affiche nom, dimensions, quantité en stock, type d'ouverture, observations et l'affaire à laquelle chaque caisse est affectée."),
      h3("Gérer les caisses"),
      li(
        "Le bouton « Gérer les caisses » est le seul endroit où l'on crée, modifie ou supprime une caisse en stock. Obligatoires : nom, dimensions intérieures, type d'ouverture (« Par dessus », « Par devant » ou « Par dessus et par devant ») et matière (bois ou contreplaqué). Facultatifs : dimensions extérieures, tare (poids à vide) et observations.",
      ),
      li(
        "Modifier les dimensions ou le type d'ouverture d'une caisse déjà sélectionnée dans Gestion des caisses les reporte, après confirmation, sur les caisses pas encore livrées qui l'utilisent (et sur leurs caisses dans Simulations). Les caisses déjà livrées gardent leurs valeurs.",
      ),
      li("Supprimer une caisse encore utilisée affiche un avertissement : les lignes concernées gardent leurs dimensions, mais la caisse n'y est plus sélectionnée."),
      h3("Cartons conso"),
      li(
        "Les cartons consommables : référence « AR_RAJA__XXXXX », dimensions intérieures et extérieures (en cm), poids. Ils servent au Colisage en cours de Simulations ; on les crée, modifie ou supprime avec le bouton « Gérer les cartons ».",
      ),
      h3("Poids"),
      li(
        "Les caisses réellement pesées : dimensions, tare, matière, pieds, renforts, tasseaux, mousse et bâche. Le tableau compare chaque tare au poids estimé par l'application et conseille une masse volumique par matière (bois en beige, contreplaqué en gris-bleu, filtre par matière). Ces pesées servent à caler l'estimation du poids des caisses, dont les réglages sont dans l'Admin.",
      ),
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
        "Portée : un verrou couvre l'écran entier pour Gestion des caisses, Consommable, Demandes d'achats, Alertes et Contrôle dimensionnel ; pour Simulations, le verrou est pris par affaire précise.",
      ),
      li(
        "La prise du verrou est automatique à l'ouverture de l'écran ou de l'affaire — aucune action volontaire n'est nécessaire. Il se libère en quittant l'écran, en fermant l'application, ou après 5 minutes sans activité (souris ou clavier).",
      ),
      li(
        "Quand un autre poste détient déjà la main, un bandeau « Verrouillé en écriture par XYZ » s'affiche : l'écran reste consultable mais passe en lecture seule, sans redirection forcée et sans perte de la saisie en cours.",
      ),
      li(
        "Le bouton « Demande d'écriture » du bandeau envoie une demande au titulaire actuel, qui voit apparaître une bannière lui permettant d'approuver ou de refuser. Si le titulaire ne répond pas et que son poste ne donne plus signe d'activité, le demandeur reprend automatiquement la main après 90 secondes — sans attendre les 5 minutes d'expiration classique du verrou.",
      ),
      li(
        "Chaque personne a, pour chaque écran, un droit de **lecture** ou d'**écriture**, réglé par un administrateur dans l'Admin › Utilisateurs (une nouvelle personne est en lecture partout). Sur un écran en lecture, on consulte tout sans jamais bloquer les autres.",
      ),
      li(
        "Quand plus personne n'a la main, le bandeau affiche « Prendre la main » : un clic suffit pour repasser en écriture, et l'écran est rechargé avec les dernières données.",
      ),
      li(
        "Si quelqu'un est parti en laissant l'application ouverte, un administrateur peut lui **retirer la main** depuis l'Admin › Utilisateurs (« Qui a la main ») : l'application reste ouverte sur son poste mais passe en lecture seule, et les autres postes peuvent « Prendre la main ».",
      ),
    ],
  },
  {
    id: "base",
    sommaire: "Base de données et sauvegarde",
    titre: "Base de données et sauvegarde",
    blocs: [
      li(
        "Toutes les données sont dans un seul fichier, **caisses.sqlite3**, placé dans un dossier partagé sur le réseau pour que tous les postes travaillent sur les mêmes données. Au premier démarrage d'un poste, on colle le chemin de ce dossier, communiqué par un administrateur. Le dossier se change pour tous les postes dans l'Admin › Paramètres.",
      ),
      li("L'enregistrement est immédiat partout : Gestion des caisses, Simulations, Consommable, Alertes et Contrôle dimensionnel."),
      li(
        "La base est copiée automatiquement (chaque jour ou chaque semaine, réglé dans l'Admin) dans un dossier de sauvegarde, sous le nom **caisses_JJ-MM-AAAA_HH-MM-SS.sqlite3**. La copie est faite par le premier poste ouvert au moment où elle est due, un seul poste à la fois ; les plus anciennes sont supprimées au-delà d'un nombre de copies fixé (30 par défaut).",
      ),
      li(
        "En cas de problème, un administrateur peut remplacer la base par une sauvegarde plus ancienne. L'application demande alors aux autres postes de se fermer, puis fait la restauration.",
      ),
    ],
  },
];
