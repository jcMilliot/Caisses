import { couleurTaux, type TauxCaisse } from "../domain/remplissage";
import { largeurTexte } from "./mesureTexte";

// Taux de remplissage d'une ou plusieurs caisses de Simulations.
//  - texte (liste des affaires) : « 72% » ou « Caisse 1 : 72% / Caisse 2 : 40% », coloré selon le
//    seuil d'alerte ;
//  - `pastille` (colonne de Gestion des caisses, 2026-10-02) : encadré comme la pastille du seuil
//    d'une affaire dans Simulations — violet pastel, orange dès le seuil atteint, rouge au-delà
//    de 100 %. Avec `largeurDispo` (largeur utile de la cellule), la pastille passe en taille
//    réduite quand elle ne tient plus, puis autorise le retour à la ligne (2026-10-05).
export default function TauxRemplissage({
  caisses,
  seuil,
  pastille,
  largeurDispo,
}: {
  caisses: TauxCaisse[];
  seuil: number;
  pastille?: boolean;
  largeurDispo?: number;
}) {
  if (caisses.length === 0) return null;
  const pct = (t: number) => `${(t * 100).toFixed(0)}%`;
  const titre = "Volume des articles rangés dans la caisse / volume interne de la caisse (Simulations)";

  if (pastille) {
    const niveauDe = (c: TauxCaisse) => (c.taux > 1 ? "danger" : c.taux * 100 >= seuil ? "warn" : "violet");
    const texteDe = (c: TauxCaisse) =>
      `${niveauDe(c) !== "violet" ? "⚠ " : ""}${caisses.length > 1 ? `${c.nom} : ` : ""}${pct(c.taux)}`;
    const plusLarge = (taille: number, padding: number) =>
      Math.max(...caisses.map((c) => largeurTexte(texteDe(c), taille, 600))) + 2 * padding + 2;
    const reduite = largeurDispo !== undefined && plusLarge(14.5, 12) > largeurDispo;
    const aLaLigne = reduite && plusLarge(12, 7) > largeurDispo!;
    return (
      <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 4 }} title={titre}>
        {caisses.map((c, i) => {
          // Violet sous le seuil, orange à partir du seuil, rouge au-delà de 100 % (⚠ dans les
          // deux derniers cas) — retour utilisateur du 2026-10-02.
          const niveau = niveauDe(c);
          return (
          <span
            key={i}
            title={
              niveau === "danger"
                ? "Volume des articles supérieur au volume de la caisse"
                : niveau === "warn"
                  ? `Seuil d'alerte (${seuil} %) atteint`
                  : undefined
            }
            style={{
              fontSize: reduite ? 12 : 14.5,
              fontWeight: 600,
              color: `var(--${niveau}-text)`,
              background: `var(--${niveau}-bg)`,
              border: `1px solid var(--${niveau}-border)`,
              padding: reduite ? "2px 7px" : "3px 12px",
              borderRadius: aLaLigne ? 10 : 999,
              whiteSpace: aLaLigne ? "normal" : "nowrap",
              wordBreak: "keep-all",
              maxWidth: largeurDispo,
            }}
          >
            {niveau !== "violet" && "⚠ "}
            {caisses.length > 1 && <span style={{ fontWeight: 500 }}>{c.nom} : </span>}
            {pct(c.taux)}
          </span>
          );
        })}
      </span>
    );
  }

  return (
    <span title={titre}>
      {caisses.length === 1 ? (
        <span style={{ color: couleurTaux(caisses[0].taux, seuil), fontWeight: 600 }}>{pct(caisses[0].taux)}</span>
      ) : (
        caisses.map((c, i) => (
          <span key={i}>
            {i > 0 && " / "}
            {c.nom} : <span style={{ color: couleurTaux(c.taux, seuil), fontWeight: 600 }}>{pct(c.taux)}</span>
          </span>
        ))
      )}
    </span>
  );
}
