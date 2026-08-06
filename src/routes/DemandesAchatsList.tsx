import { useEffect, useMemo, useRef, useState } from "react";
import { demandesApi } from "../data/demandes";
import { demandeCaisseApi } from "../data/demandeCaisse";
import { locksApi } from "../data/locks";
import { useSectionLock } from "../hooks/useSectionLock";
import LockBanner from "../components/LockBanner";
import AfficheCaisseCard, { type AfficheCaisseCardHandle } from "../components/AfficheCaisseCard";
import { construireAffiches } from "../domain/affiches";
import type { Demande, DemandeCaisse } from "../domain/types";

interface Props {
  trigramme: string;
}

export default function DemandesAchatsList({ trigramme }: Props) {
  const lock = useSectionLock("achats", trigramme);
  const readOnly = lock.status !== "held";
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [demandeCaisses, setDemandeCaisses] = useState<DemandeCaisse[]>([]);
  const [trigrammesConnus, setTrigrammesConnus] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [envoyees, setEnvoyees] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [copieGroupee, setCopieGroupee] = useState(false);
  const cardsRef = useRef<Map<string, AfficheCaisseCardHandle>>(new Map());

  async function reload() {
    setLoading(true);
    try {
      const [d, dc, locks] = await Promise.all([demandesApi.list(), demandeCaisseApi.listAll(), locksApi.list()]);
      setDemandes(d);
      setDemandeCaisses(dc);
      const set = new Set<string>();
      for (const l of locks) {
        if (l.titulaire) set.add(l.titulaire);
        if (l.demandeur) set.add(l.demandeur);
      }
      set.add(trigramme);
      setTrigrammesConnus([...set].sort());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const affiches = useMemo(
    () => construireAffiches(demandes, demandeCaisses).filter((a) => !envoyees.has(a.cle)),
    [demandes, demandeCaisses, envoyees],
  );

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

  function handleMarqueeEnvoyee(cle: string) {
    setEnvoyees((prev) => new Set(prev).add(cle));
    setSelection((prev) => {
      if (!prev.has(cle)) return prev;
      const next = new Set(prev);
      next.delete(cle);
      return next;
    });
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
    setSelection(new Set(affiches.map((a) => a.cle)));
  }

  function toutDeselectionner() {
    setSelection(new Set());
  }

  function handleMarqueeEnvoyeesSelection() {
    setEnvoyees((prev) => {
      const next = new Set(prev);
      for (const cle of selection) next.add(cle);
      return next;
    });
    setSelection(new Set());
  }

  async function handleCopierSelection() {
    const clesSelectionnees = affiches.filter((a) => selection.has(a.cle)).map((a) => a.cle);
    if (clesSelectionnees.length === 0) return;
    setCopieGroupee(true);
    try {
      const images: string[] = [];
      for (const cle of clesSelectionnees) {
        const handle = cardsRef.current.get(cle);
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
      if (images.length === 0) return;

      const html = images
        .map((src) => `<img src="${src}" alt="" style="display:block;max-width:100%;margin:0 0 16px;" />`)
        .join("\n");
      const texte = `${images.length} affiche(s) — voir les images ci-dessus.`;

      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([texte], { type: "text/plain" }),
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
          padding: "24px 0 16px",
          position: "sticky",
          top: 45,
          zIndex: 40,
          background: "var(--bg)",
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 4 }}>
            Demandes d'achats
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>Affiches à envoyer</h1>
        </div>

        {affiches.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
              {selection.size > 0 ? `${selection.size} sélectionnée(s)` : ""}
            </span>
            <button className="btn btn-sm" onClick={toutSelectionner} disabled={selection.size === affiches.length}>
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
            <button
              className="btn btn-sm"
              onClick={handleMarqueeEnvoyeesSelection}
              disabled={selection.size === 0 || readOnly}
            >
              Marquées comme envoyées
            </button>
          </div>
        )}
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

      <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 0, marginBottom: 24 }}>
        Une affiche est générée automatiquement pour chaque caisse (mère ou sous-caisse) d'une demande cochée
        « OK pour passer cde » dans l'onglet Demandes. Cochez « Marquée comme envoyée » une fois l'email parti —
        elle réapparaîtra si la case « OK pour passer cde » reste cochée et que la page est rechargée.
      </p>

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Chargement…</p>
      ) : affiches.length === 0 ? (
        <div className="panel" style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-muted)" }}>
          <p style={{ margin: 0 }}>Aucune affiche à envoyer pour l'instant.</p>
        </div>
      ) : (
        affiches.map((a) => (
          <AfficheCaisseCard
            key={a.cle}
            ref={(handle) => {
              if (handle) cardsRef.current.set(a.cle, handle);
              else cardsRef.current.delete(a.cle);
            }}
            affiche={a}
            trigrammesConnus={trigrammesConnus}
            trigrammeParDefaut={trigramme}
            readOnly={readOnly}
            selectionnee={selection.has(a.cle)}
            onToggleSelection={(v) => handleToggleSelection(a.cle, v)}
            onContrePlaqueChange={(v) => handleContrePlaqueChange(a.demandeId, a.demandeCaisseId, v)}
            onMarqueeEnvoyee={() => handleMarqueeEnvoyee(a.cle)}
          />
        ))
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
