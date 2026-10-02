import { useEffect, useMemo, useRef, useState } from "react";
import { demandesApi } from "../data/demandes";
import { demandeCaisseApi } from "../data/demandeCaisse";
import { useSectionLock } from "../hooks/useSectionLock";
import LockBanner from "../components/LockBanner";
import AfficheCaisseCard, { type AfficheCaisseCardHandle } from "../components/AfficheCaisseCard";
import {
  construireAffiches,
  categorieEnvoi,
  texteIntroductionMail,
  mettreEnEvidenceS2C,
  MENTION_SOUDURE_4C,
  demandesAchstockAEnvoyer,
  rendreBlocAchstock,
} from "../domain/affiches";
import type { AfficheCaisse, CategorieEnvoi } from "../domain/affiches";
import type { Demande, DemandeCaisse } from "../domain/types";

interface Props {
  trigramme: string;
}

export default function DemandesAchatsList({ trigramme }: Props) {
  const lock = useSectionLock("achats", trigramme);
  const readOnly = lock.status !== "held";
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [demandeCaisses, setDemandeCaisses] = useState<DemandeCaisse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [copieGroupee, setCopieGroupee] = useState(false);
  const cardsRef = useRef<Map<string, AfficheCaisseCardHandle>>(new Map());

  async function reload() {
    setLoading(true);
    try {
      const [d, dc] = await Promise.all([demandesApi.list(), demandeCaisseApi.listAll()]);
      setDemandes(d);
      setDemandeCaisses(dc);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const affiches = useMemo(
    () => construireAffiches(demandes, demandeCaisses),
    [demandes, demandeCaisses],
  );

  // ACHSTOCK n'a pas de carte d'affiche (pas de dimensions à fabriquer) — juste une ligne
  // texte par référence AR_CAISS_XXXXX, avec ses propres clés de sélection dans le même Set
  // que les affiches classiques pour partager "Tout sélectionner"/"Copier la sélection".
  const lignesAchstock = useMemo(
    () => demandesAchstockAEnvoyer(demandes),
    [demandes],
  );
  const clesAchstock = useMemo(() => lignesAchstock.map((d) => `achstock:${d.id}`), [lignesAchstock]);
  const toutesLesCles = useMemo(() => [...affiches.map((a) => a.cle), ...clesAchstock], [affiches, clesAchstock]);

  async function handleContrePlaqueChange(demandeId: number, demandeCaisseId: number | null, valeur: boolean) {
    if (demandeCaisseId === null) {
      const d = demandes.find((x) => x.id === demandeId);
      if (!d) return;
      await demandesApi.update(d.id, { ...toNewDemande(d), contre_plaque: valeur }, trigramme);
      setDemandes((prev) => prev.map((x) => (x.id === demandeId ? { ...x, contre_plaque: valeur } : x)));
    } else {
      const sc = demandeCaisses.find((x) => x.id === demandeCaisseId);
      if (!sc) return;
      await demandeCaisseApi.update(sc.id, { ...toNewDemandeCaisse(sc), contre_plaque: valeur }, trigramme);
      setDemandeCaisses((prev) => prev.map((x) => (x.id === demandeCaisseId ? { ...x, contre_plaque: valeur } : x)));
    }
  }

  function handleToggleSelection(cle: string, valeur: boolean) {
    setSelection((prev) => {
      const next = new Set(prev);
      if (valeur) next.add(cle);
      else next.delete(cle);
      return next;
    });
  }

  function toutSelectionner() {
    setSelection(new Set(toutesLesCles));
  }

  function toutDeselectionner() {
    setSelection(new Set());
  }

  async function handleCopierSelection() {
    const affichesSelectionnees = affiches.filter((a) => selection.has(a.cle));
    const achstockSelectionnees = lignesAchstock.filter((d) => selection.has(`achstock:${d.id}`));
    if (affichesSelectionnees.length === 0 && achstockSelectionnees.length === 0) return;
    setCopieGroupee(true);
    try {
      // Regroupées par type de caisse (standard/4B/4C), ordre fixe : les 4C (avec la mention
      // soudure/fermeture juste avant) toujours en dernier. Un seul "Bonjour, merci de..." en
      // tête pour l'ensemble de la sélection.
      const ORDRE_CATEGORIES: CategorieEnvoi[] = ["standard", "4b", "4c"];
      const groupes = new Map<CategorieEnvoi, AfficheCaisse[]>();
      for (const a of affichesSelectionnees) {
        const cat = categorieEnvoi(a.typeEnvoiCaisse);
        const groupe = groupes.get(cat) ?? [];
        groupe.push(a);
        groupes.set(cat, groupe);
      }

      const versHtml = (t: string) =>
        t
          .split("\n")
          .map((ligne) => `<div>${ligne ? mettreEnEvidenceS2C(ligne) : "&nbsp;"}</div>`)
          .join("");

      const intro = texteIntroductionMail(affichesSelectionnees.length + achstockSelectionnees.length);
      // text/html : intro + mention 4C + images data: URI + bloc ACHSTOCK (fonctionne sur les
      // clients mail qui acceptent les images inline en data:). text/plain : fallback.
      const blocsHtml: string[] = [versHtml(intro)];
      const blocsTexte: string[] = [intro];
      let auMoinsUnBloc = false;

      for (const cat of ORDRE_CATEGORIES) {
        const groupe = groupes.get(cat);
        if (!groupe) continue;
        const images: string[] = [];
        for (const a of groupe) {
          const handle = cardsRef.current.get(a.cle);
          if (!handle) continue;
          const blob = await handle.capturerPng();
          if (!blob) continue;
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          images.push(dataUrl);
        }
        if (images.length === 0) continue;
        auMoinsUnBloc = true;

        if (cat === "4c") {
          blocsHtml.push(versHtml(MENTION_SOUDURE_4C));
          blocsTexte.push(MENTION_SOUDURE_4C);
        }
        const imagesHtml = images
          .map((src) => `<img src="${src}" alt="" style="display:block;max-width:100%;margin:0 0 16px;" />`)
          .join("\n");
        blocsHtml.push(`<div style="margin:12px 0 16px;">${imagesHtml}</div>`);
        blocsTexte.push(`${images.length} affiche(s) — voir les images ci-dessus.`);
      }

      // ACHSTOCK toujours en dernier. Précédé de "Ainsi que :" s'il y a déjà des affiches.
      if (achstockSelectionnees.length > 0) {
        if (auMoinsUnBloc) {
          blocsHtml.push(versHtml("Ainsi que :"));
          blocsTexte.push("Ainsi que :");
        }
        auMoinsUnBloc = true;
        const blocsAchstockTexte = achstockSelectionnees.map((d) => rendreBlocAchstock(d));
        blocsHtml.push(blocsAchstockTexte.map((b) => `<div style="margin:0 0 14px;">${versHtml(b)}</div>`).join("\n"));
        blocsTexte.push(blocsAchstockTexte.join("\n\n"));
      }

      if (!auMoinsUnBloc) return;

      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([blocsHtml.join("\n")], { type: "text/html" }),
          "text/plain": new Blob([blocsTexte.join("\n\n")], { type: "text/plain" }),
        }),
      ]);
    } finally {
      setCopieGroupee(false);
    }
  }

  return (
    <div style={{ maxWidth: 1600, margin: "0 auto", padding: "0 24px 48px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          padding: "28px 0 14px",
          position: "sticky",
          top: "calc(var(--nav-h) - 1px)",
          zIndex: 40,
          background: "var(--bg)",
        }}
      >
        <div>
          <h1 className="page-title">Affiche(s) à envoyer</h1>
        </div>

        {toutesLesCles.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
              {selection.size > 0 ? `${selection.size} sélectionnée(s)` : ""}
            </span>
            <button className="btn btn-sm" onClick={toutSelectionner} disabled={selection.size === toutesLesCles.length}>
              Tout sélectionner
            </button>
            <button className="btn btn-sm" onClick={toutDeselectionner} disabled={selection.size === 0}>
              Tout désélectionner
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleCopierSelection}
              disabled={selection.size === 0 || copieGroupee}
            >
              {copieGroupee ? "Copie en cours…" : `Copier la sélection (${selection.size})`}
            </button>
          </div>
        )}
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
        />
      )}

      <p style={{ fontSize: 13.5, color: "var(--text-muted)", marginTop: 0, marginBottom: 20 }}>
        Une affiche est générée automatiquement pour chaque caisse traitée (OK pour être commandée) sur le tableau de
        gestion des caisses.
      </p>

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Chargement…</p>
      ) : toutesLesCles.length === 0 ? (
        <div className="panel" style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-muted)" }}>
          <p style={{ margin: 0 }}>Aucune affiche à envoyer pour l'instant.</p>
        </div>
      ) : (
        <>
          {affiches.map((a) => (
            <AfficheCaisseCard
              key={a.cle}
              ref={(handle) => {
                if (handle) cardsRef.current.set(a.cle, handle);
                else cardsRef.current.delete(a.cle);
              }}
              affiche={a}
              readOnly={readOnly}
              selectionnee={selection.has(a.cle)}
              onToggleSelection={(v) => handleToggleSelection(a.cle, v)}
              onContrePlaqueChange={(v) => handleContrePlaqueChange(a.demandeId, a.demandeCaisseId, v)}
            />
          ))}

          {lignesAchstock.length > 0 && (
            <div className="panel" style={{ padding: 16, marginBottom: 18 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 10 }}>
                ACHSTOCK — caisses en stock à commander
              </div>
              {lignesAchstock.map((d) => {
                const cle = `achstock:${d.id}`;
                return (
                  <label
                    key={cle}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", cursor: "pointer", fontSize: 13 }}
                  >
                    <input type="checkbox" checked={selection.has(cle)} onChange={(e) => handleToggleSelection(cle, e.target.checked)} />
                    <span style={{ fontWeight: 600 }}>{d.stock.trim() || "—"}</span>
                    <span style={{ color: "var(--text-muted)" }}>
                      Qté {d.quantite} · {d.affaire}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function toNewDemande(d: Demande) {
  const { id, validee, ordre, ...reste } = d;
  return reste;
}

function toNewDemandeCaisse(c: DemandeCaisse) {
  const { id, ordre, ...reste } = c;
  return reste;
}
