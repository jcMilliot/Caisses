import ArticlesNonCollesBloc from "../components/ArticlesNonCollesBloc";
import { articlesNonCollesApi, type ArticleNonColle } from "../data/articlesNonColles";
import { useSessionAdmin } from "../hooks/useSessionAdmin";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAffaire } from "../hooks/useAffaire";
import { calculerRecapAffaire, calculerCapaciteAffaire, formaterVolumeM3, champsManquants } from "../domain/calculs";
import { estCaisse4C, contrePlaqueParDefaut, estDemandeValidee, memeNomAffaire } from "../domain/demandeOptions";
import type { Article, Caisse, Demande, DemandeCaisse, NewDemandeCaisse } from "../domain/types";
import { usePointerDrag } from "../hooks/usePointerDrag";
import { useSectionLock } from "../hooks/useSectionLock";
import ArticlesTable from "../components/ArticlesTable";
import PasteImportZone from "../components/PasteImportZone";
import CaisseCard from "../components/CaisseCard";
import AssignToDialog from "../components/AssignToDialog";
import LockBanner from "../components/LockBanner";
import ScrollToTopButton from "../components/ScrollToTopButton";
import { confirmerSuppression, confirmerAction } from "../data/confirm";
import { demandeCaisseApi } from "../data/demandeCaisse";
import { demandesApi } from "../data/demandes";
import { caissesApi } from "../data/caisses";

interface Props {
  affaireId: number;
  onBack: () => void;
  trigramme: string;
  estAdmin: boolean;
}

