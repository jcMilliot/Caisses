// Onglet « Feuille de route » de la page Admin : ce qui reste à faire et ce qui reste à décider,
// en langage non technique (demande de l'utilisateur du 2026-09-30). Texte statique, à tenir à
// jour à la main en même temps que « Prochaines étapes » de CLAUDE.md, dont il est la version
// lisible par les administrateurs.

interface Point {
  titre: string;
  detail: string;
}

const A_FAIRE: Point[] = [
  {
    titre: "Colisage : rangement des colis",
    detail:
      "Si l'intranet indique dans quelle caisse va un colis, le reprendre. Sinon, quand l'affaire n'a qu'une caisse, y ranger les colis d'office.",
  },
  {
    titre: "Tablette Samsung sous Windows",
    detail:
      "Essayer d'installer l'application sur la tablette, pour choisir les cartons pendant le colisage.",
  },
  {
    titre: "Documentation",
    detail:
      "Faire le point ensemble : ajouter l'import du picking depuis l'intranet (mise à jour à l'ouverture d'une affaire, lignes supprimées, numéro de besoin), les onglets Picking / Colisage en cours, et revoir la section « Récupérer les articles ».",
  },
];

const A_VERIFIER: Point[] = [
  {
    titre: "Dossier de la base",
    detail:
      "Admin › Paramètres › « Dossier de la base » : noter le chemin pour les nouveaux postes. Sur un nouveau poste, coller ce chemin au premier démarrage. Un changement de dossier se fait app fermée sur les autres postes ; ils suivent à leur prochain démarrage.",
  },
  {
    titre: "Verrouillage à la fermeture",
    detail:
      "Fermer l'application sur un poste qui a la main : l'autre poste doit pouvoir écrire tout de suite. Sur un écran resté ouvert en lecture seule, « Prendre la main » doit apparaître dans le bandeau quand le verrou se libère, et recharger l'écran.",
  },
  {
    titre: "Commande sur affaire / sur stock",
    detail:
      "Choisir une caisse en stock sur une ligne existante (menu « Stock » ou suggestion de Simulations) coche « Cde passée sur achat stock » ; la retirer recoche « Cde passée sur affaire ».",
  },
  {
    titre: "Accueil : caisses à rapatrier",
    detail:
      "Une caisse passée sur une caisse en stock dans Gestion des caisses passe du bloc « à commander » au bloc « à rapatrier » de l'accueil.",
  },
  {
    titre: "Gestion des caisses : colonne Affaire",
    detail:
      "La colonne se réduit jusqu'à la largeur d'un nom normal ; un nom d'affaire groupé (« XXX/YYY ») passe à la ligne après les « / ». Plus de cases de sélection en début de ligne.",
  },
  {
    titre: "Affichage compact",
    detail:
      "Options › « Affichage compact » : le tableau Gestion des caisses occupe exactement la largeur de l'écran, sans défilement horizontal. Hors compact, il peut dépasser.",
  },
];

const A_DECIDER: Point[] = [
  {
    titre: "Aide au dimensionnement des caisses",
    detail:
      "Idée : proposer des dimensions de caisse à partir des plus grands articles, avec une marge. Marge à définir (en cm ou en %, différente pour les caisses 4C ?).",
  },
  {
    titre: "Caisses enfants à la création",
    detail: "Idée : pouvoir créer directement les caisses enfants dans la fenêtre « Créer une nouvelle caisse ».",
  },
  {
    titre: "Vue 3D des caisses",
    detail:
      "Idée : après le colisage, une vue 3D d'une caisse où l'on place les colis et les pièces de sa lettre, qu'on déplace et tourne à la main, pour affiner les dimensions de la caisse. Plus tard peut-être, un placement automatique.",
  },
  {
    titre: "Droits plus fins",
    detail:
      "Définir qui a accès à quoi au-delà des rôles actuels — par exemple la documentation technique, réservée pour l'instant aux administrateurs.",
  },
  {
    titre: "Base de données partagée sur le réseau",
    detail:
      "Le partage réseau reste fragile si deux postes écrivent en même temps, malgré le verrouillage. À terme, un serveur central serait plus sûr ; en attendant, la sauvegarde automatique limite le risque.",
  },
  {
    titre: "Alerte Windows Defender à chaque mise à jour",
    detail:
      "L'installeur n'est pas signé, d'où le blocage possible par Defender. Un certificat de signature payant n'est pas prévu, à revoir si le nombre de postes augmente.",
  },
];

export default function AdminFeuilleDeRoute() {
  return (
    <div style={{ maxWidth: 820, display: "grid", gap: 20 }}>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0 }}>
        Ce qui est prévu pour les prochaines versions, ce qu'il reste à vérifier sur les postes, et les questions encore
        ouvertes.
      </p>
      {A_FAIRE.length > 0 && (
        <Liste titre="Reste à faire" sousTitre="Décidé, à développer" points={A_FAIRE} couleur="var(--info-text)" />
      )}
      <Liste titre="À vérifier" sousTitre="Sur les postes, après mise à jour" points={A_VERIFIER} couleur="var(--ok-text)" />
      <Liste titre="À réfléchir" sousTitre="Questions ouvertes et idées" points={A_DECIDER} couleur="var(--warn-text)" />
    </div>
  );
}

function Liste({ titre, sousTitre, points, couleur }: { titre: string; sousTitre: string; points: Point[]; couleur: string }) {
  return (
    <section className="panel" style={{ padding: "18px 22px", borderLeft: `4px solid ${couleur}` }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{titre}</h2>
      <div style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 12px" }}>{sousTitre}</div>
      <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8, fontSize: 13.5, lineHeight: 1.5 }}>
        {points.map((p) => (
          <li key={p.titre}>
            <strong>{p.titre}</strong> — {p.detail}
          </li>
        ))}
      </ul>
    </section>
  );
}
