import { useEffect, useRef, useState } from "react";

// Documentation du processus métier, écran statique (pas d'appel data/).
// Contenu fourni par l'utilisateur le 2026-09-03, mis en forme le 2026-09-04, réécrit le
// 2026-09-28 d'après son nouveau texte. Ne pas y mentionner le journal ni la page Admin (demande
// de l'utilisateur, 2026-09-28).

interface SectionDoc {
  id: string;
  titre: string;
}

const SOMMAIRE: SectionDoc[] = [
  { id: "gestion-caisses", titre: "1. Gestion des caisses" },
  { id: "simuler", titre: "2. Simuler l'affaire" },
  { id: "entreprise", titre: "3. Récupérer les articles (entreprise)" },
  { id: "assigner", titre: "4. Assigner et vérifier" },
  { id: "commande", titre: "5. Passer la commande" },
  { id: "stock", titre: "Caisses en stock" },
  { id: "references", titre: "Gérer les références" },
  { id: "verrouillage", titre: "Verrouillage & demande d'écriture" },
  { id: "base", titre: "Base de données et sauvegarde" },
];

export default function Documentation() {
  const [actif, setActif] = useState(SOMMAIRE[0].id);
  // Le clic dans le sommaire déclenche un scroll fluide qui traverse d'autres sections en
  // chemin : on ignore l'observer le temps du scroll pour éviter que la surbrillance clignote
  // sur les sections survolées avant d'arriver à la cible.
  const scrollProgrammatique = useRef(false);
  const reactiverObserverRef = useRef<number | undefined>(undefined);

  function allerA(id: string) {
    scrollProgrammatique.current = true;
    setActif(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.clearTimeout(reactiverObserverRef.current);
    reactiverObserverRef.current = window.setTimeout(() => {
      scrollProgrammatique.current = false;
    }, 700);
  }

  useEffect(() => {
    const sections = SOMMAIRE.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entrees) => {
        if (scrollProgrammatique.current) return;
        // Section la plus proche du haut de la zone de lecture parmi celles actuellement visibles.
        const visibles = entrees.filter((e) => e.isIntersecting);
        if (visibles.length === 0) return;
        const plusHaute = visibles.reduce((a, b) => (a.boundingClientRect.top <= b.boundingClientRect.top ? a : b));
        setActif(plusHaute.target.id);
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    );
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div style={{ display: "flex", maxWidth: 1200, margin: "0 auto", padding: "32px 24px", gap: 32 }}>
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          position: "sticky",
          top: 70,
          alignSelf: "flex-start",
          maxHeight: "calc(100vh - 100px)",
          overflow: "auto",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--accent)",
            marginBottom: 4,
          }}
        >
          Guide
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 14px", letterSpacing: "-0.01em" }}>Sommaire</h2>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {SOMMAIRE.map((s) => (
            <button
              key={s.id}
              onClick={() => allerA(s.id)}
              style={{
                textAlign: "left",
                padding: "6px 10px",
                borderRadius: "var(--radius)",
                border: "none",
                background: actif === s.id ? "var(--accent-soft)" : "transparent",
                color: actif === s.id ? "var(--accent)" : "var(--text)",
                fontWeight: actif === s.id ? 600 : 400,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {s.titre}
            </button>
          ))}
        </nav>
      </aside>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--accent)",
              marginBottom: 4,
            }}
          >
            Documentation
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>
            Comment ça marche
          </h1>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "6px 0 0" }}>
            Le processus complet, de la demande de caisse jusqu'à la commande.
          </p>
        </div>

        <Bloc id="gestion-caisses" titre="1. Gestion des caisses — point de départ">
          <h3>La création</h3>
          <ul>
            <li>
              « + Créer une nouvelle caisse » : le nom d'affaire, la quantité et la date de picking
              sont <strong>obligatoires</strong> (champ au fond orangé tant qu'ils sont vides). Le
              reste des informations peut être renseigné tout de suite ou plus tard, directement
              dans le tableau.
            </li>
            <li>
              Selon le type d'envoi de la caisse, le traitement « NIMP15 » et le type d'ouverture
              sont renseignés automatiquement (une caisse 4C s'ouvre toujours par dessus), ainsi
              qu'une information sur la taille maximum et sur la présence d'une mousse de
              protection, qui réduit le volume disponible de la caisse.
            </li>
            <li>
              La sélection d'une caisse de stock ou de récup reprend automatiquement ses dimensions
              et son type d'ouverture (qui n'est alors plus modifiable), et coche « Cde passée sur
              achat stock ». Pas de caisse de stock pour un envoi 4B ou 4C.
            </li>
            <li>
              Pour créer plusieurs caisses d'un coup, cliquer sur « + Ajouter une caisse » et
              reproduire le même schéma que précédemment.
            </li>
            <li>Une fois créées, les caisses apparaissent dans le tableau principal.</li>
          </ul>

          <h3>La gestion</h3>
          <ul>
            <li>
              Le tableau est trié par défaut de la date de picking la plus lointaine dans le futur
              à la plus ancienne ; l'ordre se modifie dans le bouton « Options ».
            </li>
            <li>
              Les informations se modifient directement dans le tableau, et certaines modifications
              en déclenchent d'autres : changer le type d'envoi agit sur le type d'ouverture et le
              traitement, sélectionner une caisse de stock agit sur les dimensions et le type
              d'ouverture, etc. Les modifications ne sont enregistrées qu'au clic sur
              « Enregistrer » (« Annuler » revient à l'état enregistré).
            </li>
            <li>
              La première colonne contient des cases à cocher : dès qu'une ligne est cochée, des
              boutons permettent de valider ou de dévalider la livraison de toute la sélection.
            </li>
            <li>
              La deuxième colonne, « OK pour être commandée », génère l'affiche à copier dans le
              mail de demande d'achat, à condition que les informations nécessaires soient
              remplies (voir « Passer la commande »).
            </li>
            <li>
              Sur la dernière colonne :
              <ul>
                <li>
                  <strong>Livré</strong> valide la livraison de la caisse (« Dévalider » pour
                  revenir en arrière). Une caisse livrée ne peut plus être modifiée tant qu'elle
                  n'a pas été dévalidée.
                </li>
                <li>
                  <strong>+ Caisse</strong> ajoute une nouvelle caisse à cette affaire. Elle hérite
                  de la caisse mère : type d'envoi, date de picking, traitement (s'il y en a un).
                </li>
                <li>
                  <strong>Suppr.</strong> supprime l'affaire du tableau, après confirmation.
                </li>
                <li>
                  <strong>Simuler</strong> ouvre la ou les caisses de cette affaire dans la page
                  Simulations, pour y ajouter les articles, estimer le volume et vérifier que la
                  caisse correspond bien au besoin.
                </li>
              </ul>
            </li>
          </ul>
        </Bloc>

        <Bloc id="simuler" titre="2. Simuler l'affaire">
          <ul>
            <li>
              Depuis le tableau Gestion des caisses, au clic sur « Simuler » : si l'affaire n'existe
              pas encore dans Simulations, une proposition de création apparaît, avec une caisse
              reprenant les dimensions et le type d'envoi du tableau.
            </li>
            <li>
              L'écran Simulations affiche un bandeau récapitulatif en haut de page (dimensions
              maximales, volume total, poids total, avertissement mousse pour les caisses 4C),
              ainsi que les deux alertes automatiques : un article qui ne rentre pas dans sa
              caisse, et un volume d'affaire supérieur à la capacité cumulée des caisses.
            </li>
            <li>
              Chaque caisse est représentée par une carte détaillant volume interne, volume
              occupé, volume disponible, poids, seuil de remplissage, dimensions maximales des
              articles assignés et taux de remplissage avec code couleur (vert / orange / rouge).
            </li>
            <li>
              Le bouton « + Nouvelle caisse » permet d'en ajouter d'autres à la volée. Les
              dimensions restent synchronisées dans les deux sens avec le tableau Gestion des
              caisses.
            </li>
          </ul>
        </Bloc>

        <Bloc id="entreprise" titre="3. Récupérer les articles depuis l'intranet entreprise">
          <ul>
            <li>
              Sur le picking de l'affaire, dans l'intranet entreprise : menu Options → « Exporter
              toutes les lignes » → génère un fichier Excel.
            </li>
            <li>
              Ouvrir le fichier « Aide colisage dimensions V1 » : coller les références AR dans
              la première colonne et les quantités dans la colonne Qté, puis cliquer sur
              « Récupérer les infos » pour obtenir référence, désignation, dimensions et poids de
              chaque article.
            </li>
            <li>
              Sélectionner et copier cette liste, puis la coller dans le bouton « Coller depuis
              Excel » de la section Simulations et valider l'import. L'outil met immédiatement en
              évidence la plus grande longueur / largeur / hauteur de l'affaire — un indice utile
              pour dimensionner les caisses.
            </li>
          </ul>
        </Bloc>

        <Bloc id="assigner" titre="4. Assigner et vérifier">
          <ul>
            <li>
              Assigner des articles à une caisse : sélection multiple + « Assigner à → », glisser-
              déposer directement sur la carte de la caisse (tous les articles cochés partent
              ensemble si l'on attrape l'un d'eux), ou création d'une caisse à la volée depuis la
              sélection. Le taux de remplissage indique si le volume rentre, avec un seuil
              d'alerte réglable par affaire (70 % par défaut) et surchargeable par caisse.
            </li>
            <li>
              Multi-caisses : répartir les articles entre plusieurs caisses d'une même affaire —
              le nom de la caisse d'assignation s'affiche sur chaque ligne d'article du tableau.
            </li>
            <li>
              Deux alertes à surveiller : un article dont une dimension dépasse celle de sa
              caisse, et un volume total d'affaire supérieur à la capacité cumulée des caisses.
            </li>
          </ul>
        </Bloc>

        <Bloc id="commande" titre="5. Passer la commande">
          <ul>
            <li>
              Une fois la simulation validée et la date de commande atteinte : cocher « OK pour
              être commandée » sur l'affaire génère l'affiche destinée au service Achat (les
              éventuelles multi-caisses sont incluses dans la même demande). La case ne se coche
              que si l'affaire, les trois dimensions, la quantité, la date demandée à S2C et le
              type d'ouverture sont renseignés ; sinon, un message indique ce qui manque.
            </li>
            <li>
              Dans la section « Demandes d'achats » : copier une affiche individuellement, ou en
              sélectionner plusieurs (voire toutes) et utiliser « Copier la sélection » pour coller
              directement dans le mail à envoyer. La mise en forme et les mentions de prestation
              (soudure/fermeture pour les caisses 4C, etc.) sont détectées automatiquement si la
              demande est correctement remplie.
            </li>
            <li>
              Lorsque la ou les caisses ont été livrées : sélectionner une ou plusieurs affaires et
              cliquer sur le bouton « Valider la sélection », ou cliquer sur le bouton « Livré » de
              la dernière colonne du tableau, validant ainsi l'affaire.
            </li>
          </ul>
        </Bloc>

        <Bloc id="stock" titre="Caisses en stock (section indépendante)">
          <ul>
            <li>
              Répertorie les caisses actuellement en stock. Les références « AR_CAISS » n'ont pas
              de quantité et ne sont reliées à aucune autre donnée — c'est une liste purement
              indicative.
            </li>
            <li>
              Les caisses « de récupération » peuvent être affectées à une affaire : à la création
              de la caisse ou directement dans le tableau Gestion des caisses, en sélectionnant la
              caisse en stock, ses dimensions et son type d'ouverture sont repris
              automatiquement. Une caisse de récup ne peut être affectée qu'à une seule affaire à
              la fois ; une fois l'affaire validée, elle n'est plus proposée.
            </li>
            <li>
              Le tableau est en lecture seule : il affiche nom, dimensions, type d'ouverture,
              observations et l'affaire à laquelle chaque caisse est affectée.
            </li>
          </ul>
          <h3>Gérer les caisses</h3>
          <ul>
            <li>
              Le bouton « Gérer les caisses » est le seul endroit où l'on crée, modifie ou supprime
              une caisse en stock : nom, dimensions, type d'ouverture (« Par dessus », « Par
              devant » ou « Par dessus et par devant ») et observations.
            </li>
            <li>
              Modifier les dimensions ou le type d'ouverture d'une caisse déjà sélectionnée dans
              Gestion des caisses les reporte, après confirmation, sur les caisses pas encore
              livrées qui l'utilisent (et sur leurs caisses dans Simulations). Les caisses déjà
              livrées gardent leurs valeurs.
            </li>
            <li>
              Supprimer une caisse encore utilisée affiche un avertissement : les lignes
              concernées gardent leurs dimensions, mais la caisse n'y est plus sélectionnée.
            </li>
          </ul>
        </Bloc>

        <Bloc id="references" titre="Gérer les références (bouton en tête de Gestion des caisses)">
          <ul>
            <li>
              Contrôle le contenu des listes déroulantes des colonnes Moteurs / Module linéaire /
              Terminaux, utilisées à la fois dans l'édition du tableau et dans le dialogue
              « + Créer une nouvelle caisse ».
            </li>
            <li>
              Par colonne : ajouter une valeur, la <strong>renommer</strong> (le nouveau libellé
              est répercuté automatiquement sur toutes les lignes qui l'utilisaient déjà, avec
              confirmation si des lignes sont concernées), ou en <strong>supprimer</strong> une ou
              plusieurs (sélection multiple ; la valeur disparaît de la liste mais les lignes qui
              la portaient gardent le texte tel quel — avertissement si la valeur est utilisée).
            </li>
            <li>
              Les valeurs sont triées automatiquement par quantité puis par numéro de référence
              (par exemple « 1 MOTEUR » avant « 2 MOTEURS » avant « 10 MOTEURS »).
            </li>
          </ul>
        </Bloc>

        <Bloc id="verrouillage" titre="Verrouillage multi-poste et demande d'écriture">
          <ul>
            <li>
              Plusieurs postes peuvent travailler sur la même base de données (dossier réseau
              partagé) : le verrouillage évite que deux personnes modifient la même chose au
              même moment.
            </li>
            <li>
              Portée : un verrou couvre l'écran entier pour Gestion des caisses, Caisses en stock
              et Demandes d'achats ; pour Simulations, le verrou est pris par affaire précise.
            </li>
            <li>
              La prise du verrou est automatique à l'ouverture de l'écran ou de l'affaire — aucune
              action volontaire n'est nécessaire. Il se libère en quittant l'écran, ou après 5
              minutes sans activité (souris ou clavier).
            </li>
            <li>
              Quand un autre poste détient déjà la main, un bandeau « Verrouillé en écriture par
              XYZ » s'affiche : l'écran reste consultable mais passe en lecture seule, sans
              redirection forcée et sans perte de la saisie en cours.
            </li>
            <li>
              Le bouton « Demande d'écriture » du bandeau envoie une demande au titulaire actuel,
              qui voit apparaître une bannière lui permettant d'approuver ou de refuser. Si le
              titulaire ne répond pas et que son poste ne donne plus signe d'activité, le
              demandeur reprend automatiquement la main après 90 secondes — sans attendre les 5
              minutes d'expiration classique du verrou.
            </li>
          </ul>
        </Bloc>

        <Bloc id="base" titre="Base de données et sauvegarde">
          <ul>
            <li>
              Toutes les données (caisses, affaires, articles, caisses en stock, références) sont
              dans un seul fichier, <strong>caisses.sqlite3</strong>, placé dans le dossier choisi
              au premier lancement de l'application. Ce dossier peut être sur le réseau pour que
              plusieurs postes partagent les mêmes données.
            </li>
            <li>
              L'enregistrement est immédiat dans Simulations et Caisses en stock. Dans Gestion des
              caisses, les modifications restent en attente jusqu'au clic sur « Enregistrer ».
            </li>
            <li>
              La base est copiée automatiquement (chaque jour ou chaque semaine) dans un dossier de
              sauvegarde, sous le nom <strong>caisses_JJ-MM-AAAA_HH-MM-SS.sqlite3</strong>. La
              copie est faite par le premier poste ouvert au moment où elle est due, un seul poste
              à la fois ; les plus anciennes sont supprimées au-delà d'un nombre de copies fixé
              (30 par défaut).
            </li>
            <li>
              En cas de problème, la base peut être remplacée par une sauvegarde plus ancienne.
              Cette opération est réservée à l'administrateur et nécessite que l'application soit
              fermée sur tous les autres postes.
            </li>
          </ul>
        </Bloc>
      </div>
    </div>
  );
}

function Bloc({ id, titre, children }: { id: string; titre: string; children: React.ReactNode }) {
  return (
    <section id={id} className="panel" style={{ padding: "20px 24px", marginBottom: 20, scrollMarginTop: 70 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 12px", letterSpacing: "-0.01em" }}>{titre}</h2>
      <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--text)" }} className="doc-bloc">
        {children}
      </div>
    </section>
  );
}
