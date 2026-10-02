import { useEffect, useMemo, useState } from "react";
import { caisseStockApi } from "../data/caisseStock";
import { demandesApi } from "../data/demandes";
import { demandeCaisseApi } from "../data/demandeCaisse";
import { calculerStatistiques, periodeDepuisMois, type Periode } from "../domain/statistiques";
import type { CaisseStock, Demande, DemandeCaisse } from "../domain/types";

// Admin › Caisses › Statistiques : quelles caisses sont le plus utilisées (sur mesure et de
// stock), en quantités livrées, sur une période de date de picking (décisions du 2026-10-02).
// Calcul dans domain/statistiques.ts. Une seule série (quantités) → une seule couleur, pas de
// légende ; chaque barre a une infobulle et le chiffre exact est écrit à côté.

type ChoixPeriode = "3m" | "12m" | "tout" | "libre";

const NB_LIGNES_INITIAL = 10;

export default function StatistiquesCaisses() {
  const [donnees, setDonnees] = useState<{ demandes: Demande[]; demandeCaisses: DemandeCaisse[]; caissesStock: CaisseStock[] } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [choix, setChoix] = useState<ChoixPeriode>("12m");
  const [libre, setLibre] = useState<Periode>({ du: null, au: null });
  const [tousFormats, setTousFormats] = useState(false);
  const [toutesStock, setToutesStock] = useState(false);

  useEffect(() => {
    Promise.all([demandesApi.list(), demandeCaisseApi.listAll(), caisseStockApi.list()])
      .then(([demandes, demandeCaisses, caissesStock]) => setDonnees({ demandes, demandeCaisses, caissesStock }))
      .catch((e) => setErreur(String(e)));
  }, []);

  const periode: Periode =
    choix === "3m" ? periodeDepuisMois(3) : choix === "12m" ? periodeDepuisMois(12) : choix === "libre" ? libre : { du: null, au: null };

  const stats = useMemo(
    () => (donnees ? calculerStatistiques(donnees.demandes, donnees.demandeCaisses, donnees.caissesStock, periode) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [donnees, periode.du, periode.au],
  );

  if (erreur) return <p style={{ color: "var(--danger-text)" }}>{erreur}</p>;
  if (!stats) return <p style={{ color: "var(--text-muted)" }}>Chargement…</p>;

  const pct = (n: number) => (stats.total > 0 ? `${Math.round((n / stats.total) * 100)} %` : "—");
  const formats = tousFormats ? stats.formats : stats.formats.slice(0, NB_LIGNES_INITIAL);
  // Classement limité aux AR_CAISS_ (demande du 2026-10-02) : une caisse de récup est unique,
  // son classement n'apporte rien. Elles restent comptées dans la tuile « Caisses de stock ».
  const arCaiss = stats.caissesStock.filter((c) => c.estArCaiss);
  const caissesStock = toutesStock ? arCaiss : arCaiss.slice(0, NB_LIGNES_INITIAL);

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 980 }}>
      {/* Période (date de picking) */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "var(--text-muted)", marginRight: 4 }}>Date de picking :</span>
        <div className="segmented">
          {(
            [
              ["3m", "3 derniers mois"],
              ["12m", "12 derniers mois"],
              ["tout", "Tout"],
              ["libre", "Personnalisée"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} className={choix === id ? "actif" : undefined} onClick={() => setChoix(id)}>
              {label}
            </button>
          ))}
        </div>
        {choix === "libre" && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
            du
            <input className="input" type="date" value={libre.du ?? ""} onChange={(e) => setLibre({ ...libre, du: e.target.value || null })} />
            au
            <input className="input" type="date" value={libre.au ?? ""} onChange={(e) => setLibre({ ...libre, au: e.target.value || null })} />
          </span>
        )}
      </div>

      {/* Chiffres clés */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <Tuile titre="Caisses livrées" valeur={stats.total} detail="quantités, hors ACHSTOCK" />
        <Tuile titre="Sur mesure" valeur={stats.surMesure} detail={`${pct(stats.surMesure)} du total`} />
        <Tuile titre="Caisses de stock" valeur={stats.stock} detail={`${pct(stats.stock)} du total, récup comprises`} />
      </div>

      {stats.total === 0 ? (
        <div className="panel" style={{ padding: 24, color: "var(--text-muted)", textAlign: "center" }}>
          Aucune caisse livrée sur cette période.
        </div>
      ) : (
        <>
          <Bloc titre="Sur mesure par type d'envoi">
            <Classement
              lignes={stats.surMesureParType.map((t) => ({ cle: t.typeEnvoi, libelle: t.typeEnvoi, quantite: t.quantite }))}
            />
          </Bloc>

          <Bloc
            titre="Formats sur mesure les plus utilisés"
            note={
              stats.surMesureSansDimensions > 0
                ? `${stats.surMesureSansDimensions} caisse(s) sur mesure sans dimensions ne sont pas classées.`
                : undefined
            }
          >
            {stats.formats.length === 0 ? (
              <Vide />
            ) : (
              <Classement
                lignes={formats.map((f) => ({
                  cle: f.cle,
                  libelle: `${(f.longueurMm / 1000).toFixed(2)} × ${(f.largeurMm / 1000).toFixed(2)} × ${(f.hauteurMm / 1000).toFixed(2)} m`,
                  mono: true,
                  etiquette: f.typeEnvoi,
                  quantite: f.quantite,
                  lignes: f.lignes,
                }))}
                max={stats.formats[0]?.quantite}
              />
            )}
            {stats.formats.length > NB_LIGNES_INITIAL && (
              <BoutonPlus tout={tousFormats} total={stats.formats.length} onClick={() => setTousFormats((v) => !v)} />
            )}
          </Bloc>

          <Bloc titre="Caisses de stock les plus utilisées">
            {arCaiss.length === 0 ? (
              <Vide />
            ) : (
              <Classement
                lignes={caissesStock.map((c) => ({
                  cle: c.nom,
                  libelle: c.nom,
                  quantite: c.quantite,
                  lignes: c.lignes,
                }))}
                max={arCaiss[0]?.quantite}
              />
            )}
            {arCaiss.length > NB_LIGNES_INITIAL && (
              <BoutonPlus tout={toutesStock} total={arCaiss.length} onClick={() => setToutesStock((v) => !v)} />
            )}
          </Bloc>
        </>
      )}

      {stats.sansDate > 0 && (
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
          {stats.sansDate} ligne(s) livrée(s) sans date de picking ne sont pas comptées sur une période (elles le sont avec « Tout »).
        </p>
      )}
    </div>
  );
}

