// Onglet « Feuille de route » de la page Admin : ce qui reste à faire et ce qui reste à décider,
// en langage non technique (demande de l'utilisateur du 2026-09-30). Texte statique, à tenir à
// jour à la main en même temps que « Prochaines étapes » de CLAUDE.md, dont il est la version
// lisible par les administrateurs.

interface Point {
  titre: string;
  detail: string;
}

const A_FAIRE: Point[] = [
];

const A_VERIFIER: Point[] = [
  {
    titre: "Caisses en stock : matière et dimensions extérieures",
    detail:
      "Dans « Gérer les caisses », renseigner la matière (obligatoire) et, si besoin, les dimensions extérieures de chaque caisse ; vérifier qu'elles apparaissent dans Admin › Caisses.",
  },
  {
    titre: "Graphique stock / sur mesure",
    detail:
      "Dans Admin › Caisses › Statistiques, vérifier le graphique en tête de page : un onglet par année (détail des 12 mois) et « Tout » (une barre par année), les caisses de stock et sur mesure, et les quantités au survol.",
  },
  {
    titre: "Filtre de la colonne Stock",
    detail:
      "Dans Gestion des caisses, les anciennes lignes affichent maintenant le nom de caisse écrit dans l'Excel au lieu de « — » ; filtrer sur une caisse ne doit montrer que des lignes qui affichent ce nom.",
  },
  {
    titre: "Caisses liées (Simulations)",
    detail:
      "Ouvrir une affaire créée depuis Gestion des caisses : la carte de la caisse ne doit plus afficher « Lier… » ni la ligne « Gestion des caisses ».",
  },
  {
    titre: "Mise à jour dans l'application",
    detail:
      "À la prochaine version publiée après celle-ci : une barre doit apparaître en haut de l'app avec « Installer » / « Plus tard », puis montrer le téléchargement et redémarrer l'app toute seule, sans la fenêtre de l'installeur Windows.",
  },
  {
    titre: "Nouvel aspect de l'application",
    detail:
      "Parcourir les écrans sur chaque poste (navigation en onglets, Admin, Gestion des caisses, fenêtres) et signaler tout texte coupé, bouton mal placé ou écran moins lisible qu'avant.",
  },
  {
    titre: "Lier une caisse (Simulations)",
    detail:
      "Sur une caisse non liée, « Lier… » doit permettre de choisir la ligne de Gestion des caisses ; le taux de remplissage doit ensuite s'afficher sur cette ligne, et le bouton disparaître.",
  },
  {
    titre: "Taux de remplissage",
    detail:
      "Vérifier qu'il s'affiche dans la liste des affaires de Simulations et dans la colonne « Taux de remplissage » de Gestion des caisses, pour les affaires qui ont des caisses avec des articles (une valeur par caisse s'il y en a plusieurs).",
  },
  {
    titre: "Code de secours",
    detail:
      "AJC : cliquer sur « Créer un code de secours » en haut de la page Admin et le noter en lieu sûr. Il sert si le mot de passe est oublié.",
  },
  {
    titre: "Seuil d'alerte général",
    detail: "Le régler dans l'onglet Paramètres et vérifier qu'il s'applique aux affaires non livrées, pas aux affaires livrées.",
  },
  {
    titre: "Collage des lignes « AR / ZR »",
    detail:
      "Coller une ligne dont l'AR ne commence ni par AR ni par ZR : la fenêtre de choix doit apparaître, et les lignes non cochées doivent être listées sous le tableau.",
  },
  {
    titre: "Documentation modifiable",
    detail: "Modifier un texte de la documentation, enregistrer, puis vérifier qu'il apparaît sur un autre poste.",
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
    titre: "Cartons standards (outil de colisage)",
    detail:
      "Idée : retirer d'une simulation les articles déjà rangés dans des cartons standards, et les remplacer par ces cartons. Il faut d'abord un exemple du fichier produit par l'outil de colisage.",
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
