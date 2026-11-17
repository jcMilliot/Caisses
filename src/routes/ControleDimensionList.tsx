import { useEffect, useMemo, useRef, useState } from "react";
import { controleDimensionApi, type FeuilleExportControle } from "../data/controleDimension";
import { confirmerAction } from "../data/confirm";
import { useSectionLock } from "../hooks/useSectionLock";
import LockBanner from "../components/LockBanner";
import { formaterHorodatage } from "../domain/dates";
import {
  affairesDe,
  arsDisponibles,
  dispoControle,
  etatControle,
  prochainControle,
  repartirControles,
  type DispoControle,
  type EtatPicking,
} from "../domain/controleDimension";
import { intranetApi } from "../data/intranet";
import type { ControleDimension, ReglagesControle } from "../domain/types";

// Pickings lus en même temps (plusieurs dizaines d'affaires possibles, intranet à ménager).
const LECTURES_SIMULTANEES = 3;
// Fond des valeurs de l'ERP dans l'export « À contrôler » : bleu-gris clair (2026-11-17).
const FOND_ERP = "#DCE4EE";

interface Props {
  trigramme: string;
}

type Onglet = "a_controler" | "valides" | "corriges";
type FiltreCorriges = "a_reporter" | "reportees" | "toutes";

const CLE_ONGLET = "caisses:onglet:controle";

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
  const [onglet, setOnglet] = useState<Onglet>(() => {
    try {
      const v = localStorage.getItem(CLE_ONGLET);
      if (v === "a_controler" || v === "valides" || v === "corriges") return v;
    } catch {
      /* stockage indisponible */
    }
    return "a_controler";
  });
  const [recherche, setRecherche] = useState("");
  const [filtreCorriges, setFiltreCorriges] = useState<FiltreCorriges>("a_reporter");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [mesures, setMesures] = useState<ControleDimension | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Picking de l'intranet de chaque affaire de la colonne « Affaires » (clé : nom en majuscules),
  // lu à l'ouverture de la page et par « Actualiser » (décision de l'utilisateur, 2026-11-17).
  const [pickings, setPickings] = useState<Map<string, EtatPicking>>(new Map());
  const [actualisation, setActualisation] = useState(0);
  const [dispoSeulement, setDispoSeulement] = useState(false);

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
    try {
      localStorage.setItem(CLE_ONGLET, o);
    } catch {
      /* stockage indisponible */
    }
  }

  const listes = useMemo(
    () => (lignes && reglages ? repartirControles(lignes, reglages) : { aControler: [], valides: [], corriges: [] }),
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
  // Affaires à interroger : celles des articles à contrôler.
  const affairesAControler = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of listes.aControler) for (const a of affairesDe(c)) m.set(a.toUpperCase(), a);
    return [...m.entries()];
  }, [listes.aControler]);

  // Une lecture lancée va jusqu'au bout même si la liste change entre-temps (sinon l'affaire
  // resterait « en cours ») ; seul le départ de la page l'interrompt.
  const monteRef = useRef(true);
  useEffect(() => {
    monteRef.current = true;
    return () => {
      monteRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Seulement les affaires pas encore lues (« Actualiser » vide la liste d'abord).
    const aLire = affairesAControler.filter(([cle]) => !pickings.has(cle));
    if (aLire.length === 0) return;
    setPickings((p) => {
      const n = new Map(p);
      for (const [cle] of aLire) n.set(cle, { etat: "chargement" });
      return n;
    });
    const file = [...aLire];
    const lire = async () => {
      for (let suivant = file.shift(); suivant && monteRef.current; suivant = file.shift()) {
        const [cle, nom] = suivant;
        let etat: EtatPicking;
        try {
          etat = { etat: "ok", dispos: arsDisponibles(await intranetApi.fetchPicking(nom)) };
        } catch (e) {
          etat = { etat: "erreur", message: String(e) };
        }
        if (monteRef.current) setPickings((p) => new Map(p).set(cle, etat));
      }
    };
    for (let i = 0; i < LECTURES_SIMULTANEES; i++) void lire();
    // `pickings` lu seulement pour ne pas relire ce qui l'est déjà.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affairesAControler, actualisation]);

  function actualiserDispo() {
    setPickings(new Map());
    setActualisation((n) => n + 1);
  }

  const dispos = useMemo(() => {
    const m = new Map<string, DispoControle>();
    for (const c of listes.aControler) m.set(c.ar, dispoControle(c, pickings));
    return m;
  }, [listes.aControler, pickings]);
  const pickingsEnCours = [...pickings.values()].filter((p) => p.etat === "chargement").length;
  const pickingsEnErreur = affairesAControler.filter(([cle]) => pickings.get(cle)?.etat === "erreur");

  const aControlerAffiches = filtrer(listes.aControler).filter((c) => !dispoSeulement || dispos.get(c.ar)?.etat === "oui");
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
        ],
        lignes: aControlerAffiches.map((c) => [c.affaires, c.ar, "", "", "", "", c.dim1_mm, c.dim2_mm, c.dim3_mm, c.poids_kg]),
        fonds: ["", "", "", "", "", "", FOND_ERP, FOND_ERP, FOND_ERP, FOND_ERP],
      },
      `articles-a-controler-${jour()}.xlsx`,
    );
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
            {reglages
              ? `Articles dont 2 dimensions sur 3 atteignent ${fmtMm(reglages.seuil_mm)} mm, à recontrôler à la main. Un contrôle validé reste valable ${reglages.duree_mois} mois.`
              : "Articles à recontrôler à la main."}
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

      <div className="tabs" style={{ marginBottom: 16 }}>
        {ONGLETS.map((o) => (
          <button key={o.id} className={onglet === o.id ? "tab actif" : "tab"} onClick={() => choisirOnglet(o.id)}>
            {o.label}
            {o.n > 0 && (
              <span
                className={o.id === "a_controler" ? "badge badge-danger" : o.id === "corriges" ? "badge badge-warn" : "badge badge-muted"}
                style={{ marginLeft: 8 }}
              >
                {o.n}
              </span>
            )}
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
        {onglet === "corriges" && (
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
        {onglet === "a_controler" && (
          <>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={dispoSeulement} onChange={(e) => setDispoSeulement(e.target.checked)} />
              Dispo pour ctrl seulement
            </label>
            <button
              className="btn btn-sm"
              disabled={pickingsEnCours > 0 || affairesAControler.length === 0}
              title="Relire le picking de l'intranet des affaires listées"
              onClick={actualiserDispo}
            >
              {pickingsEnCours > 0 ? `Lecture des pickings… (${pickingsEnCours})` : "Actualiser la dispo"}
            </button>
          </>
        )}
        {onglet === "a_controler" && (
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

      {onglet === "a_controler" && pickingsEnErreur.length > 0 && pickingsEnCours === 0 && (
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
      ) : onglet === "a_controler" ? (
        <TableauControle
          lignes={aControlerAffiches}
          vide={dispoSeulement ? "Aucun article dispo pour un contrôle." : "Aucun article à contrôler."}
          affairesEnEvidence={(c) => dispos.get(c.ar)?.affaires ?? []}
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
}: {
  lignes: ControleDimension[];
  vide: string;
  /** Affaires à faire ressortir dans la colonne « Affaires » (pièce dispo pour un contrôle). */
  affairesEnEvidence?: (c: ControleDimension) => string[];
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
                {affairesDe(c).length === 0
                  ? "—"
                  : affairesDe(c).map((a, i) => {
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
