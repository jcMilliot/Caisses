import { useState } from "react";
import type { CartonConso } from "../domain/types";
import { cleCarton, controlerColis, estCartonLibre, lettreCaisse, libelleCaisseColisage, type GroupeRange } from "../domain/colisage";
import { cm, mmDepuisCm, texteCm } from "../domain/cartonConso";
import { formaterVolumeM3, volumeUnitaireM3 } from "../domain/calculs";
import type { Colisage } from "../hooks/useColisage";
import PastilleColis from "./PastilleColis";

interface Props {
  colisage: Colisage;
  readOnly: boolean;
}

function libelleCarton(c: CartonConso): string {
  return `${c.nom} — ext. ${cm(c.ext_longueur_mm)} × ${cm(c.ext_largeur_mm)} × ${cm(c.ext_hauteur_mm)} cm`;
}

// Onglet Colisage d'une affaire de Simulations (2026-10-14) : articles colisés regroupés par
// `pack_tag` — lettres (pièces directement en caisse) puis colis numérotés, repliés par défaut.
// Un colis reçoit un carton de Consommable › Cartons conso ; alerte si le volume des pièces
// dépasse le volume extérieur du carton, ou si une pièce ne rentre pas dans le carton (intérieur,
// toutes orientations). Chaque colis / lettre se range dans une caisse colisage (lettre : caisse
// de même rang proposée). Récapitulatif en tête : total colisage vs Informations générales.
export default function ColisageVue({ colisage, readOnly }: Props) {
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());

  function basculer(tag: string) {
    setOuverts((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  if (colisage.groupes.length === 0) {
    return <p style={{ color: "var(--text-muted)", padding: "20px 0" }}>Aucun article colisé.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 12 }}>
      <RecapColisage colisage={colisage} />
      {colisage.erreur && <p style={{ margin: 0, fontSize: 13, color: "var(--danger-text)" }}>{colisage.erreur}</p>}
      {colisage.groupes.map((g) => (
        <BlocColis
          key={g.tag}
          groupe={g}
          ouvert={ouverts.has(g.tag)}
          onBasculer={() => basculer(g.tag)}
          colisage={colisage}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}

// Comparatif de l'affaire : volume des cartons + pièces en lettres vs volume des articles des
// Informations générales, et poids.
function RecapColisage({ colisage }: { colisage: Colisage }) {
  const t = colisage.totaux;
  const ecart = t.volumeColisageM3 - t.volumeInfosM3;
  const ecartPct = t.volumeInfosM3 > 0 ? Math.round((ecart / t.volumeInfosM3) * 100) : null;
  const remarques = [
    t.nbArticlesNonColises > 0 && `${t.nbArticlesNonColises} article(s) non colisé(s), comptés seulement dans le picking`,
    t.nbColisSansCarton > 0 && `${t.nbColisSansCarton} colis sans carton (volume des pièces compté)`,
    t.nbNonRanges > 0 && `${t.nbNonRanges} colis / lettre(s) non rangé(s) dans une caisse`,
  ].filter((r): r is string => Boolean(r));
  return (
    <div className="panel" style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 24px", fontSize: 13 }}>
        <span>
          Picking : <span className="mono" style={{ fontWeight: 700 }}>{formaterVolumeM3(t.volumeInfosM3)} m³</span>
          <span className="mono" style={{ color: "var(--text-muted)" }}> · {t.poidsInfosKg.toFixed(3)} kg</span>
        </span>
        <span>
          Colisage en cours : <span className="mono" style={{ fontWeight: 700 }}>{formaterVolumeM3(t.volumeColisageM3)} m³</span>
          <span className="mono" style={{ color: "var(--text-muted)" }}> · {t.poidsColisageKg.toFixed(3)} kg</span>
        </span>
        <span>
          Écart :{" "}
          <span className="mono" style={{ fontWeight: 700, color: ecart > 0 ? "var(--warn-text)" : "var(--ok-text)" }}>
            {ecart >= 0 ? "+" : "−"}
            {formaterVolumeM3(Math.abs(ecart))} m³{ecartPct !== null && ` (${ecart >= 0 ? "+" : ""}${ecartPct}%)`}
          </span>
        </span>
      </div>
      {remarques.length > 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{remarques.join(" · ")}</div>}
    </div>
  );
}

function BlocColis({
  groupe,
  ouvert,
  onBasculer,
  colisage,
  readOnly,
}: {
  groupe: GroupeRange;
  ouvert: boolean;
  onBasculer: () => void;
  colisage: Colisage;
  readOnly: boolean;
}) {
  const carton = groupe.carton;
  const controle = carton ? controlerColis(groupe, carton, colisage.acceptees, colisage.accepteesVolume) : null;
  const enAlerte =
    controle !== null && (controle.depasseVolume || controle.piecesTropGrandes.length > 0 || controle.lignesTropVolumineuses.length > 0);
  const taux = controle && controle.volumeCartonM3 > 0 ? Math.round((groupe.volumePiecesM3 / controle.volumeCartonM3) * 100) : null;
  const caisse = colisage.caisses.find((c) => c.caisse.id === groupe.caisseId)?.caisse;
  const libre = carton !== undefined && estCartonLibre(carton);
  // Saisie d'un carton libre en cours (choisi dans le menu, ou « Modifier » sur le carton libre).
  const [saisieLibre, setSaisieLibre] = useState(false);

  return (
    <div className="panel" style={{ padding: 0, border: enAlerte ? "1px solid var(--danger-border)" : undefined, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          padding: "10px 14px",
          background: enAlerte ? "var(--danger-bg)" : undefined,
          borderLeft: caisse ? `6px solid ${caisse.couleur}` : undefined,
        }}
      >
        <button
          onClick={onBasculer}
          title={ouvert ? "Replier" : "Déplier"}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, padding: "0 4px", color: "var(--text-muted)" }}
        >
          {ouvert ? "▾" : "▸"}
        </button>
        <PastilleColis tag={groupe.tag} />
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {groupe.estColis ? "Colis" : "Lettre"} · {groupe.articles.length} article(s)
        </span>
        <span style={{ fontSize: 13 }}>
          Volume des pièces : <span className="mono" style={{ fontWeight: 600 }}>{formaterVolumeM3(groupe.volumePiecesM3)} m³</span>
        </span>
        <span style={{ fontSize: 13 }}>
          Poids : <span className="mono" style={{ fontWeight: 600 }}>{groupe.poidsPiecesKg.toFixed(3)} kg</span>
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto", flexWrap: "wrap" }}>
          {groupe.estColis && (
            <>
              <select
                value={saisieLibre || libre ? "libre" : (carton?.id ?? "")}
                disabled={readOnly}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "libre") {
                    setSaisieLibre(true);
                    return;
                  }
                  setSaisieLibre(false);
                  colisage.choisirCarton(groupe.tag, v === "" ? null : Number(v));
                }}
                style={{ font: "inherit", fontSize: 13, maxWidth: 340, background: carton || saisieLibre ? undefined : "var(--warn-bg)" }}
                title="Carton du colis : carton conso (Consommable › Cartons conso) ou carton libre (récup)"
              >
                <option value="">— Choisir un carton —</option>
                <option value="libre">Carton libre (récup)…</option>
                {colisage.cartons.map((c) => (
                  <option key={c.id} value={c.id}>
                    {libelleCarton(c)}
                  </option>
                ))}
              </select>
              {libre && !saisieLibre && (
                <span style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span className="mono" title="Dimensions extérieures (intérieur : 2 mm de moins par axe)">
                    {cm(carton!.ext_longueur_mm)} × {cm(carton!.ext_largeur_mm)} × {cm(carton!.ext_hauteur_mm)} cm
                    {carton!.poids_kg > 0 && ` · ${carton!.poids_kg} kg`}
                  </span>
                  {!readOnly && (
                    <button className="btn btn-sm" onClick={() => setSaisieLibre(true)}>
                      Modifier
                    </button>
                  )}
                </span>
              )}
              {controle && (
                <span style={{ fontSize: 13 }}>
                  Carton : <span className="mono" style={{ fontWeight: 600 }}>{formaterVolumeM3(controle.volumeCartonM3)} m³</span>
                  {taux !== null && (
                    <span
                      className="mono"
                      style={{ marginLeft: 6, fontWeight: 700, color: controle.depasseVolume ? "var(--danger-text)" : "var(--ok-text)" }}
                    >
                      ({taux}%)
                    </span>
                  )}
                </span>
              )}
            </>
          )}
          <ChoixCaisse groupe={groupe} colisage={colisage} readOnly={readOnly} />
        </div>
      </div>

      {saisieLibre && (
        <FormulaireCartonLibre
          initial={libre ? carton! : undefined}
          onValider={async (dims, poids) => {
            await colisage.choisirCartonLibre(groupe.tag, dims, poids);
            setSaisieLibre(false);
          }}
          onAnnuler={() => setSaisieLibre(false)}
        />
      )}

      {controle && enAlerte && (
        <div
          style={{
            padding: "8px 14px 10px 50px",
            fontSize: 13,
            color: "var(--danger-text)",
            background: "var(--danger-bg)",
            borderTop: "1px solid var(--border)",
          }}
        >
          {controle.depasseVolume && (
            <div>
              ⚠ Le volume des pièces ({formaterVolumeM3(groupe.volumePiecesM3)} m³) dépasse celui du carton (
              {formaterVolumeM3(controle.volumeCartonM3)} m³).
            </div>
          )}
          {controle.lignesTropVolumineuses.map((a) => (
            <div key={`v${a.id}`} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
              <span>
                ⚠ {a.ar || a.reference} ({a.dim1_mm} × {a.dim2_mm} × {a.dim3_mm} mm × {a.quantite}) :{" "}
                {formaterVolumeM3(volumeUnitaireM3(a) * a.quantite)} m³ à elle seule, plus que le carton — dimensions à vérifier
                dans l'intranet (celles de la boîte ?).
              </span>
              {!readOnly && (
                <button
                  className="btn btn-sm btn-pastel-green"
                  style={{ padding: "1px 8px" }}
                  title="Ne plus signaler la ligne pour ce carton. Son volume compte toujours dans le colis."
                  onClick={() => colisage.accepterPiece(a.id, "volume", cleCarton(carton!))}
                >
                  Accepter
                </button>
              )}
            </div>
          ))}
          {controle.piecesTropGrandes.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
              <span>
                ⚠ {a.ar || a.reference} ({a.dim1_mm} × {a.dim2_mm} × {a.dim3_mm} mm) ne rentre pas dans le carton (intérieur{" "}
                {carton!.longueur_mm} × {carton!.largeur_mm} × {carton!.hauteur_mm} mm).
              </span>
              {!readOnly && (
                <button
                  className="btn btn-sm btn-pastel-green"
                  style={{ padding: "1px 8px" }}
                  title="La pièce passe autrement (en diagonale) : ne plus signaler pour ce carton"
                  onClick={() => colisage.accepterPiece(a.id, "dimensions", cleCarton(carton!))}
                >
                  Accepter
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {controle && (controle.piecesAcceptees.length > 0 || controle.lignesVolumeAcceptees.length > 0) && (
        <div style={{ padding: "6px 14px 8px 50px", fontSize: 12.5, color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}>
          {controle.piecesAcceptees.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>
                ✓ {a.ar || a.reference} ({a.dim1_mm} × {a.dim2_mm} × {a.dim3_mm} mm) : dépasse sur les 3 axes, accepté (en diagonale).
              </span>
              {!readOnly && (
                <button className="btn btn-sm" style={{ padding: "1px 8px" }} onClick={() => colisage.accepterPiece(a.id, "dimensions", null)}>
                  Annuler
                </button>
              )}
            </div>
          ))}
          {controle.lignesVolumeAcceptees.map((a) => (
            <div key={`v${a.id}`} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>
                ✓ {a.ar || a.reference} ({a.dim1_mm} × {a.dim2_mm} × {a.dim3_mm} mm × {a.quantite}) : plus volumineuse que le carton,
                acceptée.
              </span>
              {!readOnly && (
                <button className="btn btn-sm" style={{ padding: "1px 8px" }} onClick={() => colisage.accepterPiece(a.id, "volume", null)}>
                  Annuler
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {ouvert && (
        <div style={{ overflowX: "auto", borderTop: "1px solid var(--border)" }}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>AR</th>
                <th style={thStyle}>Réf. fourn.</th>
                <th style={thStyle}>Désignation</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Dim1 (mm)</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Dim2 (mm)</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Dim3 (mm)</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Poids u. (kg)</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Qté</th>
              </tr>
            </thead>
            <tbody>
              {groupe.articles.map((a) => {
                const tropGrande = controle?.piecesTropGrandes.includes(a) ?? false;
                const acceptee = controle?.piecesAcceptees.includes(a) ?? false;
                const tropVolumineuse = controle?.lignesTropVolumineuses.includes(a) ?? false;
                const volumeAcceptee = controle?.lignesVolumeAcceptees.includes(a) ?? false;
                return (
                  <tr
                    key={a.id}
                    style={{
                      background: tropGrande || tropVolumineuse ? "var(--danger-bg)" : acceptee || volumeAcceptee ? "var(--warn-bg)" : undefined,
                    }}
                    title={
                      tropVolumineuse
                        ? "Volume de la ligne plus grand que le carton à lui seul : dimensions à vérifier dans l'intranet"
                        : acceptee
                          ? "Dépasse sur les 3 axes, accepté (en diagonale)"
                          : volumeAcceptee
                            ? "Plus volumineuse que le carton, acceptée"
                            : undefined
                    }
                  >
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      {a.ar}
                      {a.qte_initiale !== null && a.qte_initiale !== a.quantite && (
                        <div style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}>Qté initiale : {a.qte_initiale}</div>
                      )}
                    </td>
                    <td style={tdStyle}>{a.reference}</td>
                    <td style={tdStyle}>{a.designation}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }} className="mono">{a.dim1_mm}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }} className="mono">{a.dim2_mm}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }} className="mono">{a.dim3_mm}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }} className="mono">{a.poids_unitaire_kg.toFixed(3)}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }} className="mono">{a.quantite}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Carton libre (récup, 2026-10-15) : dimensions extérieures en cm (obligatoires), poids facultatif.
// L'intérieur est compté 2 mm plus petit sur chaque axe.
function FormulaireCartonLibre({
  initial,
  onValider,
  onAnnuler,
}: {
  initial: CartonConso | undefined;
  onValider: (dims: [number, number, number], poidsKg: number) => Promise<void>;
  onAnnuler: () => void;
}) {
  const [dims, setDims] = useState(
    initial ? [texteCm(initial.ext_longueur_mm), texteCm(initial.ext_largeur_mm), texteCm(initial.ext_hauteur_mm)] : ["", "", ""],
  );
  const [poids, setPoids] = useState(initial && initial.poids_kg > 0 ? String(initial.poids_kg) : "");
  const mm = dims.map(mmDepuisCm) as [number, number, number];
  const complet = mm.every((d) => d > 0);
  const valider = () => {
    if (complet) onValider(mm, Math.max(0, Number(poids.replace(",", ".")) || 0));
  };

  return (
    <div
      style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, padding: "8px 14px 10px 50px", borderTop: "1px solid var(--border)", fontSize: 13 }}
      onKeyDown={(e) => {
        if (e.key === "Enter") valider();
        if (e.key === "Escape") onAnnuler();
      }}
    >
      <span style={{ fontWeight: 600 }}>Carton libre — dimensions extérieures :</span>
      {["L", "l", "H"].map((libelle, i) => (
        <input
          key={libelle}
          autoFocus={i === 0}
          value={dims[i]}
          inputMode="decimal"
          onChange={(e) => setDims((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
          onFocus={(e) => e.target.select()}
          placeholder={`${libelle} (cm)`}
          style={{ font: "inherit", width: 70, background: mm[i] > 0 ? undefined : "var(--warn-bg)" }}
        />
      ))}
      <input
        value={poids}
        inputMode="decimal"
        onChange={(e) => setPoids(e.target.value)}
        placeholder="Poids (kg)"
        title="Poids du carton vide (kg), facultatif"
        style={{ font: "inherit", width: 90 }}
      />
      <button className="btn btn-sm btn-primary" disabled={!complet} onClick={valider}>
        OK
      </button>
      <button className="btn btn-sm" onClick={onAnnuler}>
        Annuler
      </button>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Intérieur compté 2 mm plus petit sur chaque axe.</span>
    </div>
  );
}

const MOTIF_CAISSE_IMPOSEE = {
  lettre: "Caisse imposée par la lettre (A → 1re caisse colisage, B → 2e…)",
  intranet: "Caisse donnée par l'intranet (liste de colisage de l'affaire)",
  seule: "Seule caisse colisage de l'affaire : le colis y est rangé d'office",
} as const;

// Caisse colisage du colis / de la lettre, affichée sans choix quand elle est imposée : lettre
// (caisse de même rang, 2026-10-15), colis rangé dans l'intranet ou affaire à une seule caisse
// (2026-10-28). Sinon colis choisi à la main, non rangé par défaut.
function ChoixCaisse({ groupe, colisage, readOnly }: { groupe: GroupeRange; colisage: Colisage; readOnly: boolean }) {
  if (groupe.imposee) {
    const caisse = colisage.caisses.find((c) => c.caisse.id === groupe.caisseId)?.caisse;
    const rang = caisse ? colisage.caisses.findIndex((c) => c.caisse.id === caisse.id) : -1;
    return (
      <span style={{ fontSize: 13 }} title={MOTIF_CAISSE_IMPOSEE[groupe.imposee]}>
        Caisse :{" "}
        {caisse ? (
          // Lettre seule : le nom est toujours celui de l'affaire (retour du 2026-10-16).
          <span style={{ fontWeight: 700 }} title={caisse.nom}>
            {lettreCaisse(rang)}
          </span>
        ) : (
          <span style={{ color: "var(--warn-text)", fontWeight: 600 }}>
            pas de caisse {groupe.lettreImposee} (à créer dans le panneau Caisses)
          </span>
        )}
        {groupe.imposee === "intranet" && <span style={{ fontSize: 11, color: "var(--text-muted)" }}> (intranet)</span>}
      </span>
    );
  }

  const choisi = colisage.rangementsChoisis.has(groupe.tag) && groupe.caisseId !== null;

  function changer(v: string) {
    if (v === "aucune") colisage.ranger(groupe.tag, true, null);
    else colisage.ranger(groupe.tag, false, Number(v));
  }

  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
      Caisse :
      <select
        value={choisi ? String(groupe.caisseId) : "aucune"}
        disabled={readOnly || colisage.caisses.length === 0}
        onChange={(e) => changer(e.target.value)}
        title={colisage.caisses.length === 0 ? "Créez d'abord les caisses colisage (panneau Caisses)" : "Caisse colisage du colis"}
        style={{ font: "inherit", fontSize: 13, maxWidth: 240, background: groupe.caisseId === null ? "var(--warn-bg)" : undefined }}
      >
        <option value="aucune">— Non rangé —</option>
        {colisage.caisses.map(({ caisse }, rangCaisse) => (
          <option key={caisse.id} value={caisse.id}>
            {libelleCaisseColisage(rangCaisse, caisse.nom)}
          </option>
        ))}
      </select>
    </label>
  );
}

const thStyle: React.CSSProperties = {
  padding: "8px 8px",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-muted)",
  textAlign: "left",
  background: "var(--bg-panel-alt)",
  borderBottom: "1px solid var(--border-strong)",
};
const tdStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid var(--row-border-color)",
};
