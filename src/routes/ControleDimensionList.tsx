import { useEffect, useMemo, useRef, useState } from "react";
import { controleDimensionApi, type FeuilleExportControle } from "../data/controleDimension";
import { confirmerAction } from "../data/confirm";
import { useSectionLock } from "../hooks/useSectionLock";
import LockBanner from "../components/LockBanner";
import { formaterHorodatage } from "../domain/dates";
import {
  affairesDe,
  dispoControle,
  indexPresences,
  lirePickingControle,
  type ArticleErp,
  etatControle,
  formuleEcart,
  prochainControle,
  repartirControles,
  repartirPetitsVolumes,
  LIBELLE_CONDITIONNEMENT,
  type DispoControle,
  type EtatPicking,
} from "../domain/controleDimension";
import { intranetApi } from "../data/intranet";
import type { Conditionnement, ControleDimension, ReglagesControle } from "../domain/types";

// Pickings lus en même temps (plusieurs dizaines d'affaires possibles, intranet à ménager).
const LECTURES_SIMULTANEES = 3;
// Fond des valeurs de l'ERP dans l'export « À contrôler » : bleu-gris clair (2026-11-17).
const FOND_ERP = "#DCE4EE";

interface Props {
  trigramme: string;
}

type Onglet = "a_controler" | "valides" | "corriges";
type FiltreCorriges = "a_reporter" | "reportees" | "toutes";
// Deux parties (2026-11-23) : contrôles annuels (gros articles, revalidés chaque année) et petits
// volumes (conditionnement indiqué une fois).
type Partie = "annuels" | "petits";
type OngletPv = "a_traiter" | "traites";

const CLE_ONGLET = "caisses:onglet:controle";
const CLE_PARTIE = "caisses:partie:controle";

function lireStockage<T extends string>(cle: string, valeurs: readonly T[], defaut: T): T {
  try {
    const v = localStorage.getItem(cle);
    if (v && (valeurs as readonly string[]).includes(v)) return v as T;
  } catch {
    /* stockage indisponible */
  }
  return defaut;
}

function ecrireStockage(cle: string, v: string) {
  try {
    localStorage.setItem(cle, v);
  } catch {
    /* stockage indisponible */
  }
}

