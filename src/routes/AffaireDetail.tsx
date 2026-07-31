import { useState } from "react";
import { useAffaire } from "../hooks/useAffaire";
import { usePointerDrag } from "../hooks/usePointerDrag";
import { useSectionLock } from "../hooks/useSectionLock";
import ArticlesTable from "../components/ArticlesTable";
import PasteImportZone from "../components/PasteImportZone";
import CaisseCard from "../components/CaisseCard";
import AssignToDialog from "../components/AssignToDialog";
import LockBanner from "../components/LockBanner";
import { confirmerSuppression, confirmerAction } from "../data/confirm";

interface Props {
  affaireId: number;
  onBack: () => void;
  trigramme: string;
}

export default function AffaireDetail({ affaireId, onBack, trigramme }: Props) {
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
  } = useAffaire(affaireId, trigramme);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showPaste, setShowPaste] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [caisseRecenteId, setCaisseRecenteId] = useState<number | null>(null);
  const [caissesPosition, setCaissesPosition] = useState<"droite" | "haut">(
    () => (localStorage.getItem("caisses:panelPosition") as "droite" | "haut") ?? "droite",
  );

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

  async function handleDropArticle(articleId: number, caisseCible: { id: number; nom: string }) {
    if (readOnly) return;
    const article = articles.find((a) => a.id === articleId);
    if (!article || article.caisse_id === caisseCible.id) return;
    if (article.caisse_id !== null) {
      const caisseSource = caissesCalculees.find((c) => c.id === article.caisse_id);
      const confirme = await confirmerAction(
        `Déplacer cet article de « ${caisseSource?.nom ?? "?"} » vers « ${caisseCible.nom} » ?`,
        "Déplacer l'article",
      );
      if (!confirme) return;
    }
    await assignerArticles([articleId], caisseCible.id);
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
          ? { width: 300, flexShrink: 0, position: "sticky", top: 24, maxHeight: "calc(100vh - 48px)", overflowY: "auto" }
          : { marginBottom: 28 }
      }
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h2 style={sectionTitleStyle}>Caisses <span style={sectionCountStyle}>{caissesCalculees.length}</span></h2>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className="btn btn-sm"
            title={caissesPosition === "droite" ? "Déplacer en haut" : "Déplacer sur le côté"}
            onClick={togglePosition}
          >
            {caissesPosition === "droite" ? "⇱ En haut" : "⇲ Sur le côté"}
          </button>
          <button
            className="btn btn-sm"
            disabled={readOnly}
            onClick={async () => {
              const caisse = await creerCaisse(`Caisse ${caissesCalculees.length + 1}`, 0, 0, 0, null);
              setCaisseRecenteId(caisse.id);
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
              onUpdate={(nom, l, w, h, seuil, couleur) => {
                setCaisseRecenteId(null);
                return modifierCaisse(c.id, nom, l, w, h, seuil, couleur);
              }}
              onDelete={async () => {
                if (readOnly) return;
                if (await confirmerSuppression(`Supprimer la caisse « ${c.nom} » ? Ses articles repasseront en non-assigné.`)) {
                  await supprimerCaisse(c.id);
                }
              }}
              dragActif={!!drag}
              survolee={survolCaisseId === c.id}
              readOnly={readOnly}
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

      <div className="panel" style={{ padding: "4px 12px", overflowX: "auto" }}>
        <ArticlesTable
          affaireId={affaireId}
          articles={articles}
          caisses={caissesCalculees}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onUpdate={modifierArticle}
          onStartDrag={startDrag}
          readOnly={readOnly}
        />
      </div>
    </section>
  );

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "28px 24px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24, paddingBottom: 18, borderBottom: "1px solid var(--border)" }}>
        <button className="btn btn-sm" onClick={onBack}>
          ← Affaires
        </button>
        <div style={{ width: 1, height: 20, background: "var(--border-strong)" }} />
        <h1 style={{ fontSize: 21, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>{affaire.nom}</h1>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: "var(--accent)",
            background: "var(--accent-soft)",
            padding: "3px 9px",
            borderRadius: 999,
          }}
        >
          seuil {affaire.seuil_defaut}%
        </span>
      </div>

      {(readOnly || lock.incomingRequest) && (
        <LockBanner
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
          onImport={async (arts) => {
            await ajouterArticles(arts);
          }}
          onClose={() => setShowPaste(false)}
        />
      )}

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
          {articleEnCoursDeDrag.ar || articleEnCoursDeDrag.reference || "Article"}
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
