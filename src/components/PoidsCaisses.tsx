import { useEffect, useState } from "react";
import { poidsCaisseApi } from "../data/poidsCaisse";
import { confirmerAction, confirmerSuppression } from "../data/confirm";
import {
  estimerPoidsCaisse,
  lireReglagesPoids,
  masseVolumiqueConseillee,
  MATIERES_ESTIMATION,
  REGLAGES_POIDS_DEFAUT,
  versCaisseAEstimer,
  type CaissePesee,
  type MatiereCaisse,
  type NewCaissePesee,
  type ReglagesPoidsCaisse,
} from "../domain/poidsCaisse";

// Estimation du poids des caisses (2026-10-08), répartie depuis le 2026-10-16 :
// - `CaissesPesees` : onglet « Poids » de Consommable — caisses réellement pesées, comparées à
//   l'estimation, avec la masse volumique conseillée (sans bouton) ; écriture avec le verrou de
//   la page, comme le reste de Consommable ;
// - `ReglagesPoidsCaisses` (défaut) : Admin › Caisses › Poids — réglages de l'estimation et
//   masse volumique conseillée avec « Utiliser cette valeur » (admins seulement).
// L'estimation sert à l'alerte de charge de Simulations (poids de la caisse compris).

function useDonneesPoids(rechargement = 0) {
  const [pesees, setPesees] = useState<CaissePesee[] | null>(null);
  const [reglages, setReglages] = useState<ReglagesPoidsCaisse>(REGLAGES_POIDS_DEFAUT);
  const [erreur, setErreur] = useState<string | null>(null);

  async function charger() {
    try {
      const [p, r] = await Promise.all([poidsCaisseApi.listPesees(), poidsCaisseApi.getReglages()]);
      setPesees(p);
      setReglages(lireReglagesPoids(r));
    } catch (e) {
      setErreur(String(e));
    }
  }
  useEffect(() => {
    charger();
  }, [rechargement]);

  async function action(f: () => Promise<void>): Promise<boolean> {
    setErreur(null);
    try {
      await f();
      await charger();
      return true;
    } catch (e) {
      setErreur(String(e));
      return false;
    }
  }

  return { pesees, reglages, erreur, action };
}

