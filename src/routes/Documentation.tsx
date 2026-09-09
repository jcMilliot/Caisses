import { useEffect, useRef, useState } from "react";

// Documentation du processus métier, écran statique (pas d'appel data/).
// Contenu fourni par l'utilisateur le 2026-09-03, mis en forme le 2026-09-04.
// À compléter au fur et à mesure : captures d'écran à intégrer par section (cf. commentaires
// <!-- capture: ... --> laissés en repère), sections encore vides à étoffer.

interface SectionDoc {
  id: string;
  titre: string;
}

const SOMMAIRE: SectionDoc[] = [
  { id: "gestion-caisses", titre: "1. Gestion des caisses" },
  { id: "simuler", titre: "2. Simuler l'affaire" },
  { id: "sealedair", titre: "3. Récupérer les articles (SealedAir)" },
  { id: "assigner", titre: "4. Assigner et vérifier" },
  { id: "commande", titre: "5. Passer la commande" },
  { id: "stock", titre: "Caisses en stock" },
  { id: "references", titre: "Gérer les références" },
  { id: "verrouillage", titre: "Verrouillage & demande de crayon" },
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
            Le processus complet, de la demande de caisse jusqu'à la commande. Cette page se
            complète au fil des sessions — certaines parties restent volontairement courtes en
            attendant des captures d'écran.
          </p>
        </div>

        <Bloc id="gestion-caisses" titre="1. Gestion des caisses (ex-Demandes) — point de départ">
          <ul>
            <li>
              « + Créer une nouvelle caisse » : le nom d'affaire et la quantité sont{" "}
              <strong>obligatoires</strong> (champ au fond orangé tant qu'ils sont vides). Le
              reste des informations peut être renseigné tout de suite ou plus tard, directement
              dans le tableau.
            </li>
            <li>
              Dans le dialogue de création : le bouton s'appelle « Créer N caisse(s) » quand il
              n'y en a qu'une, ou « Ajouter une caisse » pour en saisir plusieurs d'un coup avant
              de valider.
            </li>
            <li>
              Une fois créées, les caisses apparaissent dans le tableau principal : édition
              inline (clic sur une cellule), cases à cocher pour les colonnes oui/non, tri par
              colonne, filtres, et un menu « Options » (dont l'inversion de l'ordre du tableau).
            </li>
            <li>
              Pour ajouter une autre caisse à une affaire déjà présente dans le tableau : clic
              droit sur une de ses lignes → « Créer une nouvelle caisse ». La caisse « enfant »
              hérite automatiquement de la caisse mère : type d'envoi, date de picking,
              traitement (si renseigné).
            </li>
          </ul>
          {/* capture: dialogue "Créer une nouvelle caisse" */}
          {/* capture: clic droit sur une ligne du tableau Demandes */}
        </Bloc>

        <Bloc id="simuler" titre="2. Simuler l'affaire">
          <ul>
            <li>
              Depuis le tableau Demandes : clic droit sur une ligne → « Simuler l'affaire ». Si
              l'affaire n'existe pas encore côté Simulations, un message propose de la créer avec
              une caisse reprenant directement les dimensions saisies dans le tableau.
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
              dimensions restent synchronisées dans les deux sens avec le tableau Demandes.
            </li>
          </ul>
          {/* capture: bandeau récap + CaisseCard */}
        </Bloc>

        <Bloc id="sealedair" titre="3. Récupérer les articles depuis l'intranet SealedAir">
          <ul>
            <li>
              Sur le picking de l'affaire, dans l'intranet SealedAir : menu Options → « Exporter
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
          {/* capture: export SealedAir */}
          {/* capture: fichier "Aide colisage dimensions V1" */}
        </Bloc>

        <Bloc id="assigner" titre="4. Assigner et vérifier">
          <ul>
            <li>
              Assigner des articles à une caisse : sélection multiple + « Assigner à → », glisser-
              déposer directement sur la carte de la caisse, ou création d'une caisse à la volée
              depuis la sélection. Le taux de remplissage indique si le volume rentre, avec un
              seuil d'alerte réglable par affaire (70 % par défaut) et surchargeable par caisse.
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
          {/* capture: sélection + Assigner à */}
        </Bloc>

        <Bloc id="commande" titre="5. Passer la commande">
          <ul>
            <li>
              Une fois la simulation validée et la date de commande atteinte : cocher « OK CDE »
              sur l'affaire génère l'affiche destinée au service Achat (les éventuelles
              multi-caisses sont incluses dans la même demande).
            </li>
            <li>
              Dans la section « Demandes d'achats » : copier une affiche individuellement, ou en
              sélectionner plusieurs (voire toutes) et utiliser « Copier la sélection » pour coller
              directement dans le mail à envoyer. La mise en forme et les mentions de prestation
              (soudure/fermeture pour les caisses 4C, etc.) sont détectées automatiquement si la
              demande est correctement remplie.
            </li>
            <li>
              Après que la commande a été passée : sélectionner une ou plusieurs affaires puis
              « Valider la sélection », ou clic droit → « Valider la caisse » pour une seule ligne.
            </li>
          </ul>
          {/* capture: affiche générée + copie groupée */}
        </Bloc>

        <Bloc id="stock" titre="Caisses en stock (section indépendante)">
          <ul>
            <li>
              Répertorie les caisses actuellement en stock. Les références « AR_CAISS » n'ont pas
              de quantité et ne sont reliées à aucune autre donnée — c'est une liste purement
              indicative.
            </li>
            <li>
              Les caisses « de récupération » peuvent être affectées à une affaire : depuis la
              création de la demande ou directement dans le tableau Demandes, en sélectionnant
              une caisse en stock, ses dimensions sont reprises automatiquement. Une caisse de
              récup ne peut être affectée qu'à une seule affaire à la fois ; une fois l'affaire
              validée, elle redevient disponible ou n'est plus proposée (selon le flux en cours).
            </li>
            <li>CRUD complet : nom, dimensions, quantité, observations, édition inline, suppression, verrouillage multi-poste comme les autres écrans.</li>
          </ul>
        </Bloc>

        <Bloc id="references" titre="Gérer les références (bouton en tête de Gestion des caisses)">
          <ul>
            <li>
              Contrôle le contenu des listes déroulantes des colonnes Moteurs / Module linéaire /
              Terminaux, utilisées à la fois dans l'édition inline du tableau et dans le dialogue
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

        <Bloc id="verrouillage" titre="Verrouillage multi-poste et demande de crayon">
          <ul>
            <li>
              Plusieurs postes peuvent travailler sur la même base de données (dossier réseau
              partagé) : le verrouillage évite que deux personnes modifient la même chose au
              même moment.
            </li>
            <li>
              Portée : un verrou couvre l'écran entier pour Demandes, Caisses en stock et
              Demandes d'achats ; pour Simulations, le verrou est pris par affaire précise —
              jamais plus finement.
            </li>
            <li>
              La prise du verrou est automatique à l'ouverture de l'écran ou de l'affaire — aucune
              action volontaire n'est nécessaire. Il se libère en quittant l'écran, ou après 5
              minutes sans activité (souris ou clavier).
            </li>
            <li>
              Quand un autre poste détient déjà la main, un bandeau « verrouillé par XYZ »
              s'affiche : l'écran reste consultable mais passe en lecture seule, sans redirection
              forcée et sans perte de la saisie en cours.
            </li>
            <li>
              Le bouton « Demander le crayon » du bandeau envoie une demande au titulaire actuel,
              qui voit apparaître une bannière lui permettant d'approuver ou de refuser. Si le
              titulaire ne répond pas et que son poste ne donne plus signe d'activité, le
              demandeur reprend automatiquement la main après 90 secondes — sans attendre les 5
              minutes d'expiration classique du verrou.
            </li>
            <li>
              Limite connue : il n'existe pas de droits différenciés par utilisateur — une fois la
              main obtenue, toutes les actions sont possibles pour tout le monde.
            </li>
          </ul>
          {/* capture: bandeau "verrouillé par XYZ" + bouton "Demander le crayon" */}
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
