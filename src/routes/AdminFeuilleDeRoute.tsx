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
    titre: "Restauration avec d'autres postes ouverts",
    detail:
      "Lancer une restauration alors que l'app est ouverte sur un autre poste : ce poste doit afficher « L'application doit être fermée… », se fermer après validation, et la restauration doit démarrer seule.",
  },
  {
    titre: "Taux de remplissage",
    detail:
      "Vérifier qu'il s'affiche dans la liste des affaires de Simulations et dans la colonne « Taux de remplissage » de Gestion des caisses, pour les affaires qui ont des caisses avec des articles (une valeur par caisse s'il y en a plusieurs).",
  },
  {
    titre: "Alerte de poids (Simulations)",
    detail:
      "Sur une caisse dont les articles pèsent 320 kg ou plus par m² de fond, vérifier que la carte passe en rouge avec « Charge trop lourde ». La limite se règle dans l'onglet Paramètres ; le poids de la caisse elle-même est compris dans la marge.",
  },
  {
    titre: "Statistiques des caisses",
    detail:
      "Dans Admin › Caisses › Statistiques, vérifier que les chiffres correspondent à ce qui a été livré (sur mesure, caisses de stock, formats les plus utilisés) et que le choix de période fonctionne.",
  },
  {
    titre: "Stock des caisses « AR_CAISS_ »",
    detail:
      "Dans l'onglet Caisses de l'Admin, cocher « Gérée » et saisir la quantité réelle et le seuil d'alerte de chaque caisse (d'après le fichier « caisses » du bureau). Puis passer en « Livré » une caisse qui en utilise une : la quantité doit baisser, et l'alerte « à commander » apparaître (Caisses en stock, accueil, barre des tâches) quand le seuil est atteint. Repasser en « Non livré » : l'app doit proposer de remettre la quantité en stock. Passer en « Livré » une commande ACHSTOCK d'une caisse gérée : la quantité doit augmenter.",
  },
  {
    titre: "Suggestion de caisse en stock (Simulations)",
    detail:
      "Sur une affaire avec des articles et une caisse Standard, vérifier qu'une caisse en stock est proposée sur la carte de la caisse, et que « Utiliser » reprend ses dimensions et la sélectionne aussi dans Gestion des caisses. Modifier ensuite une dimension : la caisse en stock doit être désélectionnée.",
  },
  {
    titre: "Sauvegarde automatique",
    detail:
      "Choisir le dossier et la fréquence dans l'onglet Sauvegarde, puis vérifier qu'une copie apparaît bien dans le dossier.",
  },
  {
    titre: "Dossier de sauvegarde partagé avec le second administrateur",
    detail:
      "Le dossier de sauvegarde est un dossier OneDrive personnel : le poste FBA ne le trouve pas (« Dossier de sauvegarde inaccessible »). Le partager avec le second administrateur pour qu'il ait accès aux sauvegardes et puisse les gérer en l'absence du premier. Attention : le même chemin sert pour tous les postes, il doit donc exister à l'identique sur chacun.",
  },
  {
    titre: "Format des dates",
    detail: "Sur le poste du bureau, vérifier que les calendriers affichent les dates en JJ/MM/AAAA.",
  },
  {
    titre: "Alerte « À commander »",
    detail:
      "Vérifier que la pastille rouge apparaît sur l'icône de l'application dans la barre des tâches quand une affaire est en alerte.",
  },
  {
    titre: "Rôles",
    detail:
      "Passer un utilisateur en Lecteur et vérifier qu'il ne peut rien modifier ; nommer un 2e administrateur et vérifier qu'il crée son mot de passe à sa première ouverture de l'Admin.",
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
