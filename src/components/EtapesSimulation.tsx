import { formaterHorodatage } from "../domain/dates";

// Repère d'étapes d'une affaire de Simulations (2026-10-27), non cliquable : 1 « Picking »
// (onglet), 2 « Mise à jour » (import / vérification automatique du picking à l'ouverture),
// 3 « Colisage en cours » (onglet). Sous le repère : où en est la mise à jour.

export interface EtatMiseAJour {
  enCours: boolean;
  // Dernière vérification enregistrée (UTC), null si le picking n'a jamais été importé.
  derniereMaj: string | null;
  erreur: string | null;
  // Mise à jour automatique pas encore lancée parce qu'un autre poste a la main.
  attenteMain: boolean;
}

type Statut = "actif" | "fait" | "alerte" | "inactif";

const COULEURS: Record<Statut, { fond: string; texte: string; bord: string }> = {
  actif: { fond: "var(--accent)", texte: "#fff", bord: "var(--accent)" },
  fait: { fond: "var(--ok-bg)", texte: "var(--ok-text)", bord: "var(--ok-text)" },
  alerte: { fond: "var(--warn-bg)", texte: "var(--warn-text)", bord: "var(--warn-text)" },
  inactif: { fond: "transparent", texte: "var(--text-faint)", bord: "var(--border-strong)" },
};

function Etape({ numero, libelle, statut }: { numero: number; libelle: string; statut: Statut }) {
  const c = COULEURS[statut];
  return (
    <li style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 700,
          background: c.fond,
          color: c.texte,
          border: `1.5px solid ${c.bord}`,
        }}
      >
        {statut === "fait" ? "✓" : numero}
      </span>
      <span style={{ fontSize: 13, color: statut === "inactif" ? "var(--text-faint)" : "var(--text)", fontWeight: statut === "actif" ? 600 : 500 }}>
        <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>Étape {numero} : </span>
        {libelle}
      </span>
    </li>
  );
}

const Separateur = () => <li aria-hidden style={{ width: 28, height: 1.5, background: "var(--border-strong)" }} />;

export default function EtapesSimulation({
  onglet,
  maj,
}: {
  onglet: "infos" | "colisage";
  maj: EtatMiseAJour;
}) {
  const statutMaj: Statut = maj.enCours ? "actif" : maj.erreur ? "alerte" : maj.derniereMaj ? "fait" : "inactif";
  const [jour, heure] = maj.derniereMaj ? formaterHorodatage(maj.derniereMaj).split(" ") : ["", ""];
  const texte = maj.enCours
    ? { couleur: "var(--accent)", contenu: "Mise à jour du picking en cours…" }
    : maj.erreur
      ? { couleur: "var(--warn-text)", contenu: `Mise à jour impossible : ${maj.erreur}` }
      : maj.attenteMain
        ? { couleur: "var(--text-muted)", contenu: "Mise à jour automatique en attente : un autre poste a la main sur cette affaire." }
        : maj.derniereMaj
          ? { couleur: "var(--text-muted)", contenu: `Mise à jour faite le ${jour} à ${heure}.` }
          : null;

  return (
    <div style={{ marginBottom: 12 }}>
      <ol style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", listStyle: "none", margin: 0, padding: 0 }}>
        <Etape numero={1} libelle="Picking" statut={onglet === "infos" ? "actif" : "fait"} />
        <Separateur />
        <Etape numero={2} libelle="Mise à jour" statut={statutMaj} />
        <Separateur />
        <Etape numero={3} libelle="Colisage en cours" statut={onglet === "colisage" ? "actif" : "inactif"} />
      </ol>
      {texte && <div style={{ fontSize: 12, color: texte.couleur, marginTop: 6 }}>{texte.contenu}</div>}
    </div>
  );
}