export default function AffaireDetail({ affaireId, onBack, trigramme, estAdmin }: Props) {
  const lock = useSectionLock(`affaire:${affaireId}`, trigramme);
  const readOnly = lock.status !== "held";
  const {
    affaire,
    articles,
    caissesCalculees,
    loading,
    ajouterArticles,
    modifierArticle,
    creerCaisse,
    modifierCaisse,
    supprimerCaisse,
    assignerArticles,
    reload,
  } = useAffaire(affaireId, trigramme);

  const conteneurArticlesRef = useRef<HTMLDivElement>(null);
  // Lignes écartées au collage (AR ne commençant ni par « AR » ni par « ZR »), gardées en base.
  const [nonColles, setNonColles] = useState<ArticleNonColle[]>([]);
  const { assurerSession, dialogue: dialogueSessionAdmin } = useSessionAdmin(trigramme);
  const rechargerNonColles = useCallback(() => {
    articlesNonCollesApi.list(affaireId).then(setNonColles).catch(() => {});
  }, [affaireId]);
  useEffect(() => {
    rechargerNonColles();
  }, [rechargerNonColles]);

  // Action admin sur une ligne non collée : mot de passe demandé si la session n'est pas ouverte.
  async function actionNonColle(action: () => Promise<void>) {
    if (!(await assurerSession())) return;
    try {
      await action();
    } catch (e) {
      await confirmerAction(String(e), "Action impossible");
    }
    rechargerNonColles();
  }
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showPaste, setShowPaste] = useState(false);
  const [collageInitial, setCollageInitial] = useState("");
  const [showAssign, setShowAssign] = useState(false);
  const [caisseRecenteId, setCaisseRecenteId] = useState<number | null>(null);
  const [caissesPosition, setCaissesPosition] = useState<"droite" | "haut">(
    () => (localStorage.getItem("caisses:panelPosition") as "droite" | "haut") ?? "droite",
  );
  // Bascule on/off du surlignage des cellules dont une dimension ou le poids manque (bouton
  // "Manque d'informations" à côté des caisses) — distinct de l'alerte "article > caisse".
  // Repérage des informations manquantes actif par défaut (désactivable d'un clic).
  const [surlignerManques, setSurlignerManques] = useState(true);
  const articlesAvecManque = useMemo(
    () => new Map(articles.map((a) => [a.id, champsManquants(a)] as const).filter(([, c]) => c.length > 0)),
    [articles],
  );
  // Sous-lignes DemandeCaisse liées aux Caisse de cette affaire — pour la synchro retour vers
  // Demandes (modif dims / création / suppression), et la demande parente pour retrouver son nom
  // et ses valeurs par défaut (type envoi, dates, traitement, cde passée) à la création.
  const [demandeCaissesLiees, setDemandeCaissesLiees] = useState<DemandeCaisse[]>([]);
  const [demandeParente, setDemandeParente] = useState<Demande | null>(null);
  const [toutesDemandes, setToutesDemandes] = useState<Demande[]>([]);

  useEffect(() => {
    demandeCaisseApi.listAll().then(setDemandeCaissesLiees);
    demandesApi.list().then((toutes) => {
      setToutesDemandes(toutes);
      // On ne propose la synchro « ajouter/répercuter dans la demande » que si une demande
      // NON validée porte ce nom d'affaire — une demande déjà validée est close, on n'y touche pas.
      setDemandeParente(
        affaire ? toutes.find((d) => memeNomAffaire(d.affaire, affaire.nom) && !estDemandeValidee(d)) ?? null : null,
      );
    });
  }, [affaire?.nom]);

  function togglePosition() {
    setCaissesPosition((prev) => {
      const next = prev === "droite" ? "haut" : "droite";
      localStorage.setItem("caisses:panelPosition", next);
      return next;
    });
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === articles.length ? new Set() : new Set(articles.map((a) => a.id))));
  }

  async function handleAssign(caisseId: number | null) {
    await assignerArticles(Array.from(selectedIds), caisseId);
    setSelectedIds(new Set());
  }

  async function handleUnassignSelection() {
    await assignerArticles(Array.from(selectedIds), null);
    setSelectedIds(new Set());
  }

  async function handleCreateAndAssign(nom: string, l: number, w: number, h: number) {
    const caisse = await creerCaisse(nom, l, w, h, null);
    await assignerArticles(Array.from(selectedIds), caisse.id);
    setSelectedIds(new Set());
  }

  // Articles emportés par un glisser : toute la sélection si l'article attrapé est coché (comme
  // dans l'Explorateur Windows), sinon l'article seul.
  function articlesGlisses(articleId: number) {
    const ids = selectedIds.has(articleId) ? selectedIds : new Set([articleId]);
    return articles.filter((a) => ids.has(a.id));
  }

  async function handleDropArticle(articleId: number, caisseCible: { id: number; nom: string }) {
    if (readOnly) return;
    const glisses = articlesGlisses(articleId);
    const aAssigner = glisses.filter((a) => a.caisse_id !== caisseCible.id);
    if (aAssigner.length === 0) return;
    const aDeplacer = aAssigner.filter((a) => a.caisse_id !== null);
    if (aDeplacer.length > 0) {
      const sources = [...new Set(aDeplacer.map((a) => caissesCalculees.find((c) => c.id === a.caisse_id)?.nom ?? "?"))];
      const message =
        aAssigner.length === 1
          ? `Déplacer cet article de « ${sources[0]} » vers « ${caisseCible.nom} » ?`
          : `${aDeplacer.length} des ${aAssigner.length} articles sont déjà dans une autre caisse (${sources.map((s) => `« ${s} »`).join(", ")}). Les déplacer vers « ${caisseCible.nom} » ?`;
      if (!(await confirmerAction(message, aAssigner.length === 1 ? "Déplacer l'article" : "Déplacer les articles"))) return;
    }
    await assignerArticles(
      aAssigner.map((a) => a.id),
      caisseCible.id,
    );
    // Même convention que « Assigner à → » : la sélection est consommée par l'assignation.
    if (glisses.length > 1) setSelectedIds(new Set());
  }

  const { drag, startDrag } = usePointerDrag((articleId, targetEl) => {
    const caisseEl = targetEl.closest<HTMLElement>("[data-caisse-id]");
    if (!caisseEl) return;
    const caisseId = Number(caisseEl.dataset.caisseId);
    const caisse = caissesCalculees.find((c) => c.id === caisseId);
    if (caisse) handleDropArticle(articleId, caisse);
  });

  const survolCaisseId = (() => {
    if (!drag) return null;
    const el = document.elementFromPoint(drag.x, drag.y);
    const caisseEl = el?.closest<HTMLElement>("[data-caisse-id]");
    return caisseEl ? Number(caisseEl.dataset.caisseId) : null;
  })();

  const articleEnCoursDeDrag = drag ? articles.find((a) => a.id === drag.articleId) : null;

  if (loading && !affaire) {
    return <div style={{ padding: 32 }}>Chargement…</div>;
  }

  if (!affaire) {
    return (
      <div style={{ padding: 32 }}>
        <p>Affaire introuvable.</p>
        <button className="btn" onClick={onBack}>
          ← Retour
        </button>
      </div>
    );
  }

  const panneauCaisses = (
    <section
      style={
        caissesPosition === "droite"
          ? { width: 300, flexShrink: 0, position: "sticky", top: 120, maxHeight: "calc(100vh - 140px)", overflowY: "auto" }
          : { marginBottom: 28 }
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        <h2 style={sectionTitleStyle}>Caisses <span style={sectionCountStyle}>{caissesCalculees.length}</span></h2>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {articlesAvecManque.size > 0 && (
            <button
              className="btn btn-sm btn-pastel-orange"
              title={
                surlignerManques
                  ? "Masquer le surlignage des informations manquantes"
                  : `${articlesAvecManque.size} article(s) avec une dimension ou un poids manquant`
              }
              style={
                surlignerManques
                  ? { color: "var(--danger-text)", borderColor: "var(--danger-border)", background: "var(--danger-bg)" }
                  : undefined
              }
              onClick={() => setSurlignerManques((v) => !v)}
            >
              ⚠ Manque d'informations ({articlesAvecManque.size})
            </button>
          )}
          <button
            className="btn btn-sm"
            title={caissesPosition === "droite" ? "Déplacer en haut" : "Déplacer sur le côté"}
            onClick={togglePosition}
          >
            {caissesPosition === "droite" ? "⇱ En haut" : "⇲ Sur le côté"}
          </button>
          <button
            className="btn btn-sm btn-pastel-blue"
            disabled={readOnly}
            onClick={async () => {
              const nom = `Caisse ${caissesCalculees.length + 1}`;
              const caisse = await creerCaisse(nom, 0, 0, 0, null);
              setCaisseRecenteId(caisse.id);
              if (demandeParente) {
                const confirme = await confirmerAction(
                  `Ajouter une caisse correspondante « ${nom} » dans la demande « ${demandeParente.affaire} » ?`,
                  "Synchroniser avec Demandes",
                );
                if (confirme) {
                  const nouvelle: NewDemandeCaisse = {
                    demande_id: demandeParente.id,
                    nom,
                    type_envoi_caisse: demandeParente.type_envoi_caisse,
                    type_ouverture: "",
                    stock: "",
                    date_picking: demandeParente.date_picking,
                    date_demandee_s2c: demandeParente.date_demandee_s2c,
                    traitement: demandeParente.traitement,
                    quantite: 1,
                    moteurs: "",
                    module_lineaire: "",
                    terminaux: "",
                    informations_supp: "",
                    observations: "",
                    cde_passee_affaire: demandeParente.cde_passee_affaire,
                    cde_passee_achat_stock: demandeParente.cde_passee_achat_stock,
                    longueur_mm: 0,
                    largeur_mm: 0,
                    hauteur_mm: 0,
                    poids_kg: 0,
                    contre_plaque: contrePlaqueParDefaut(demandeParente.type_envoi_caisse),
                    caisse_stock_id: null,
                  };
                  const sousLigneCreee = await demandeCaisseApi.create(nouvelle, trigramme);
                  await caissesApi.linkDemandeCaisse(caisse.id, sousLigneCreee.id, trigramme);
                  setDemandeCaissesLiees((prev) => [...prev, sousLigneCreee]);
                  await reload();
                }
              }
            }}
          >
            + Nouvelle caisse
          </button>
        </div>
      </div>

      {caissesCalculees.length === 0 ? (
        <div className="panel" style={{ padding: "24px 18px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
          Aucune caisse.
          <br />
          Créez-en une, ou assignez des articles pour en créer une à la volée.
        </div>
      ) : (
        <div
          style={
            caissesPosition === "droite"
              ? { display: "flex", flexDirection: "column", gap: 14 }
              : { display: "flex", flexWrap: "wrap", gap: 14 }
          }
        >
          {caissesCalculees.map((c) => (
            <CaisseCard
              key={c.id}
              caisse={c}
              autoEdit={c.id === caisseRecenteId}
              onUpdate={async (nom, l, w, h, seuil, couleur) => {
                setCaisseRecenteId(null);
                const dimsChangees = l !== c.longueur_mm || w !== c.largeur_mm || h !== c.hauteur_mm;
                if (dimsChangees) {
                  // Cible côté Demandes : lien explicite (demande_caisse_id / demande_id) en
                  // priorité, puis correspondance par nom d'affaire pour la caisse mère.
                  const demandeMereCible =
                    (c.demande_id !== null && toutesDemandes.find((d) => d.id === c.demande_id)) ||
                    (c.demande_caisse_id === null && demandeParente
                      ? demandeParente
                      : null);
                  if (c.demande_caisse_id !== null) {
                    const confirme = await confirmerAction(
                      `Répercuter ces nouvelles dimensions sur la demande d'origine « ${c.nom} » ?`,
                      "Synchroniser avec Demandes",
                    );
                    if (confirme) {
                      const sousLigne = demandeCaissesLiees.find((sl) => sl.id === c.demande_caisse_id);
                      if (sousLigne) {
                        const { id: _id, ordre: _ordre, ...base } = sousLigne;
                        await demandeCaisseApi.update(sousLigne.id, { ...base, longueur_mm: l, largeur_mm: w, hauteur_mm: h }, trigramme);
                      }
                    }
                  } else if (demandeMereCible) {
                    const confirme = await confirmerAction(
                      `Répercuter ces nouvelles dimensions sur la demande « ${demandeMereCible.affaire} » ?`,
                      "Synchroniser avec Demandes",
                    );
                    if (confirme) {
                      const { id: _id, ordre: _ordre, validee: _v, ...base } = demandeMereCible;
                      await demandesApi.update(
                        demandeMereCible.id,
                        { ...base, longueur_mm: l, largeur_mm: w, hauteur_mm: h },
                        trigramme,
                      );
                    }
                  }
                }
                return modifierCaisse(c.id, nom, l, w, h, seuil, couleur, c.type_envoi_caisse);
              }}
              onDelete={async () => {
                if (readOnly) return;
                if (!(await confirmerSuppression(`Supprimer la caisse « ${c.nom} » ? Ses articles repasseront en non-assigné.`))) return;
                if (c.demande_caisse_id !== null) {
                  const confirmeSync = await confirmerAction(
                    `Supprimer aussi la caisse détaillée correspondante dans la demande « ${demandeParente?.affaire ?? affaire.nom} » ?`,
                    "Synchroniser avec Demandes",
                  );
                  if (confirmeSync) await demandeCaisseApi.delete(c.demande_caisse_id, trigramme);
                }
                await supprimerCaisse(c.id);
              }}
              dragActif={!!drag}
              survolee={survolCaisseId === c.id}
              readOnly={readOnly}
              dimensionsReadOnly={c.caisse_stock_id !== null}
            />
          ))}
        </div>
      )}
    </section>
  );

  const panneauArticles = (
    <section style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h2 style={sectionTitleStyle}>Articles <span style={sectionCountStyle}>{articles.length}</span></h2>
        <div style={{ display: "flex", gap: 8 }}>
          {selectedIds.size > 0 && !readOnly && (
            <>
              <button className="btn btn-sm btn-primary" onClick={() => setShowAssign(true)}>
                Assigner {selectedIds.size} article(s) →
              </button>
              {articles.some((a) => selectedIds.has(a.id) && a.caisse_id !== null) && (
                <button className="btn btn-sm" onClick={handleUnassignSelection}>
                  Désassigner la sélection
                </button>
              )}
            </>
          )}
          <button className="btn btn-sm" onClick={() => setShowPaste(true)} disabled={readOnly}>
            Coller depuis Excel
          </button>
        </div>
      </div>

      <div ref={conteneurArticlesRef} className="panel" style={{ padding: "0 12px", overflow: "auto", maxHeight: "calc(100vh - 190px)" }}>
        <ArticlesTable
          affaireId={affaireId}
          articles={articles}
          caisses={caissesCalculees}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onUpdate={modifierArticle}
          onStartDrag={startDrag}
          onCollageMultiCellules={
            readOnly
              ? undefined
              : (texte) => {
                  setCollageInitial(texte);
                  setShowPaste(true);
                }
          }
          readOnly={readOnly}
          champsManquantsParArticle={surlignerManques ? articlesAvecManque : undefined}
        />
      </div>

      <ArticlesNonCollesBloc
        lignes={nonColles}
        estAdmin={estAdmin}
        readOnly={readOnly}
        onModifier={(id, article) => actionNonColle(() => articlesNonCollesApi.update(id, article, trigramme))}
        onIntegrer={(id) =>
          actionNonColle(async () => {
            await articlesNonCollesApi.integrer(id, trigramme);
            await reload();
          })
        }
        onSupprimer={async (id) => {
          if (!(await confirmerSuppression("Supprimer définitivement cette ligne non collée ?"))) return;
          await actionNonColle(() => articlesNonCollesApi.delete(id, trigramme));
        }}
      />

      <ScrollToTopButton cible={conteneurArticlesRef} />
    </section>
  );

  return (
    <div style={{ maxWidth: 1600, margin: "0 auto", padding: "28px 24px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24, paddingBottom: 18, borderBottom: "1px solid var(--border)" }}>
        <button className="btn btn-sm" onClick={onBack}>
          ← Affaires
        </button>
        <div style={{ width: 1, height: 20, background: "var(--border-strong)" }} />
        <h1 style={{ fontSize: 21, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>{affaire.nom}</h1>
        <span
          title="Seuil de remplissage au-delà duquel une caisse passe en alerte — réglé dans l'Admin"
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "var(--warn-text)",
            background: "var(--warn-bg)",
            border: "1px solid var(--warn-border)",
            padding: "3px 12px",
            borderRadius: 999,
          }}
        >
          Seuil d'alerte {affaire.seuil_defaut}%
        </span>
      </div>

      <RecapAffaireBandeau
        articles={articles}
        caisses={caissesCalculees}
        seuilDefaut={affaire.seuil_defaut}
        aUneCaisse4C={caissesCalculees.some((c) => estCaisse4C(c.type_envoi_caisse))}
      />

      {(readOnly || lock.incomingRequest) && (
        <LockBanner
          lectureSeule={lock.lectureSeule}
          holderTrigramme={lock.holderTrigramme}
          incomingRequest={lock.incomingRequest}
          outgoingRequestStatus={lock.outgoingRequestStatus}
          onRequestPen={lock.requestPen}
          onApprove={lock.approveRequest}
          onDeny={lock.denyRequest}
        />
      )}

      {caissesPosition === "haut" ? (
        <>
          {panneauCaisses}
          {panneauArticles}
        </>
      ) : (
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
          {panneauArticles}
          {panneauCaisses}
        </div>
      )}

      {showPaste && (
        <PasteImportZone
          texteInitial={collageInitial}
          onImport={async (arts) => {
            await ajouterArticles(arts);
          }}
          onRefuses={async (lignes) => {
            await articlesNonCollesApi.create(affaireId, lignes, trigramme);
            rechargerNonColles();
          }}
          onClose={() => {
            setShowPaste(false);
            setCollageInitial("");
          }}
        />
      )}

      {dialogueSessionAdmin}

      {showAssign && (
        <AssignToDialog
          caisses={caissesCalculees}
          nbSelectionnes={selectedIds.size}
          onAssign={handleAssign}
          onCreateAndAssign={handleCreateAndAssign}
          onClose={() => setShowAssign(false)}
        />
      )}

      {drag && articleEnCoursDeDrag && (
        <div
          style={{
            position: "fixed",
            left: drag.x + 12,
            top: drag.y + 12,
            zIndex: 200,
            pointerEvents: "none",
            background: "var(--bg-panel)",
            border: "1px solid var(--accent)",
            borderRadius: "var(--radius)",
            padding: "6px 10px",
            fontSize: 12.5,
            boxShadow: "0 6px 20px rgba(0,0,0,0.2)",
            maxWidth: 220,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {articlesGlisses(articleEnCoursDeDrag.id).length > 1
            ? `${articlesGlisses(articleEnCoursDeDrag.id).length} articles`
            : articleEnCoursDeDrag.ar || articleEnCoursDeDrag.reference || "Article"}
          {survolCaisseId && (
            <span style={{ color: "var(--accent)", marginLeft: 6 }}>
              → {caissesCalculees.find((c) => c.id === survolCaisseId)?.nom}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function RecapAffaireBandeau({
  articles,
  caisses,
  seuilDefaut,
  aUneCaisse4C,
}: {
  articles: Article[];
  caisses: Caisse[];
  seuilDefaut: number;
  aUneCaisse4C: boolean;
}) {
  const recap = useMemo(() => calculerRecapAffaire(articles), [articles]);
  const capacite = useMemo(
    () => calculerCapaciteAffaire(articles, caisses, seuilDefaut),
    [articles, caisses, seuilDefaut],
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        marginBottom: 24,
        padding: "12px 18px",
        background: "var(--bg-panel-alt)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        fontSize: 13,
        // Se cale juste sous la barre de navigation principale (sticky, ~46px) pendant le scroll.
        position: "sticky",
        top: 46,
        zIndex: 20,
      }}
    >
      <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
        <RecapValeur label="Longueur max" valeur={`${(recap.dim1MaxMm / 1000).toFixed(2)} m`} />
        <RecapValeur label="Largeur max" valeur={`${(recap.dim2MaxMm / 1000).toFixed(2)} m`} />
        <RecapValeur label="Hauteur max" valeur={`${(recap.dim3MaxMm / 1000).toFixed(2)} m`} />
        <div style={{ width: 1, height: 24, background: "var(--border-strong)" }} />
        <RecapValeur label="Volume total" valeur={`${formaterVolumeM3(recap.volumeTotalM3)} m³`} />
        <RecapValeur label="Poids total" valeur={`${recap.poidsTotalKg.toFixed(3)} kg`} />
        {aUneCaisse4C && (
          <>
            <div style={{ width: 1, height: 24, background: "var(--border-strong)" }} />
            <RecapValeur label="Mousse (4C)" valeur="0.025 m / face" />
          </>
        )}
      </div>

      {capacite.depasse && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 10px",
            background: "var(--danger-bg)",
            border: "1px solid var(--danger-border)",
            color: "var(--danger-text)",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          ⚠ Le volume total de l'affaire ({formaterVolumeM3(recap.volumeTotalM3)} m³) ne peut être
          contenu dans {caisses.length <= 1 ? "la caisse" : "les caisses"} (capacité
          disponible : {formaterVolumeM3(capacite.capaciteUtileM3)} m³, seuil de remplissage
          appliqué : {seuilDefaut}%). Veuillez vérifier les dimensions.
        </div>
      )}
    </div>
  );
}

function RecapValeur({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)" }}>
        {label}
      </span>
      <span className="mono" style={{ fontWeight: 700 }}>
        {valeur}
      </span>
    </div>
  );
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  margin: 0,
  letterSpacing: "0.02em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const sectionCountStyle: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 700,
  color: "var(--text)",
  background: "var(--bg-panel-alt)",
  border: "1px solid var(--border)",
  borderRadius: 999,
  padding: "1px 8px",
  letterSpacing: 0,
  textTransform: "none",
};
