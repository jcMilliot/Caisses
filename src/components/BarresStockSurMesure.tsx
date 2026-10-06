import { useState } from "react";
import { anneesAvecLivraisons, groupesMoisDeLAnnee, groupesParAnnee, type GroupeBarres, type UsageMois } from "../domain/statistiques";

// Admin › Caisses › Statistiques : comparatif caisses de stock / sur mesure en barres verticales
// groupées (demandes des 2026-10-05 / 2026-10-06). Indépendant de la période du haut : onglets
// par année (détail des 12 mois) + « Tout » (une barre par année). Deux séries → légende + une
// couleur chacune (bleu / orange, palette validée : écart daltonisme ΔE 24,7), infobulle au
// survol.

const SERIES = [
  { cle: "stock", libelle: "Caisses de stock", couleur: "#2a78d6" },
  { cle: "surMesure", libelle: "Sur mesure", couleur: "#eb6834" },
] as const;

const HAUTEUR = 190;
const TOUT = "tout";

// Pas « rond » (1, 2, 5 × 10ⁿ) pour 4 graduations environ.
function pasGraduation(max: number): number {
  const brut = Math.max(1, max / 4);
  const p = 10 ** Math.floor(Math.log10(brut));
  return [1, 2, 5, 10].map((k) => k * p).find((s) => s >= brut)!;
}

export default function BarresStockSurMesure({ parMois }: { parMois: UsageMois[] }) {
  const annees = anneesAvecLivraisons(parMois);
  const anneeCourante = String(new Date().getFullYear());
  const [onglet, setOnglet] = useState(() => (annees.includes(anneeCourante) ? anneeCourante : (annees[annees.length - 1] ?? TOUT)));

  if (annees.length === 0) {
    return <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Aucune caisse livrée avec une date de picking.</p>;
  }

  const groupes = onglet === TOUT ? groupesParAnnee(parMois) : groupesMoisDeLAnnee(parMois, onglet);
  const totalStock = groupes.reduce((t, g) => t + g.stock, 0);
  const totalSurMesure = groupes.reduce((t, g) => t + g.surMesure, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div className="segmented">
          {[...annees, TOUT].map((a) => (
            <button key={a} className={onglet === a ? "actif" : undefined} onClick={() => setOnglet(a)}>
              {a === TOUT ? "Tout" : a}
            </button>
          ))}
        </div>
        {/* Légende, avec le total de l'onglet affiché */}
        <div style={{ display: "flex", gap: 18, fontSize: 12.5, color: "var(--text)" }}>
          {SERIES.map((s) => (
            <span key={s.cle} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: s.couleur }} />
              {s.libelle}
              <span className="mono" style={{ fontWeight: 600 }}>{s.cle === "stock" ? totalStock : totalSurMesure}</span>
            </span>
          ))}
        </div>
      </div>
      <Graphique groupes={groupes} />
    </div>
  );
}

function Graphique({ groupes }: { groupes: GroupeBarres[] }) {
  const [survol, setSurvol] = useState<string | null>(null);
  const max = Math.max(1, ...groupes.flatMap((g) => [g.stock, g.surMesure]));
  const pas = pasGraduation(max);
  const haut = Math.ceil(max / pas) * pas;
  const graduations = Array.from({ length: haut / pas + 1 }, (_, i) => i * pas);

  return (
    <div style={{ display: "flex", gap: 6 }}>
      {/* Axe des quantités */}
      <div style={{ position: "relative", width: 28, height: HAUTEUR, flexShrink: 0 }}>
        {graduations.map((g) => (
          <span
            key={g}
            className="mono"
            style={{ position: "absolute", right: 0, bottom: (g / haut) * HAUTEUR - 7, fontSize: 11, color: "var(--text-muted)" }}
          >
            {g}
          </span>
        ))}
      </div>

      <div style={{ flex: 1, position: "relative" }}>
        {/* Grille discrète */}
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: HAUTEUR, pointerEvents: "none" }}>
          {graduations.map((g) => (
            <div
              key={g}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: (g / haut) * HAUTEUR,
                borderTop: g === 0 ? "1px solid var(--border-strong)" : "1px solid var(--border)",
              }}
            />
          ))}
        </div>

        <div style={{ display: "flex", height: HAUTEUR, position: "relative" }}>
          {groupes.map((g, i) => {
            const actif = survol === g.cle;
            // Infobulle calée sur le bord pour le premier / dernier groupe.
            const placement: React.CSSProperties =
              i === 0 ? { left: 0 } : i === groupes.length - 1 ? { right: 0 } : { left: "50%", transform: "translateX(-50%)" };
            return (
              <div
                key={g.cle}
                onMouseEnter={() => setSurvol(g.cle)}
                onMouseLeave={() => setSurvol(null)}
                aria-label={`${g.long} : ${g.stock} de stock, ${g.surMesure} sur mesure`}
                style={{
                  flex: "1 1 0",
                  position: "relative",
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "center",
                  gap: 2,
                  background: actif ? "rgba(32, 30, 26, 0.04)" : undefined,
                  borderRadius: 4,
                }}
              >
                {SERIES.map((s) => {
                  const v = g[s.cle];
                  return (
                    <div
                      key={s.cle}
                      style={{
                        width: "min(22px, 32%)",
                        height: (v / haut) * HAUTEUR,
                        minHeight: v > 0 ? 2 : 0,
                        background: s.couleur,
                        borderRadius: "4px 4px 0 0",
                      }}
                    />
                  );
                })}
                {actif && (
                  <div
                    style={{
                      position: "absolute",
                      top: 4,
                      ...placement,
                      background: "var(--bg-panel)",
                      border: "1px solid var(--border)",
                      boxShadow: "var(--shadow-lg)",
                      borderRadius: 8,
                      padding: "8px 10px",
                      fontSize: 12,
                      whiteSpace: "nowrap",
                      zIndex: 2,
                      pointerEvents: "none",
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 4, textTransform: "capitalize" }}>{g.long}</div>
                    {SERIES.map((s) => (
                      <div key={s.cle} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: s.couleur }} />
                        <span style={{ color: "var(--text-muted)" }}>{s.libelle}</span>
                        <span className="mono" style={{ marginLeft: "auto", paddingLeft: 10, fontWeight: 600 }}>
                          {g[s.cle]}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Libellés sous l'axe */}
        <div style={{ display: "flex", marginTop: 6 }}>
          {groupes.map((g) => (
            <span key={g.cle} style={{ flex: "1 1 0", textAlign: "center", fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
              {g.court}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