function Tuile({ titre, valeur, detail }: { titre: string; valeur: number; detail: string }) {
  return (
    <div className="panel" style={{ padding: "16px 20px" }}>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", fontWeight: 600 }}>{titre}</div>
      <div className="mono" style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 2, color: "var(--accent)" }}>{valeur}</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{detail}</div>
    </div>
  );
}

function Bloc({ titre, note, children }: { titre: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="panel" style={{ padding: "18px 20px" }}>
      <h3 style={{ fontSize: 14.5, fontWeight: 700, margin: "0 0 14px" }}>{titre}</h3>
      {children}
      {note && <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "10px 0 0" }}>{note}</p>}
    </section>
  );
}

interface LigneClassement {
  cle: string;
  libelle: string;
  mono?: boolean;
  etiquette?: string;
  quantite: number;
  lignes?: number;
}

// Classement horizontal : libellé, barre proportionnelle (une seule couleur), quantité écrite.
function Classement({ lignes, max }: { lignes: LigneClassement[]; max?: number }) {
  const plusGrand = Math.max(1, max ?? Math.max(0, ...lignes.map((l) => l.quantite)));
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {lignes.map((l) => (
        <div
          key={l.cle}
          className="ligne-classement"
          title={`${l.libelle}${l.etiquette ? ` (${l.etiquette})` : ""} : ${l.quantite} caisse(s)${l.lignes !== undefined ? ` sur ${l.lignes} ligne(s)` : ""}`}
          style={{ display: "grid", gridTemplateColumns: "minmax(170px, 260px) 64px 1fr 48px", alignItems: "center", gap: 10, padding: "3px 4px", borderRadius: 6 }}
        >
          <span className={l.mono ? "mono" : undefined} style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {l.libelle}
          </span>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{l.etiquette ?? ""}</span>
          <div style={{ height: 10, background: "rgba(32, 30, 26, 0.06)", borderRadius: 999, overflow: "hidden" }}>
            <div
              style={{
                width: `${(l.quantite / plusGrand) * 100}%`,
                minWidth: l.quantite > 0 ? 3 : 0,
                height: "100%",
                background: "var(--accent)",
                borderRadius: 999,
              }}
            />
          </div>
          <span className="mono" style={{ fontSize: 13, fontWeight: 600, textAlign: "right" }}>
            {l.quantite}
          </span>
        </div>
      ))}
    </div>
  );
}

function BoutonPlus({ tout, total, onClick }: { tout: boolean; total: number; onClick: () => void }) {
  return (
    <button className="btn btn-sm" onClick={onClick} style={{ marginTop: 10 }}>
      {tout ? "Afficher moins" : `Afficher tout (${total})`}
    </button>
  );
}

function Vide() {
  return <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Aucune sur cette période.</p>;
}