export function CaissesPesees({ trigramme, readOnly, rechargement }: { trigramme: string; readOnly: boolean; rechargement: number }) {
  const { pesees, reglages, erreur, action } = useDonneesPoids(rechargement);
  const [editionId, setEditionId] = useState<number | null>(null);
  const [filtreMatiere, setFiltreMatiere] = useState<MatiereCaisse | null>(null);

  if (!pesees) return erreur ? <p style={{ color: "var(--danger-text)" }}>{erreur}</p> : null;

  const matiereDe = (p: CaissePesee) => versCaisseAEstimer(p).matiere;
  const peseesAffichees = filtreMatiere ? pesees.filter((p) => matiereDe(p) === filtreMatiere) : pesees;

  return (
    <section style={{ minWidth: 0 }}>
      <p className="page-subtitle" style={{ margin: "0 0 16px" }}>
        Caisses réellement pesées : dimensions intérieures et poids à vide (tare, souvent inscrite sur la caisse par le fabricant,
        sans mousse ni bâche). L'écart compare la tare au poids estimé de la caisse vide.
      </p>
      {!readOnly && (
        // Saisie hors du tableau (ajout ou modification) : le tableau reste étroit (2026-10-08).
        <FormulairePesee
          key={editionId ?? `nouvelle-${pesees.length}`}
          initial={pesees.find((p) => p.id === editionId)}
          onValider={(c) =>
            editionId !== null
              ? action(() => poidsCaisseApi.updatePesee(editionId, c, trigramme)).then((ok) => ok && setEditionId(null))
              : action(() => poidsCaisseApi.createPesee(c, trigramme))
          }
          onAnnuler={editionId !== null ? () => setEditionId(null) : undefined}
        />
      )}
      {pesees.length > 0 && (
        // Filtre par matière (2026-10-20) ; pastilles aux couleurs des lignes du tableau.
        <div className="segmented" style={{ marginTop: 14 }}>
          {([null, ...MATIERES_ESTIMATION] as (MatiereCaisse | null)[]).map((m) => (
            <button key={m ?? "toutes"} className={filtreMatiere === m ? "actif" : undefined} onClick={() => setFiltreMatiere(m)}>
              {m && <PastilleMatiere matiere={m} />}
              {m ?? "Toutes"} ({m ? pesees.filter((p) => matiereDe(p) === m).length : pesees.length})
            </button>
          ))}
        </div>
      )}
      {pesees.length === 0 ? (
        <p style={{ ...aideStyle, marginTop: 14 }}>Aucune caisse pesée pour l'instant.</p>
      ) : peseesAffichees.length === 0 ? (
        <p style={{ ...aideStyle, marginTop: 10 }}>Aucune caisse pesée en {filtreMatiere?.toLowerCase()}.</p>
      ) : (
        <div className="panel" style={{ overflowX: "auto", padding: 0, marginTop: 10 }}>
          <table className="table-donnees compacte" style={{ width: "100%", fontSize: 12.5 }}>
            <thead>
              <tr>
                <th>Affaire</th>
                <th>Dimensions (m)</th>
                <th>Tare</th>
                <th>Composition</th>
                <th>Estimé à vide</th>
                <th>Écart</th>
                <th>Avec mousse + bâche</th>
                {!readOnly && <th />}
              </tr>
            </thead>
            <tbody>
              {peseesAffichees.map((p) => (
                <LignePesee
                  key={p.id}
                  caisse={p}
                  reglages={reglages}
                  enEdition={editionId === p.id}
                  readOnly={readOnly}
                  onModifier={() => setEditionId(p.id)}
                  onSupprimer={async () => {
                    if (await confirmerSuppression(`Supprimer la caisse pesée « ${p.affaire || "sans nom"} » ?`))
                      await action(() => poidsCaisseApi.deletePesee(p.id, trigramme));
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {erreur && <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--danger-text)" }}>{erreur}</p>}
      <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
        {MATIERES_ESTIMATION.filter((m) => !filtreMatiere || m === filtreMatiere).map((m) => (
          <Conseil key={m} matiere={m} pesees={pesees} reglages={reglages} />
        ))}
      </div>
    </section>
  );
}

export default function ReglagesPoidsCaisses() {
  const { pesees, reglages, erreur, action } = useDonneesPoids();

  async function enregistrerReglages(r: ReglagesPoidsCaisse) {
    await action(() => poidsCaisseApi.setReglages(JSON.stringify(r)));
  }

  if (!pesees) return erreur ? <p style={{ color: "var(--danger-text)" }}>{erreur}</p> : null;

  // Masse volumique conseillée d'après les caisses pesées, affichée sous le champ concerné
  // (retour du 2026-10-16 : le bloc en haut de page semblait là par hasard).
  const conseils: Conseils = {};
  for (const m of MATIERES_ESTIMATION) {
    const c = masseVolumiqueConseillee(pesees, m, reglages);
    if (c) conseils[cleMasse(m)] = { valeur: Math.round(c.valeur), nbCaisses: c.nbCaisses };
  }

  return (
    <div style={{ minWidth: 0 }}>
      <Reglages reglages={reglages} conseils={conseils} onEnregistrer={enregistrerReglages} />
      {erreur && <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--danger-text)" }}>{erreur}</p>}
    </div>
  );
}

const FOND_MATIERE: Record<MatiereCaisse, string> = { Bois: "var(--bois-bg)", Contreplaqué: "var(--cp-bg)" };
const BORDURE_MATIERE: Record<MatiereCaisse, string> = { Bois: "var(--bois-border)", Contreplaqué: "var(--cp-border)" };

function PastilleMatiere({ matiere }: { matiere: MatiereCaisse }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: 3,
        marginRight: 6,
        verticalAlign: "-1px",
        background: FOND_MATIERE[matiere],
        border: `1px solid ${BORDURE_MATIERE[matiere]}`,
      }}
    />
  );
}

function cleMasse(m: MatiereCaisse): keyof ReglagesPoidsCaisse {
  return m === "Bois" ? "bois_masse_volumique" : "cp_masse_volumique";
}

type Conseils = Partial<Record<keyof ReglagesPoidsCaisse, { valeur: number; nbCaisses: number }>>;

const fmtM = (mm: number) => (mm / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 3 });
const fmtKg = (kg: number) => kg.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function LignePesee({
  caisse: p,
  reglages,
  enEdition,
  readOnly,
  onModifier,
  onSupprimer,
}: {
  caisse: CaissePesee;
  reglages: ReglagesPoidsCaisse;
  enEdition: boolean;
  readOnly: boolean;
  onModifier: () => void;
  onSupprimer: () => void;
}) {
  const aEstimer = versCaisseAEstimer(p);
  const est = estimerPoidsCaisse(aEstimer, reglages);
  const ecart = p.tare_kg - est.videKg;
  const composition = [
    `${p.nb_pieds} pied${p.nb_pieds > 1 ? "s" : ""}`,
    p.nb_renforts_longueur + p.nb_renforts_largeur > 0 ? `renforts ${p.nb_renforts_longueur} long. / ${p.nb_renforts_largeur} larg.` : "",
    p.nb_tasseaux > 0 ? `${p.nb_tasseaux} tasseau${p.nb_tasseaux > 1 ? "x" : ""}` : "",
    p.mousse_bache ? "mousse + bâche" : "",
  ].filter(Boolean);
  return (
    // Fond de la ligne selon la matière (2026-10-20), liseré à gauche ; ligne en cours de
    // modification toujours en couleur d'accent.
    <tr style={{ background: enEdition ? "var(--accent-soft)" : FOND_MATIERE[aEstimer.matiere] }}>
      <td style={{ fontWeight: 600, boxShadow: `inset 3px 0 0 ${BORDURE_MATIERE[aEstimer.matiere]}` }}>{p.affaire || "—"}</td>
      <td className="mono">
        <div>{`${fmtM(p.longueur_mm)} × ${fmtM(p.largeur_mm)} × ${fmtM(p.hauteur_mm)}`}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-muted)" }} title="Dimensions extérieures calculées">
          ext. {`${fmtM(est.extLongueurMm)} × ${fmtM(est.extLargeurMm)} × ${fmtM(est.extHauteurMm)}`}
        </div>
      </td>
      <td className="mono" style={{ whiteSpace: "nowrap" }}>{fmtKg(p.tare_kg)} kg</td>
      <td>
        <div>{p.matiere}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{composition.join(" · ")}</div>
      </td>
      <td
        className="mono"
        style={{ whiteSpace: "nowrap" }}
        title={`Panneaux ${fmtKg(est.panneauxKg)} + pieds ${fmtKg(est.piedsKg)} + tasseaux ${fmtKg(est.tasseauxKg)} + renforts ${fmtKg(est.renfortsKg)} kg`}
      >
        {fmtKg(est.videKg)} kg
      </td>
      <td className="mono" style={{ whiteSpace: "nowrap", fontWeight: 600, color: Math.abs(ecart) > p.tare_kg * 0.1 ? "var(--danger-text)" : undefined }}>
        {ecart > 0 ? "+" : ""}
        {fmtKg(ecart)} kg
      </td>
      <td className="mono" style={{ whiteSpace: "nowrap", color: p.mousse_bache ? undefined : "var(--text-muted)" }}>
        {p.mousse_bache ? `${fmtKg(est.totalKg)} kg` : "—"}
      </td>
      {!readOnly && (
        <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
          <button className="btn btn-sm" onClick={onModifier} disabled={enEdition}>
            Modifier
          </button>{" "}
          <button className="btn btn-sm btn-danger" onClick={onSupprimer}>
            Suppr.
          </button>
        </td>
      )}
    </tr>
  );
}

const VIDE: NewCaissePesee = {
  affaire: "",
  longueur_mm: 0,
  largeur_mm: 0,
  hauteur_mm: 0,
  tare_kg: 0,
  nb_pieds: 2,
  matiere: "Contreplaqué",
  mousse_bache: false,
  nb_renforts_longueur: 0,
  nb_renforts_largeur: 0,
  nb_tasseaux: 0,
};

const texteM = (mm: number) => (mm > 0 ? String(mm / 1000) : "");
const nombre = (t: string) => {
  const n = Number(t.trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

// Ajout (ou modification, si `initial`) d'une caisse pesée : champs libellés, passage à la ligne
// sur les écrans étroits.
function FormulairePesee({
  initial,
  onValider,
  onAnnuler,
}: {
  initial?: NewCaissePesee;
  onValider: (c: NewCaissePesee) => Promise<unknown>;
  onAnnuler?: () => void;
}) {
  const i = initial ?? VIDE;
  const [affaire, setAffaire] = useState(i.affaire);
  const [dims, setDims] = useState([texteM(i.longueur_mm), texteM(i.largeur_mm), texteM(i.hauteur_mm)]);
  const [tare, setTare] = useState(i.tare_kg > 0 ? String(i.tare_kg) : "");
  const [pieds, setPieds] = useState(String(i.nb_pieds));
  const [matiere, setMatiere] = useState(i.matiere);
  const [mousseBache, setMousseBache] = useState(i.mousse_bache);
  const [renfL, setRenfL] = useState(String(i.nb_renforts_longueur));
  const [renfl, setRenfl] = useState(String(i.nb_renforts_largeur));
  const [tasseaux, setTasseaux] = useState(String(i.nb_tasseaux));
  const [busy, setBusy] = useState(false);

  const dimsMm = dims.map((d) => Math.round(nombre(d) * 1000));
  const incomplet = dimsMm.some((d) => d <= 0) || nombre(tare) <= 0;
  const entier = (t: string) => Math.max(0, Math.round(nombre(t)));

  async function valider() {
    if (incomplet || busy) return;
    setBusy(true);
    await onValider({
      affaire: affaire.trim(),
      longueur_mm: dimsMm[0],
      largeur_mm: dimsMm[1],
      hauteur_mm: dimsMm[2],
      tare_kg: nombre(tare),
      nb_pieds: entier(pieds),
      matiere,
      mousse_bache: mousseBache,
      nb_renforts_longueur: entier(renfL),
      nb_renforts_largeur: entier(renfl),
      nb_tasseaux: entier(tasseaux),
    });
    setBusy(false);
  }

  const champ = (largeur: number, manquant = false): React.CSSProperties => ({
    width: largeur,
    padding: "4px 6px",
    fontSize: 12.5,
    background: manquant ? "var(--warn-bg)" : undefined,
  });
  const bloc = (libelle: string, contenu: React.ReactNode) => (
    <label style={{ display: "grid", gap: 3, fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)" }}>
      {libelle}
      <span style={{ display: "flex", gap: 4, alignItems: "center", fontWeight: 400, color: "var(--text)" }}>{contenu}</span>
    </label>
  );

  return (
    <div
      className="panel"
      style={{ padding: "12px 14px", ...(initial ? { borderColor: "var(--accent)" } : {}) }}
      onKeyDown={(e) => {
        if (e.key === "Enter") valider();
        else if (e.key === "Escape") onAnnuler?.();
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
        {initial ? `Modifier la caisse pesée « ${initial.affaire || "sans nom"} »` : "Ajouter une caisse pesée"}
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        {bloc("Affaire", <input value={affaire} onChange={(e) => setAffaire(e.target.value)} style={champ(110)} />)}
        {bloc(
          "Dimensions intérieures (m)",
          ["L", "l", "H"].map((lib, k) => (
            <input
              key={lib}
              value={dims[k]}
              inputMode="decimal"
              placeholder={lib}
              onChange={(e) => setDims(dims.map((d, j) => (j === k ? e.target.value : d)))}
              style={champ(60, dimsMm[k] <= 0)}
            />
          )),
        )}
        {bloc("Tare (kg)", <input value={tare} inputMode="decimal" onChange={(e) => setTare(e.target.value)} style={champ(64, nombre(tare) <= 0)} />)}
        {bloc(
          "Matière",
          <select value={matiere} onChange={(e) => setMatiere(e.target.value)} style={champ(120)}>
            {MATIERES_ESTIMATION.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>,
        )}
        {bloc("Pieds", <input value={pieds} inputMode="numeric" onChange={(e) => setPieds(e.target.value)} style={champ(44)} />)}
        {bloc(
          "Renforts (long. / larg.)",
          <>
            <input value={renfL} inputMode="numeric" title="Renforts sur la longueur" onChange={(e) => setRenfL(e.target.value)} style={champ(44)} />
            /
            <input value={renfl} inputMode="numeric" title="Renforts sur la largeur" onChange={(e) => setRenfl(e.target.value)} style={champ(44)} />
          </>,
        )}
        {bloc("Tasseaux", <input value={tasseaux} inputMode="numeric" onChange={(e) => setTasseaux(e.target.value)} style={champ(44)} />)}
        {bloc(
          "Mousse + bâche",
          <input type="checkbox" checked={mousseBache} onChange={(e) => setMousseBache(e.target.checked)} style={{ margin: "6px 0" }} />,
        )}
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          {onAnnuler && (
            <button className="btn btn-sm" onClick={onAnnuler}>
              Annuler
            </button>
          )}
          <button
            className="btn btn-sm btn-primary"
            disabled={incomplet || busy}
            title={incomplet ? "À renseigner : dimensions intérieures et tare" : undefined}
            onClick={valider}
          >
            {initial ? "Enregistrer" : "Ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Conseil({
  matiere,
  pesees,
  reglages,
}: {
  matiere: MatiereCaisse;
  pesees: CaissePesee[];
  reglages: ReglagesPoidsCaisse;
}) {
  const conseil = masseVolumiqueConseillee(pesees, matiere, reglages);
  const actuelle = matiere === "Bois" ? reglages.bois_masse_volumique : reglages.cp_masse_volumique;
  const libelle = matiere === "Bois" ? "bois reconstitué (caisses en bois)" : "contreplaqué";
  const lignes = pesees.filter((p) => versCaisseAEstimer(p).matiere === matiere);
  if (!conseil) {
    return (
      <p style={{ ...aideStyle, margin: 0 }}>
        Panneaux en {libelle} : aucune caisse pesée — masse volumique actuelle {actuelle} kg/m³.
      </p>
    );
  }
  const ecartMoyen = lignes.reduce((s, p) => s + p.tare_kg - estimerPoidsCaisse(versCaisseAEstimer(p), reglages).videKg, 0) / lignes.length;
  const valeur = Math.round(conseil.valeur);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
      <span>
        Panneaux en {libelle} : écart moyen <strong className="mono">{fmtKg(ecartMoyen)} kg</strong> — masse volumique conseillée{" "}
        <strong className="mono">{valeur} kg/m³</strong> (d'après {conseil.nbCaisses} caisse{conseil.nbCaisses > 1 ? "s" : ""}, actuelle{" "}
        {actuelle} kg/m³)
      </span>

    </div>
  );
}

const GROUPES_REGLAGES: { titre: string; aide?: string; champs: [keyof ReglagesPoidsCaisse, string, string][] }[] = [
  {
    titre: "Caisses en contreplaqué (STANDARD, 4B)",
    champs: [
      ["cp_masse_volumique", "Masse volumique des panneaux", "kg/m³"],
      ["cp_epaisseur_mm", "Épaisseur des panneaux", "mm"],
      ["cp_pied_largeur_mm", "Largeur d'un pied", "mm"],
      ["cp_pied_hauteur_mm", "Hauteur d'un pied", "mm"],
      ["cp_pied_masse_volumique", "Masse volumique des pieds", "kg/m³"],
    ],
  },
  {
    titre: "Caisses en bois (4C)",
    aide: "Pieds en bois massif",
    champs: [
      ["bois_masse_volumique", "Masse volumique des panneaux", "kg/m³"],
      ["bois_epaisseur_mm", "Épaisseur des panneaux", "mm"],
      ["bois_pied_largeur_mm", "Largeur d'un pied", "mm"],
      ["bois_pied_hauteur_mm", "Hauteur d'un pied", "mm"],
    ],
  },
  {
    titre: "Bois massif",
    aide: "Pieds des caisses en bois, renforts et tasseaux sous le fond.",
    champs: [["massif_masse_volumique", "Masse volumique", "kg/m³"]],
  },
  {
    titre: "Renforts",
    aide: "Longueur : celle de la caisse (renforts sur la longueur) ou sa largeur (renforts sur la largeur).",
    champs: [
      ["renfort_largeur_mm", "Largeur d'un renfort", "mm"],
      ["renfort_epaisseur_mm", "Épaisseur d'un renfort", "mm"],
    ],
  },
  {
    titre: "Tasseaux sous le fond (caisses en bois)",
    aide: "Sur toute la longueur de la caisse.",
    champs: [
      ["tasseau_largeur_mm", "Largeur d'un tasseau", "mm"],
      ["tasseau_hauteur_mm", "Hauteur d'un tasseau", "mm"],
      ["sim_tasseaux", "Nombre de tasseaux", ""],
    ],
  },
  {
    titre: "Mousse et bâche (4C)",
    champs: [
      ["mousse_masse_volumique", "Masse volumique de la mousse", "kg/m³"],
      ["mousse_epaisseur_mm", "Épaisseur de la mousse", "mm"],
      ["bache_masse_volumique", "Masse volumique de la bâche", "kg/m³"],
      ["bache_epaisseur_mm", "Épaisseur de la bâche", "mm"],
    ],
  },
  {
    titre: "Pieds",
    champs: [["seuil_3_pieds_mm", "3 pieds au-delà d'une longueur extérieure de", "mm"]],
  },
];

function Reglages({
  reglages,
  conseils,
  onEnregistrer,
}: {
  reglages: ReglagesPoidsCaisse;
  conseils: Conseils;
  onEnregistrer: (r: ReglagesPoidsCaisse) => Promise<void>;
}) {
  const [saisie, setSaisie] = useState<Record<string, string>>({});
  useEffect(() => {
    setSaisie(Object.fromEntries(Object.entries(reglages).map(([k, v]) => [k, String(v)])));
  }, [reglages]);

  const lu = Object.fromEntries(Object.entries(saisie).map(([k, v]) => [k, nombre(v)])) as unknown as ReglagesPoidsCaisse;
  const invalide = Object.values(saisie).some((v) => v.trim() === "" || nombre(v) < 0);
  const modifie = Object.keys(reglages).some((k) => lu[k as keyof ReglagesPoidsCaisse] !== reglages[k as keyof ReglagesPoidsCaisse]);

  return (
    <section>
      <h3 style={titreStyle}>Réglages de l'estimation</h3>
      <p style={aideStyle}>Valeurs approximatives, à ajuster d'après les caisses pesées (saisies dans Consommable › Poids).</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: 12 }}>
        {GROUPES_REGLAGES.map((g) => (
          <div key={g.titre} className="panel" style={{ padding: "12px 14px" }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: g.aide ? 2 : 8 }}>{g.titre}</div>
            {g.aide && <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>{g.aide}</div>}
            {g.champs.map(([cle, libelle, unite]) => {
              const conseil = conseils[cle as keyof ReglagesPoidsCaisse];
              return (
                <div key={cle} style={{ marginBottom: 6 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                    <span style={{ flex: 1 }}>{libelle}</span>
                    <input
                      className="input"
                      inputMode="decimal"
                      value={saisie[cle] ?? ""}
                      onChange={(e) => setSaisie((s) => ({ ...s, [cle]: e.target.value }))}
                      style={{ width: 80, textAlign: "right" }}
                    />
                    <span style={{ width: 40, color: "var(--text-muted)" }}>{unite}</span>
                  </label>
                  {/* Valeur conseillée d'après les caisses pesées : « Appliquer » remplit le champ,
                      l'enregistrement reste celui du bouton « Enregistrer ». */}
                  {conseil && nombre(saisie[cle] ?? "") !== conseil.valeur && (
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 3, paddingRight: 48, textAlign: "right" }}>
                      Conseillé : <strong className="mono">{conseil.valeur} {unite}</strong> d'après {conseil.nbCaisses} caisse
                      {conseil.nbCaisses > 1 ? "s" : ""} pesée{conseil.nbCaisses > 1 ? "s" : ""} ·{" "}
                      <button
                        className="btn-ghost"
                        style={{ border: "none", background: "none", padding: 0, font: "inherit", fontWeight: 600, color: "var(--accent)", cursor: "pointer" }}
                        onClick={() => setSaisie((s) => ({ ...s, [cle]: String(conseil.valeur) }))}
                      >
                        Appliquer
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <button
          className="btn"
          onClick={async () => {
            if (await confirmerAction("Remettre tous les réglages de l'estimation à leurs valeurs par défaut ?", "Valeurs par défaut"))
              await onEnregistrer({ ...REGLAGES_POIDS_DEFAUT });
          }}
        >
          Valeurs par défaut
        </button>
        <button className="btn btn-primary" disabled={!modifie || invalide} onClick={() => onEnregistrer(lu)}>
          Enregistrer
        </button>
      </div>
    </section>
  );
}

const titreStyle: React.CSSProperties = { margin: "0 0 4px", fontSize: 15, fontWeight: 700 };
const aideStyle: React.CSSProperties = { margin: "0 0 10px", fontSize: 12.5, color: "var(--text-muted)" };
