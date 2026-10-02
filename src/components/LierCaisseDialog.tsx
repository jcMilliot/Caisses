import { useState } from "react";
import { dateIsoVersAffichage } from "../domain/dates";
import { estDemandeCaisseValidee, estDemandeValidee } from "../domain/demandeOptions";
import type { Caisse, Demande, DemandeCaisse } from "../domain/types";

// « Lier… » d'une caisse de Simulations (2026-10-02) : choix de la ligne de Gestion des caisses
// (ligne mère ou caisse détaillée) du même nom d'affaire à laquelle la rattacher. Une fois liée,
// le taux de remplissage s'affiche sur cette ligne quelles que soient les dimensions, et la
// synchro des dimensions vise cette ligne.

export type CibleLien = { demandeId: number | null; demandeCaisseId: number | null };

export default function LierCaisseDialog({
  caisse,
  demandes,
  sousCaisses,
  onLier,
  onClose,
}: {
  caisse: Caisse;
  demandes: Demande[]; // lignes mères du même nom d'affaire
  sousCaisses: DemandeCaisse[]; // caisses détaillées de ces lignes
  onLier: (cible: CibleLien) => Promise<void>;
  onClose: () => void;
}) {
  const cleActuelle = caisse.demande_caisse_id !== null ? `sc:${caisse.demande_caisse_id}` : caisse.demande_id !== null ? `d:${caisse.demande_id}` : "aucune";
  const [choix, setChoix] = useState(cleActuelle);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const dims = (l: number, w: number, h: number) => `${(l / 1000).toFixed(2)} × ${(w / 1000).toFixed(2)} × ${(h / 1000).toFixed(2)} m`;
  const memesDims = (l: number, w: number, h: number) =>
    Math.abs(l - caisse.longueur_mm) <= 1 && Math.abs(w - caisse.largeur_mm) <= 1 && Math.abs(h - caisse.hauteur_mm) <= 1;

  async function valider() {
    const cible: CibleLien =
      choix === "aucune"
        ? { demandeId: null, demandeCaisseId: null }
        : choix.startsWith("sc:")
          ? { demandeId: null, demandeCaisseId: Number(choix.slice(3)) }
          : { demandeId: Number(choix.slice(2)), demandeCaisseId: null };
    setBusy(true);
    setErreur(null);
    try {
      await onLier(cible);
      onClose();
    } catch (e) {
      setErreur(String(e));
      setBusy(false);
    }
  }

  function Option({ cle, titre, detail, l, w, h, retrait }: { cle: string; titre: string; detail: string; l: number; w: number; h: number; retrait?: boolean }) {
    return (
      <label
        className="ligne-filtre-valeur"
        style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px", paddingLeft: retrait ? 34 : 10, borderRadius: 6, cursor: "pointer" }}
      >
        <input type="radio" name="lien" checked={choix === cle} onChange={() => setChoix(cle)} style={{ marginTop: 3 }} />
        <span style={{ flex: 1 }}>
          <span style={{ fontWeight: 600 }}>{titre}</span>
          <span className="mono" style={{ marginLeft: 8, fontSize: 12.5 }}>
            {dims(l, w, h)}
          </span>
          {memesDims(l, w, h) && (
            <span style={{ marginLeft: 8, fontSize: 11.5, color: "var(--ok-text)", fontWeight: 600 }}>mêmes dimensions</span>
          )}
          <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)" }}>{detail}</span>
        </span>
      </label>
    );
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(20, 18, 15, 0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1500 }}
      onClick={busy ? undefined : onClose}
    >
      <div className="panel" onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: "calc(100vw - 32px)", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-lg)" }}>
        <div style={{ padding: "18px 20px 10px" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Lier « {caisse.nom} » à Gestion des caisses</h2>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "6px 0 0" }}>
            Caisse de la simulation : <span className="mono">{dims(caisse.longueur_mm, caisse.largeur_mm, caisse.hauteur_mm)}</span>. Le taux
            de remplissage s'affichera sur la ligne choisie.
          </p>
        </div>
        <div style={{ overflowY: "auto", padding: "4px 10px 10px" }}>
          {demandes.length === 0 ? (
            <p style={{ padding: "8px 10px", fontSize: 13, color: "var(--text-muted)" }}>Aucune ligne de Gestion des caisses ne porte ce nom d'affaire.</p>
          ) : (
            demandes.map((d) => (
              <div key={d.id}>
                <Option
                  cle={`d:${d.id}`}
                  titre={d.affaire}
                  detail={`Picking ${dateIsoVersAffichage(d.date_picking) || "—"} · Qté ${d.quantite}${estDemandeValidee(d) ? " · livrée" : ""}`}
                  l={d.longueur_mm}
                  w={d.largeur_mm}
                  h={d.hauteur_mm}
                />
                {sousCaisses
                  .filter((sc) => sc.demande_id === d.id)
                  .map((sc) => (
                    <Option
                      key={sc.id}
                      cle={`sc:${sc.id}`}
                      titre={sc.nom || "Caisse détaillée"}
                      detail={`Caisse détaillée · Qté ${sc.quantite}${estDemandeCaisseValidee(sc, d) || estDemandeValidee(d) ? " · livrée" : ""}`}
                      l={sc.longueur_mm}
                      w={sc.largeur_mm}
                      h={sc.hauteur_mm}
                      retrait
                    />
                  ))}
              </div>
            ))
          )}
          <label className="ligne-filtre-valeur" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, cursor: "pointer", color: "var(--text-muted)" }}>
            <input type="radio" name="lien" checked={choix === "aucune"} onChange={() => setChoix("aucune")} />
            Aucune (délier la caisse)
          </label>
        </div>
        {erreur && <p style={{ margin: "0 20px 8px", fontSize: 12.5, color: "var(--danger-text)" }}>{erreur}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: "1px solid var(--border)" }}>
          <button className="btn" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={valider} disabled={busy || choix === cleActuelle}>
            Lier
          </button>
        </div>
      </div>
    </div>
  );
}
