// Onglet « Feuille de route » de la page Admin : ce qui reste à faire et ce qui reste à décider,
// en langage non technique (demande de l'utilisateur du 2026-09-30). Texte statique, à tenir à
// jour à la main en même temps que « Prochaines étapes » de CLAUDE.md, dont il est la version
// lisible par les administrateurs.

interface Point {
  titre: string;
  detail: string;
}

const A_FAIRE: Point[] = [];

const A_VERIFIER: Point[] = [
  {
    titre: "Droits par écran",
    detail:
      "Admin › Utilisateurs : une colonne par écran, Lecture ou Écriture. Après la mise à jour, chacun garde ses droits (les anciens « Lecteurs » sont en lecture partout). Mettre la personne concernée en Lecture sur le Contrôle dimensionnel : sur son poste, l'écran passe en lecture seule au prochain changement d'écran, et elle écrit toujours ailleurs. Une nouvelle personne est en lecture partout.",
  },
  {
    titre: "Contrôle dimensionnel : validation automatique",
    detail:
      "Corriger dans l'ERP un article « À contrôler », puis « Actualiser depuis l'intranet » : il passe dans « Validés » avec « ERP » comme contrôleur, et le journal de l'Admin garde l'ancienne et la nouvelle valeur. « Corriger… » n'existe plus ; « Dimensions corrigées » disparaît quand il n'y a plus rien à reporter. Rien ne change dans « Petits volumes ».",
  },
  {
    titre: "Verrouillage à la fermeture",
    detail:
      "Fonctionnement prévu : après la fermeture de l'application sur un poste, l'autre poste voit « Prendre la main » en 7 secondes au plus, et doit cliquer dessus. Si l'attente dépasse une dizaine de secondes, la main n'a pas été libérée (fermeture forcée, PC éteint) : il faut alors attendre 5 minutes, ou la retirer depuis l'Admin.",
  },
  {
    titre: "Admin : retirer la main",
    detail:
      "Admin › Utilisateurs › « Qui a la main » : retirer la main à un poste ; sur ce poste, l'écran passe en lecture seule en quelques secondes, et l'autre poste peut « Prendre la main ». Une ligne « Main retirée » apparaît dans le journal.",
  },
  {
    titre: "Simulations : dimensions remises dans l'ordre",
    detail:
      "Une pièce mesurée dans le désordre (diamètre × diamètre × longueur) ne doit plus être signalée « plus grande que la caisse » ; « Calcul : … » s'affiche sous la dimension.",
  },
  {
    titre: "Petits volumes : colonne « Sortie »",
    detail: "Vérifier sur une affaire en cours que « Oui » et le nom de l'affaire apparaissent quand la pièce est sortie.",
  },
  {
    titre: "Gestion des caisses : colonne Affaire",
    detail:
      "Un nom d'affaire groupé (« XXX/YYY ») doit passer à la ligne après les « / ». Pas encore eu de cas.",
  },
];

const A_DECIDER: Point[] = [
  {
    titre: "Petits volumes : pièce mise en sachet à la préparation",
    detail:
      "Quand l'ERP donne déjà les vraies dimensions de la pièce, mais qu'on la met en sachet en la préparant : aujourd'hui on choisit « Sachet » et on retape les dimensions de l'ERP. Idée : un bouton « Reprendre les dimensions de l'ERP » dans la fenêtre « Sachet ».",
  },
  {
    titre: "Aide au dimensionnement des caisses",
    detail:
      "Idée : proposer des dimensions de caisse à partir des plus grands articles, avec une marge. Marge à définir (en cm ou en %, différente pour les caisses 4C ?).",
  },
  {
    titre: "Vue 3D des caisses",
    detail:
      "Idée : après le colisage, une vue 3D d'une caisse où l'on place les colis et les pièces de sa lettre, qu'on déplace et tourne à la main, pour affiner les dimensions de la caisse. Plus tard peut-être, un placement automatique.",
  },
  {
    titre: "Droits par action",
    detail:
      "Les droits se règlent par écran. Des droits plus fins sur certaines actions (« Livré », « OK pour être commandée »…) seulement si des erreurs fréquentes surviennent.",
  },
  {
    titre: "Base de données partagée sur le réseau",
    detail:
      "Le partage réseau reste fragile si deux postes écrivent en même temps, malgré le verrouillage. À terme, un serveur central serait plus sûr ; en attendant, la sauvegarde automatique limite le risque.",
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