// Contrôle dimensionnel (2026-11-16, ADR 0004) : les AR des pickings dont 2 dimensions sur 3
// dépassent le seuil de l'Admin sont à recontrôler à la main. Conforme → validé pour la durée de
// l'Admin ; mesures différentes → « Dimensions corrigées », à reporter dans l'ERP (export Excel),
// puis validées une à une ou par sélection. Ne modifie jamais les articles de Simulations : la
// mise à jour du picking reprendra les valeurs corrigées dans l'ERP. Verrou « controle ».
export default function ControleDimensionList({ trigramme }: Props) {
  const lock = useSectionLock("controle", trigramme);
  const readOnly = lock.status !== "held";
  const [lignes, setLignes] = useState<ControleDimension[] | null>(null);
  const [reglages, setReglages] = useState<ReglagesControle | null>(null);
  const [onglet, setOnglet] = useState<Onglet>(() =>
    lireStockage<Onglet>(CLE_ONGLET, ["a_controler", "valides", "corriges"], "a_controler"),
  );
  const [partie, setPartie] = useState<Partie>(() => lireStockage<Partie>(CLE_PARTIE, ["annuels", "petits"], "annuels"));
  const [ongletPv, setOngletPv] = useState<OngletPv>("a_traiter");
  const [conditionnementDe, setConditionnementDe] = useState<{ ligne: ControleDimension; initial: Conditionnement } | null>(null);
  const [recherche, setRecherche] = useState("");
  const [filtreCorriges, setFiltreCorriges] = useState<FiltreCorriges>("a_reporter");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [mesures, setMesures] = useState<ControleDimension | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickings, setPickings] = useState<Map<string, EtatPicking>>(new Map());
  const [actualisation, setActualisation] = useState(0);
  const [dispoSeulement, setDispoSeulement] = useState(false);
  const [affaireDispo, setAffaireDispo] = useState("");

  async function reload() {
    const [l, r] = await Promise.all([controleDimensionApi.list(), controleDimensionApi.getReglages()]);
    setReglages(r);
    setLignes(l);
  }

  useEffect(() => {
    reload().catch((e) => setMessage({ ok: false, texte: String(e) }));
  }, []);

  function choisirOnglet(o: Onglet) {
    setOnglet(o);
    setSelection(new Set());
    ecrireStockage(CLE_ONGLET, o);
  }

  function choisirPartie(p: Partie) {
    setPartie(p);
    setSelection(new Set());
    ecrireStockage(CLE_PARTIE, p);
  }

  const listes = useMemo(
    () => (lignes && reglages ? repartirControles(lignes, reglages) : { aControler: [], valides: [], corriges: [] }),
    [lignes, reglages],
  );
  const petits = useMemo(
    () => (lignes && reglages ? repartirPetitsVolumes(lignes, reglages) : { aTraiter: [], traites: [] }),
    [lignes, reglages],
  );
  const nbAReporter = listes.corriges.filter((c) => !c.erp_valide_le).length;

  const filtrer = (l: ControleDimension[]) => {
    const r = recherche.trim().toUpperCase();
    return r === "" ? l : l.filter((c) => c.ar.toUpperCase().includes(r) || c.affaires.toUpperCase().includes(r));
  };
  const corrigesAffiches = filtrer(
    listes.corriges.filter((c) =>
      filtreCorriges === "toutes" ? true : filtreCorriges === "a_reporter" ? !c.erp_valide_le : !!c.erp_valide_le,
    ),
  );
  // Lecture en direct du picking des affaires de Simulations pas entièrement expédiées (clé : nom
  // en majuscules), à l'ouverture de la page et par « Actualiser » (2026-11-17). Une lecture
  // lancée va jusqu'au bout ; seul le départ de la page l'interrompt.
  const [nomsAffaires, setNomsAffaires] = useState<Map<string, string>>(new Map());
  const monteRef = useRef(true);
  useEffect(() => {
    monteRef.current = true;
    return () => {
      monteRef.current = false;
    };
  }, []);

  useEffect(() => {
    let lecture = true;
    (async () => {
      let noms: string[];
      try {
        noms = await controleDimensionApi.listAffaires();
      } catch (e) {
        setMessage({ ok: false, texte: String(e) });
        return;
      }
      if (!monteRef.current || !lecture) return;
      const index = new Map(noms.map((n) => [n.toUpperCase(), n]));
      setNomsAffaires(index);
      setPickings(new Map([...index.keys()].map((cle) => [cle, { etat: "chargement" } as EtatPicking])));
      const file = [...index.entries()];
      const erp: ArticleErp[] = [];
      const lire = async () => {
        for (let suivant = file.shift(); suivant && monteRef.current; suivant = file.shift()) {
          const [cle, nom] = suivant;
          let etat: EtatPicking;
          try {
            const lu = lirePickingControle(await intranetApi.fetchPicking(nom));
            erp.push(...lu.erp);
            etat = { etat: "ok", ...lu };
          } catch (e) {
            etat = { etat: "erreur", message: String(e) };
          }
          if (monteRef.current) setPickings((p) => new Map(p).set(cle, etat));
        }
      };
      await Promise.all(Array.from({ length: LECTURES_SIMULTANEES }, lire));
      // Un Lecteur ne modifie rien : il voit la dispo, sans enrichir la liste.
      if (!monteRef.current || erp.length === 0 || lock.lectureSeule) return;
      // Nouveaux AR et valeurs de l'ERP à jour, sans passer par Simulations.
      try {
        const nouveaux = await controleDimensionApi.rafraichir(erp, trigramme);
        await reload();
        if (nouveaux > 0) setMessage({ ok: true, texte: `${nouveaux} nouvel(s) article(s) ajouté(s) d'après les pickings de l'intranet.` });
      } catch (e) {
        setMessage({ ok: false, texte: String(e) });
      }
    })();
    return () => {
      lecture = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualisation]);

  function actualiserDispo() {
    setActualisation((n) => n + 1);
  }

  const presences = useMemo(() => indexPresences(pickings, nomsAffaires), [pickings, nomsAffaires]);
  const dispos = useMemo(() => {
    const m = new Map<string, DispoControle>();
    for (const c of [...listes.aControler, ...petits.aTraiter]) m.set(c.ar, dispoControle(c, pickings, presences));
    return m;
  }, [listes.aControler, petits.aTraiter, pickings, presences]);
  const pickingsEnCours = [...pickings.values()].filter((p) => p.etat === "chargement").length;
  const pickingsEnErreur = [...nomsAffaires.entries()].filter(([cle]) => pickings.get(cle)?.etat === "erreur");
  /** Affaires affichées pour un article à contrôler (picking en direct, sinon base). */
  const affairesAffichees = (c: ControleDimension) => dispos.get(c.ar)?.affairesAffichees ?? affairesDe(c);

  /** Filtre « Affaire » (2026-11-23) : seulement les pièces dispo dans l'affaire choisie. */
  const dispoDansAffaire = (c: ControleDimension) =>
    affaireDispo === "" || (dispos.get(c.ar)?.affaires ?? []).includes(affaireDispo);

  const aControlerAffiches = listes.aControler
    .filter((c) => {
      const r = recherche.trim().toUpperCase();
      return r === "" || c.ar.toUpperCase().includes(r) || affairesAffichees(c).join(", ").toUpperCase().includes(r);
    })
    .filter((c) => !dispoSeulement || dispos.get(c.ar)?.etat === "oui")
    .filter((c) => dispoDansAffaire(c));
  const correspond = (c: ControleDimension, affaires: string[]) => {
    const r = recherche.trim().toUpperCase();
    return r === "" || c.ar.toUpperCase().includes(r) || affaires.join(", ").toUpperCase().includes(r);
  };
  // Petits volumes à traiter : seulement les pièces des pickings en cours (on ne retrouve pas une
  // pièce qui n'est dans aucune affaire) ; les autres attendent leur prochaine réception.
  const pvATraiterEnCours = petits.aTraiter.filter((c) => affairesAffichees(c).length > 0);
  const pvATraiterAffiches = pvATraiterEnCours
    .filter((c) => correspond(c, affairesAffichees(c)))
    .filter((c) => !dispoSeulement || dispos.get(c.ar)?.etat === "oui")
    .filter((c) => dispoDansAffaire(c));
  // Affaires proposées au filtre : celles où au moins une pièce de la liste en cours est dispo
  // (en stock ou mouvementée), avec leur nombre de pièces dispo.
  const affairesDispo = useMemo(() => {
    const n = new Map<string, number>();
    const liste = partie === "annuels" ? listes.aControler : petits.aTraiter;
    for (const c of liste) for (const a of dispos.get(c.ar)?.affaires ?? []) n.set(a, (n.get(a) ?? 0) + 1);
    return [...n.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [partie, listes.aControler, petits.aTraiter, dispos]);
  const pvTraitesAffiches = petits.traites.filter((c) => correspond(c, affairesDe(c)));
  const selectionnables = corrigesAffiches.filter((c) => !c.erp_valide_le);
  const selectionVisible = selectionnables.filter((c) => selection.has(c.ar));

  async function action(f: () => Promise<unknown>, succes?: string) {
    setBusy(true);
    try {
      await f();
      await reload();
      setMessage(succes ? { ok: true, texte: succes } : null);
    } catch (e) {
      setMessage({ ok: false, texte: String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function validerErp(ars: string[]) {
    if (ars.length === 0) return;
    const texte =
      ars.length === 1
        ? `Les mesures corrigées de ${ars[0]} ont bien été reportées dans l'ERP ?`
        : `Les mesures corrigées de ces ${ars.length} articles ont bien été reportées dans l'ERP ?`;
    if (!(await confirmerAction(texte, "Correction faite dans l'ERP"))) return;
    await action(async () => {
      await controleDimensionApi.validerErp(ars, trigramme);
      setSelection(new Set());
    });
  }

  async function enregistrerXlsx(feuille: FeuilleExportControle, nomFichier: string) {
    try {
      const chemin = await controleDimensionApi.exporterXlsx(feuille, nomFichier);
      if (chemin) setMessage({ ok: true, texte: `Fichier enregistré : ${chemin}` });
    } catch (e) {
      setMessage({ ok: false, texte: String(e) });
    }
  }
  const jour = () => new Date().toISOString().slice(0, 10);

  // Dimensions corrigées → valeurs relevées, à reporter dans l'ERP.
  function exporterCorriges() {
    const suffixe = filtreCorriges === "a_reporter" ? "a-reporter" : filtreCorriges === "reportees" ? "reportees" : "toutes";
    enregistrerXlsx(
      {
        nom: "Dimensions corrigées",
        entetes: ["Article", "Longueur (mm)", "Largeur (mm)", "Hauteur (mm)", "Poids (kg)"],
        lignes: corrigesAffiches.map((c) => [
          c.ar,
          c.corr_dim1_mm ?? c.dim1_mm,
          c.corr_dim2_mm ?? c.dim2_mm,
          c.corr_dim3_mm ?? c.dim3_mm,
          c.corr_poids_kg ?? c.poids_kg,
        ]),
      },
      `dimensions-corrigees-${suffixe}-${jour()}.xlsx`,
    );
  }

  // À contrôler → feuille à imprimer ou à ouvrir sur une tablette près des pièces (2026-11-16) :
  // valeurs de l'ERP, affaires où trouver la pièce, colonnes vides pour noter les mesures.
  function exporterAControler() {
    enregistrerXlsx(
      {
        nom: "À contrôler",
        // Ordre et colonnes demandés le 2026-11-17 : Affaire, Article, mesures relevées (vides, à
        // remplir sur place), puis valeurs de l'ERP sur fond bleu-gris clair. Plus de « Dispo pour
        // ctrl » ni de « Conforme » (le filtre « Dispo pour ctrl seulement » reste appliqué).
        entetes: [
          "Affaire",
          "Article",
          "Longueur relevée (mm)",
          "Largeur relevée (mm)",
          "Hauteur relevée (mm)",
          "Poids relevé (kg)",
          "Longueur ERP (mm)",
          "Largeur ERP (mm)",
          "Hauteur ERP (mm)",
          "Poids ERP (kg)",
          "Écart longueur (mm)",
          "Écart largeur (mm)",
          "Écart hauteur (mm)",
          "Écart poids (kg)",
        ],
        // Écarts relevé − ERP (2026-11-17) : formules, calculées dans Excel une fois les mesures
        // saisies (colonnes C-F relevées, G-J ERP).
        lignes: aControlerAffiches.map((c, i) => [
          affairesAffichees(c).join(", "),
          c.ar,
          "",
          "",
          "",
          "",
          c.dim1_mm,
          c.dim2_mm,
          c.dim3_mm,
          c.poids_kg,
          { formule: formuleEcart("C", "G", i + 2) },
          { formule: formuleEcart("D", "H", i + 2) },
          { formule: formuleEcart("E", "I", i + 2) },
          { formule: formuleEcart("F", "J", i + 2) },
        ]),
        fonds: ["", "", "", "", "", "", FOND_ERP, FOND_ERP, FOND_ERP, FOND_ERP, "", "", "", ""],
      },
      `articles-a-controler-${jour()}.xlsx`,
    );
  }

  // Listes qui montrent la dispo des pièces (et relisent les pickings).
  const listeAvecDispo = (partie === "annuels" && onglet === "a_controler") || (partie === "petits" && ongletPv === "a_traiter");

  async function enregistrerConditionnement(c: ControleDimension, cond: Conditionnement, hors: [number, number, number] | null) {
    const texte =
      cond === "" ? `${c.ar} : remis à traiter.` : `${c.ar} : ${LIBELLE_CONDITIONNEMENT[cond].toLowerCase()} enregistré.`;
    await action(() => controleDimensionApi.setConditionnement(c.ar, cond, hors, trigramme), texte);
  }

  const ONGLETS: { id: Onglet; label: string; n: number }[] = [
    { id: "a_controler", label: "À contrôler", n: listes.aControler.length },
    { id: "valides", label: "Validés", n: listes.valides.length },
    { id: "corriges", label: "Dimensions corrigées", n: nbAReporter },
  ];

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 24px 48px" }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Contrôle dimensionnel</h1>
          <p className="page-subtitle">
            {!reglages
              ? "Articles à recontrôler à la main."
              : partie === "annuels"
                ? `Articles dont 2 dimensions sur 3 atteignent ${fmtMm(reglages.seuil_mm)} mm, à recontrôler à la main. Un contrôle validé reste valable ${reglages.duree_mois} mois.`
                : `Articles plus petits (moins de 2 dimensions sur 3 à ${fmtMm(reglages.seuil_mm)} mm) : indiquer une fois s'ils sont livrés en carton, en sachet ou sans emballage. Pour un sachet, les dimensions de la pièce hors sachet servent aux calculs de Simulations (volume majoré de ${fmtMm(reglages.marge_sachet_pct)} %).`}
          </p>
        </div>
      </div>

      {(readOnly || lock.incomingRequest) && (
        <LockBanner
          lectureSeule={lock.lectureSeule}
          holderTrigramme={lock.holderTrigramme}
          incomingRequest={lock.incomingRequest}
          outgoingRequestStatus={lock.outgoingRequestStatus}
          onRequestPen={lock.requestPen}
          onApprove={lock.approveRequest}
          onDeny={lock.denyRequest}
          verrouLibre={lock.verrouLibre}
          onPrendreLaMain={async () => {
            if (await lock.prendreLaMain()) await reload().catch((e) => setMessage({ ok: false, texte: String(e) }));
          }}
        />
      )}

      {message && (
        <div
          className="panel"
          style={{
            padding: "10px 14px",
            marginBottom: 12,
            background: message.ok ? "var(--ok-bg)" : "var(--danger-bg)",
            color: message.ok ? "var(--ok-text)" : "var(--danger-text)",
          }}
        >
          {message.texte}
        </div>
      )}

      <div className="tabs" style={{ marginBottom: 14 }}>
        {(
          [
            ["annuels", "Contrôles annuels", listes.aControler.length],
            ["petits", "Petits volumes", pvATraiterEnCours.length],
          ] as [Partie, string, number][]
        ).map(([id, label, n]) => (
          <button key={id} className={partie === id ? "tab actif" : "tab"} onClick={() => choisirPartie(id)}>
            {label}
            {n > 0 && (
              <span className={id === "annuels" ? "badge badge-danger" : "badge badge-warn"} style={{ marginLeft: 8 }}>
                {n}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="segmented" style={{ marginBottom: 14 }}>
        {partie === "annuels"
          ? ONGLETS.map((o) => (
              <button key={o.id} className={onglet === o.id ? "actif" : undefined} onClick={() => choisirOnglet(o.id)}>
                {o.label}
                {o.n > 0 && ` (${o.n})`}
              </button>
            ))
          : (
              [
                ["a_traiter", "À traiter", pvATraiterEnCours.length],
                ["traites", "Traités", petits.traites.length],
              ] as [OngletPv, string, number][]
            ).map(([id, label, n]) => (
              <button key={id} className={ongletPv === id ? "actif" : undefined} onClick={() => setOngletPv(id)}>
                {label}
                {n > 0 && ` (${n})`}
              </button>
            ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <input
          type="search"
          placeholder="Rechercher un article ou une affaire"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          style={{ width: 300 }}
        />
        {partie === "annuels" && onglet === "corriges" && (
          <>
            <div className="segmented">
              {(
                [
                  ["a_reporter", "À reporter dans l'ERP"],
                  ["reportees", "Reportées dans l'ERP"],
                  ["toutes", "Toutes"],
                ] as [FiltreCorriges, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  className={filtreCorriges === id ? "actif" : undefined}
                  onClick={() => {
                    setFiltreCorriges(id);
                    setSelection(new Set());
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {selectionVisible.length > 0 && (
                <button
                  className="btn btn-success-solid"
                  disabled={readOnly || busy}
                  onClick={() => validerErp(selectionVisible.map((c) => c.ar))}
                >
                  Reporté dans l'ERP ({selectionVisible.length})
                </button>
              )}
              <button className="btn" disabled={corrigesAffiches.length === 0} onClick={exporterCorriges}>
                Exporter en Excel ({corrigesAffiches.length})
              </button>
            </span>
          </>
        )}
        {listeAvecDispo && (
          <>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={dispoSeulement} onChange={(e) => setDispoSeulement(e.target.checked)} />
              Dispo pour ctrl seulement
            </label>
            <select
              value={affaireDispo}
              onChange={(e) => setAffaireDispo(e.target.value)}
              title="N'afficher que les pièces dispo (en stock ou mouvementées) dans cette affaire"
              style={{ minWidth: 200 }}
            >
              <option value="">Toutes les affaires</option>
              {affaireDispo !== "" && !affairesDispo.some(([a]) => a === affaireDispo) && (
                <option value={affaireDispo}>{affaireDispo} (aucune pièce dispo)</option>
              )}
              {affairesDispo.map(([a, n]) => (
                <option key={a} value={a}>
                  {a} ({n} dispo)
                </option>
              ))}
            </select>
            <button
              className="btn btn-sm"
              disabled={pickingsEnCours > 0}
              title="Relire le picking de l'intranet des affaires en cours (nouveaux articles, dispo)"
              onClick={actualiserDispo}
            >
              {pickingsEnCours > 0 ? `Lecture des pickings… (${pickingsEnCours})` : "Actualiser depuis l'intranet"}
            </button>
          </>
        )}
        {partie === "annuels" && onglet === "a_controler" && (
          <button
            className="btn"
            style={{ marginLeft: "auto" }}
            disabled={aControlerAffiches.length === 0}
            title="Liste à imprimer ou à ouvrir sur une tablette, avec des colonnes pour noter les mesures"
            onClick={exporterAControler}
          >
            Exporter en Excel ({aControlerAffiches.length})
          </button>
        )}
      </div>

      {listeAvecDispo && pickingsEnErreur.length > 0 && pickingsEnCours === 0 && (
        <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--warn-text)" }}>
          Picking illisible pour {pickingsEnErreur.map(([, nom]) => nom).join(", ")} : dispo inconnue (
          {(() => {
            const p = pickings.get(pickingsEnErreur[0][0]);
            return p?.etat === "erreur" ? p.message : "";
          })()}
          ).
        </p>
      )}

      {lignes === null || reglages === null ? (
        <p style={{ color: "var(--text-muted)" }}>Chargement…</p>
      ) : partie === "petits" && ongletPv === "a_traiter" ? (
        <TableauControle
          lignes={pvATraiterAffiches}
          vide={dispoSeulement ? "Aucun petit volume dispo à traiter." : "Aucun petit volume à traiter dans les pickings en cours."}
          affairesEnEvidence={(c) => dispos.get(c.ar)?.affaires ?? []}
          affairesDe={affairesAffichees}
          colonnesFin={["Dispo pour ctrl", ""]}
          cellulesFin={(c) => [
            <PastilleDispo dispo={dispos.get(c.ar)} />,
            <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <button
                className="btn btn-sm btn-pastel-green"
                disabled={readOnly || busy}
                title="Pièce livrée en carton ou en boîte : les dimensions de l'ERP sont justes"
                onClick={() => enregistrerConditionnement(c, "carton", null)}
              >
                Carton
              </button>
              <button
                className="btn btn-sm btn-pastel-blue"
                disabled={readOnly || busy}
                title="Saisir les dimensions de la pièce hors sachet"
                onClick={() => setConditionnementDe({ ligne: c, initial: "sachet" })}
              >
                Sachet…
              </button>
              <button
                className="btn btn-sm"
                disabled={readOnly || busy}
                title="Pièce livrée sans emballage : les dimensions de l'ERP sont justes"
                onClick={() => enregistrerConditionnement(c, "gros_volume", null)}
              >
                Sans emballage
              </button>
            </span>,
          ]}
        />
      ) : partie === "petits" ? (
        <TableauControle
          lignes={pvTraitesAffiches}
          vide="Aucun petit volume traité."
          colonnesFin={["Conditionnement", "Hors sachet (mm)", "Traité", ""]}
          cellulesFin={(c) => [
            c.conditionnement === "" ? null : (
              <span className={c.conditionnement === "sachet" ? "badge badge-info" : "badge badge-muted"}>
                {LIBELLE_CONDITIONNEMENT[c.conditionnement]}
              </span>
            ),
            c.conditionnement === "sachet" && c.hs_dim1_mm !== null && c.hs_dim2_mm !== null && c.hs_dim3_mm !== null ? (
              <span className="mono" style={{ whiteSpace: "nowrap" }}>
                {fmtMm(c.hs_dim1_mm)} × {fmtMm(c.hs_dim2_mm)} × {fmtMm(c.hs_dim3_mm)}
              </span>
            ) : (
              <span style={{ color: "var(--text-faint)" }}>—</span>
            ),
            <span style={{ whiteSpace: "nowrap" }}>
              {formaterHorodatage(c.conditionnement_le ?? "").slice(0, 10)}
              {c.conditionnement_par && <span style={{ color: "var(--text-muted)" }}> · {c.conditionnement_par}</span>}
            </span>,
            <span style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                className="btn btn-sm"
                disabled={readOnly || busy}
                onClick={() => setConditionnementDe({ ligne: c, initial: c.conditionnement })}
              >
                Modifier…
              </button>
            </span>,
          ]}
        />
      ) : onglet === "a_controler" ? (
        <TableauControle
          lignes={aControlerAffiches}
          vide={dispoSeulement ? "Aucun article dispo pour un contrôle." : "Aucun article à contrôler."}
          affairesEnEvidence={(c) => dispos.get(c.ar)?.affaires ?? []}
          affairesDe={affairesAffichees}
          colonnesFin={["Dispo pour ctrl", "État", ""]}
          cellulesFin={(c) => {
            const etat = etatControle(c, reglages.duree_mois);
            return [
              <PastilleDispo dispo={dispos.get(c.ar)} />,
              etat === "recontrole" ? (
                <span className="badge badge-warn" title={`Dernier contrôle le ${formaterHorodatage(c.controle_le ?? "")}`}>
                  À recontrôler
                </span>
              ) : (
                <span className="badge badge-danger">Jamais contrôlé</span>
              ),
              <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button
                  className="btn btn-sm btn-pastel-green"
                  disabled={readOnly || busy}
                  title="Les mesures relevées correspondent à l'ERP"
                  onClick={() => action(() => controleDimensionApi.valider(c.ar, trigramme), `${c.ar} : contrôle validé.`)}
                >
                  Conforme
                </button>
                <button
                  className="btn btn-sm btn-pastel-orange"
                  disabled={readOnly || busy}
                  title="Saisir les mesures relevées"
                  onClick={() => setMesures(c)}
                >
                  Corriger…
                </button>
              </span>,
            ];
          }}
        />
      ) : onglet === "valides" ? (
        <TableauControle
          lignes={filtrer(listes.valides)}
          vide="Aucun article validé."
          colonnesFin={["Contrôlé", "Prochain contrôle"]}
          cellulesFin={(c) => {
            const prochain = prochainControle(c, reglages.duree_mois);
            return [
              <span style={{ whiteSpace: "nowrap" }}>
                {formaterHorodatage(c.controle_le ?? "").slice(0, 10)}
                {c.controle_par && <span style={{ color: "var(--text-muted)" }}> · {c.controle_par}</span>}
                {c.corrige && <span className="badge badge-muted" style={{ marginLeft: 6 }}>corrigé</span>}
              </span>,
              <span className="mono">{prochain ? prochain.toLocaleDateString("fr-FR") : "—"}</span>,
            ];
          }}
        />
      ) : (
        <TableauControle
          lignes={corrigesAffiches}
          vide={filtreCorriges === "a_reporter" ? "Aucune correction à reporter dans l'ERP." : "Aucune correction."}
          mesuresCorrigees
          selection={{
            coches: selection,
            selectionnables: new Set(selectionnables.map((c) => c.ar)),
            tout: selectionnables.length > 0 && selectionVisible.length === selectionnables.length,
            onBasculer: (ar) =>
              setSelection((s) => {
                const n = new Set(s);
                if (n.has(ar)) n.delete(ar);
                else n.add(ar);
                return n;
              }),
            onTout: () =>
              setSelection(
                selectionVisible.length === selectionnables.length ? new Set() : new Set(selectionnables.map((c) => c.ar)),
              ),
            desactive: readOnly,
          }}
          colonnesFin={["Contrôlé", "ERP", ""]}
          cellulesFin={(c) => [
            <span style={{ whiteSpace: "nowrap" }}>
              {formaterHorodatage(c.controle_le ?? "").slice(0, 10)}
              {c.controle_par && <span style={{ color: "var(--text-muted)" }}> · {c.controle_par}</span>}
            </span>,
            c.erp_valide_le ? (
              <span className="badge badge-ok" title={c.erp_valide_par ? `par ${c.erp_valide_par}` : undefined}>
                Reportée le {formaterHorodatage(c.erp_valide_le).slice(0, 10)}
              </span>
            ) : (
              <span className="badge badge-warn">À reporter</span>
            ),
            c.erp_valide_le ? null : (
              <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button className="btn btn-sm" disabled={readOnly || busy} onClick={() => setMesures(c)}>
                  Modifier
                </button>
                <button className="btn btn-sm btn-pastel-green" disabled={readOnly || busy} onClick={() => validerErp([c.ar])}>
                  Reporté dans l'ERP
                </button>
              </span>
            ),
          ]}
        />
      )}

      {conditionnementDe && (
        <ConditionnementDialog
          ligne={conditionnementDe.ligne}
          initial={conditionnementDe.initial}
          onClose={() => setConditionnementDe(null)}
          onEnregistrer={(cond, hors) => {
            const c = conditionnementDe.ligne;
            setConditionnementDe(null);
            enregistrerConditionnement(c, cond, hors);
          }}
        />
      )}

      {mesures && (
        <MesuresDialog
          ligne={mesures}
          onClose={() => setMesures(null)}
          onEnregistrer={(m) => {
            const c = mesures;
            setMesures(null);
            action(
              () => controleDimensionApi.corriger(c.ar, m[0], m[1], m[2], m[3], trigramme),
              `${c.ar} : mesures enregistrées.`,
            );
          }}
        />
      )}
    </div>
  );
}

// Dispo pour ctrl : pièce en stock ou mouvementée dans le picking d'une des affaires listées.
function PastilleDispo({ dispo }: { dispo: DispoControle | undefined }) {
  if (!dispo || dispo.etat === "chargement") return <span style={{ color: "var(--text-faint)" }}>…</span>;
  if (dispo.etat === "oui")
    return (
      <span className="badge badge-ok" title={`En stock ou mouvementée : ${dispo.affaires.join(", ")}`}>
        Oui
      </span>
    );
  if (dispo.etat === "non")
    return (
      <span className="badge badge-muted" title="Ni en stock ni mouvementée dans les affaires listées">
        Non
      </span>
    );
  return (
    <span className="badge badge-warn" title="Picking de l'intranet illisible">
      ?
    </span>
  );
}

function fmtMm(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}
function fmtKg(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

interface SelectionProps {
  coches: Set<string>;
  selectionnables: Set<string>;
  tout: boolean;
  onBasculer: (ar: string) => void;
  onTout: () => void;
  desactive: boolean;
}

function TableauControle({
  lignes,
  vide,
  colonnesFin,
  cellulesFin,
  mesuresCorrigees,
  selection,
  affairesEnEvidence,
  affairesDe: affairesDeLigne = affairesDe,
}: {
  lignes: ControleDimension[];
  vide: string;
  /** Affaires à faire ressortir dans la colonne « Affaires » (pièce dispo pour un contrôle). */
  affairesEnEvidence?: (c: ControleDimension) => string[];
  /** Affaires à afficher (par défaut : celles de la base). */
  affairesDe?: (c: ControleDimension) => string[];
  colonnesFin: string[];
  cellulesFin: (c: ControleDimension) => React.ReactNode[];
  /** Affiche « valeur de l'ERP → valeur relevée » quand elles diffèrent. */
  mesuresCorrigees?: boolean;
  selection?: SelectionProps;
}) {
  if (lignes.length === 0) {
    return (
      <div className="panel" style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-muted)" }}>
        <p style={{ margin: 0 }}>{vide}</p>
      </div>
    );
  }
  const valeur = (erp: number, corr: number | null, fmt: (n: number) => string) =>
    mesuresCorrigees && corr !== null && Math.abs(corr - erp) >= 0.0005 ? (
      <span style={{ whiteSpace: "nowrap" }}>
        <span style={{ color: "var(--text-faint)", textDecoration: "line-through" }}>{fmt(erp)}</span>{" "}
        <span style={{ color: "var(--warn-text)", fontWeight: 700 }}>→ {fmt(corr)}</span>
      </span>
    ) : (
      fmt(mesuresCorrigees && corr !== null ? corr : erp)
    );
  return (
    <div className="panel" style={{ padding: 0, overflowX: "auto" }}>
      <table className="table-donnees">
        <thead>
          <tr>
            {selection && (
              <th style={{ width: 30 }}>
                <input
                  type="checkbox"
                  checked={selection.tout}
                  disabled={selection.desactive || selection.selectionnables.size === 0}
                  onChange={selection.onTout}
                  title="Tout sélectionner"
                />
              </th>
            )}
            <th>Article</th>
            <th>Affaires</th>
            <th style={{ textAlign: "right" }}>Longueur (mm)</th>
            <th style={{ textAlign: "right" }}>Largeur (mm)</th>
            <th style={{ textAlign: "right" }}>Hauteur (mm)</th>
            <th style={{ textAlign: "right" }}>Poids (kg)</th>
            {colonnesFin.map((t, i) => (
              <th key={i}>{t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((c) => (
            <tr key={c.ar}>
              {selection && (
                <td>
                  {selection.selectionnables.has(c.ar) && (
                    <input
                      type="checkbox"
                      checked={selection.coches.has(c.ar)}
                      disabled={selection.desactive}
                      onChange={() => selection.onBasculer(c.ar)}
                    />
                  )}
                </td>
              )}
              <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{c.ar}</td>
              <td style={{ fontSize: 12.5, color: "var(--text-muted)", maxWidth: 260 }}>
                {affairesDeLigne(c).length === 0
                  ? "—"
                  : affairesDeLigne(c).map((a, i) => {
                      const dispo = affairesEnEvidence?.(c).includes(a);
                      return (
                        <span key={a}>
                          {i > 0 && ", "}
                          <span
                            style={dispo ? { color: "var(--ok-text)", fontWeight: 700 } : undefined}
                            title={dispo ? "Pièce en stock ou mouvementée dans cette affaire" : undefined}
                          >
                            {a}
                          </span>
                        </span>
                      );
                    })}
              </td>
              <td className="mono" style={{ textAlign: "right" }}>{valeur(c.dim1_mm, c.corr_dim1_mm, fmtMm)}</td>
              <td className="mono" style={{ textAlign: "right" }}>{valeur(c.dim2_mm, c.corr_dim2_mm, fmtMm)}</td>
              <td className="mono" style={{ textAlign: "right" }}>{valeur(c.dim3_mm, c.corr_dim3_mm, fmtMm)}</td>
              <td className="mono" style={{ textAlign: "right" }}>{valeur(c.poids_kg, c.corr_poids_kg, fmtKg)}</td>
              {cellulesFin(c).map((n, i) => (
                <td key={i}>{n}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Saisie des mesures relevées, pré-remplies avec l'ERP (ou la correction en attente).
function MesuresDialog({
  ligne,
  onClose,
  onEnregistrer,
}: {
  ligne: ControleDimension;
  onClose: () => void;
  onEnregistrer: (mesures: [number, number, number, number]) => void;
}) {
  const depart = [
    ligne.corr_dim1_mm ?? ligne.dim1_mm,
    ligne.corr_dim2_mm ?? ligne.dim2_mm,
    ligne.corr_dim3_mm ?? ligne.dim3_mm,
    ligne.corr_poids_kg ?? ligne.poids_kg,
  ];
  const [textes, setTextes] = useState(depart.map((n) => String(n)));
  const valeurs = textes.map((t) => Number(t.replace(",", ".").trim()));
  const valide =
    textes.every((t) => t.trim() !== "") && valeurs.slice(0, 3).every((n) => Number.isFinite(n) && n > 0) && Number.isFinite(valeurs[3]) && valeurs[3] >= 0;
  const erp = [ligne.dim1_mm, ligne.dim2_mm, ligne.dim3_mm, ligne.poids_kg];
  const identique = valide && valeurs.every((n, i) => Math.abs(n - erp[i]) < 0.0005);
  const libelles = ["Longueur (mm)", "Largeur (mm)", "Hauteur (mm)", "Poids (kg)"];

  return (
    <div className="modal-overlay" style={{ zIndex: 400 }} onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (valide) onEnregistrer(valeurs as [number, number, number, number]);
        }}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        className="panel"
        style={{ padding: 22, width: 460, maxWidth: "calc(100vw - 32px)", boxSizing: "border-box", display: "grid", gap: 14, boxShadow: "var(--shadow-lg)" }}
      >
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Mesures relevées — {ligne.ar}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
          {libelles.map((label, i) => (
            <label key={label} style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
              {label}
              <input
                className="input mono"
                inputMode="decimal"
                autoFocus={i === 0}
                value={textes[i]}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setTextes((t) => t.map((x, j) => (j === i ? e.target.value : x)))}
                style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}
              />
              <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>ERP : {i < 3 ? fmtMm(erp[i]) : fmtKg(erp[i])}</span>
            </label>
          ))}
        </div>
        <p style={{ margin: 0, fontSize: 12.5, color: identique ? "var(--ok-text)" : "var(--warn-text)" }}>
          {identique
            ? "Mesures identiques à l'ERP : le contrôle sera validé."
            : "Mesures différentes de l'ERP : l'article passera dans « Dimensions corrigées », à reporter dans l'ERP."}
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn-success-solid" disabled={!valide}>
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  );
}

// Petits volumes : choix du conditionnement ; pour un sachet, dimensions de la pièce hors sachet
// (dans le même sens que celles de l'ERP), utilisées par les calculs de Simulations.
function ConditionnementDialog({
  ligne,
  initial,
  onClose,
  onEnregistrer,
}: {
  ligne: ControleDimension;
  initial: Conditionnement;
  onClose: () => void;
  onEnregistrer: (conditionnement: Conditionnement, horsSachet: [number, number, number] | null) => void;
}) {
  const [choix, setChoix] = useState<Exclude<Conditionnement, "">>(initial === "" ? "sachet" : initial);
  const [textes, setTextes] = useState(
    [ligne.hs_dim1_mm, ligne.hs_dim2_mm, ligne.hs_dim3_mm].map((n) => (n === null ? "" : String(n))),
  );
  const valeurs = textes.map((t) => Number(t.replace(",", ".").trim()));
  const dimsValides = textes.every((t) => t.trim() !== "") && valeurs.every((n) => Number.isFinite(n) && n > 0);
  const valide = choix !== "sachet" || dimsValides;
  const erp = [ligne.dim1_mm, ligne.dim2_mm, ligne.dim3_mm];
  const libelles = ["Longueur (mm)", "Largeur (mm)", "Hauteur (mm)"];
  const choixPossibles: [Exclude<Conditionnement, "">, string][] = [
    ["carton", "Carton ou boîte : les dimensions de l'ERP sont justes"],
    ["sachet", "Sachet : saisir les dimensions de la pièce hors sachet"],
    ["gros_volume", "Sans emballage : les dimensions de l'ERP sont justes"],
  ];

  return (
    <div className="modal-overlay" style={{ zIndex: 400 }} onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (valide) onEnregistrer(choix, choix === "sachet" ? (valeurs as [number, number, number]) : null);
        }}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        className="panel"
        style={{ padding: 22, width: 480, maxWidth: "calc(100vw - 32px)", boxSizing: "border-box", display: "grid", gap: 14, boxShadow: "var(--shadow-lg)" }}
      >
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Conditionnement — {ligne.ar}</h3>
        <div style={{ display: "grid", gap: 6 }}>
          {choixPossibles.map(([id, label]) => (
            <label key={id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5 }}>
              <input type="radio" name="conditionnement" checked={choix === id} onChange={() => setChoix(id)} />
              {label}
            </label>
          ))}
        </div>
        {choix === "sachet" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
              {libelles.map((label, i) => (
                <label key={label} style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
                  {label}
                  <input
                    className="input mono"
                    inputMode="decimal"
                    autoFocus={i === 0}
                    value={textes[i]}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setTextes((t) => t.map((x, j) => (j === i ? e.target.value : x)))}
                    style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}
                  />
                  <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>ERP : {fmtMm(erp[i])}</span>
                </label>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-muted)" }}>
              Dimensions d'une pièce, sans le sachet, dans le même sens que celles de l'ERP. Le volume de la ligne sera
              calculé avec ces dimensions et la quantité du picking, majoré de la marge sachet.
            </p>
          </>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {initial !== "" && (
            <button type="button" className="btn btn-ghost" onClick={() => onEnregistrer("", null)} title="Remettre l'article dans « À traiter »">
              Remettre à traiter
            </button>
          )}
          <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button type="button" className="btn" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn btn-success-solid" disabled={!valide}>
              Enregistrer
            </button>
          </span>
        </div>
      </form>
    </div>
  );
}
