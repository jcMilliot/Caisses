import { useState } from "react";
import { lettreCaisse, type CaisseColisageCalculee } from "../domain/colisage";
import { formaterVolumeM3 } from "../domain/calculs";
import { confirmerSuppression } from "../data/confirm";
import type { Colisage } from "../hooks/useColisage";
import type { CaisseColisage } from "../domain/types";
import PastilleColis from "./PastilleColis";

interface Props {
  colisage: Colisage;
  // Nombre de caisses du Picking (copiables).
  nbCaissesInfos: number;
  readOnly: boolean;
  // Dimensions d'une caisse colisage modifiées : report proposé sur sa caisse du Picking (2026-10-27).
  onDimsModifiees: (caisse: CaisseColisage, dims: [number, number, number]) => Promise<void>;
}

// Caisses de l'onglet Colisage (2026-10-14) : copies indépendantes des caisses de l'affaire, où
// sont rangés colis et lettres. Chaque carte compare son remplissage à celui de la caisse copiée
// dans le Picking.
export default function PanneauCaissesColisage({ colisage, nbCaissesInfos, readOnly, onDimsModifiees }: Props) {
  // Pas de « + Nouvelle caisse » ici (retiré le 2026-10-19) : les caisses colisage viennent de la
  // copie des caisses du picking.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {colisage.caisses.length === 0 && nbCaissesInfos > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className="btn btn-sm btn-pastel-blue" disabled={readOnly} onClick={colisage.copierCaisses}>
            Copier les caisses du picking
          </button>
        </div>
      )}

      {colisage.caisses.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
          Aucune caisse colisage. Celles du picking sont copiées à l'arrivée sur l'onglet quand on a la main (sinon : bouton ci-dessus).
        </p>
      ) : (
        colisage.caisses.map((c, rang) => <CarteCaisse key={c.caisse.id} calc={c} rang={rang} colisage={colisage} readOnly={readOnly} onDimsModifiees={onDimsModifiees} />)
      )}
    </div>
  );
}

const COULEUR_NIVEAU = {
  ok: "var(--ok-text)",
  attention: "var(--warn-text)",
  alerte: "var(--danger-text)",
};

function CarteCaisse({
  calc,
  rang,
  colisage,
  readOnly,
  onDimsModifiees,
}: {
  calc: CaisseColisageCalculee;
  rang: number;
  colisage: Colisage;
  readOnly: boolean;
  onDimsModifiees: Props["onDimsModifiees"];
}) {
  const [edition, setEdition] = useState(false);
  const { caisse, source } = calc;
  const pct = (t: number) => `${Math.round(t * 100)}%`;
  const ecart = source ? calc.volumeOccupeM3 - source.volumeOccupeM3 : null;
  const autresGroupes = calc.groupes.filter((g) => g.tag !== lettreCaisse(rang));

  async function supprimer() {
    if (await confirmerSuppression(`Supprimer la caisse colisage « ${caisse.nom || "(sans nom)"} » ? Ce qui y est rangé redevient non rangé (ou proposé).${caisse.source_caisse_id !== null ? " Elle sera recopiée du picking à la prochaine ouverture de l'onglet tant que sa caisse y existe." : ""}`)) {
      await colisage.supprimerCaisse(caisse.id);
    }
  }

  return (
    <div
      className="panel"
      style={{
        padding: "12px 14px",
        border: calc.niveau === "alerte" ? "1px solid var(--danger-border)" : undefined,
        borderLeft: `6px solid ${caisse.couleur}`,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        fontSize: 13,
      }}
    >
      {edition ? (
        <FormulaireCaisse
          nom={caisse.nom}
          dims={[caisse.longueur_mm, caisse.largeur_mm, caisse.hauteur_mm]}
          onValider={async (nom, dims) => {
            const dimsChangees = dims[0] !== caisse.longueur_mm || dims[1] !== caisse.largeur_mm || dims[2] !== caisse.hauteur_mm;
            await colisage.modifierCaisse(caisse.id, nom, dims);
            setEdition(false);
            if (dimsChangees) await onDimsModifiees(caisse, dims);
          }}
          onAnnuler={() => setEdition(false)}
        />
      ) : (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
              {/* Lettre de la caisse (rang), pour distinguer des caisses du même nom. */}
              <span
                title="Lettre de la caisse (ordre des caisses colisage)"
                style={{ minWidth: 24, textAlign: "center", padding: "1px 6px", borderRadius: 6, background: "var(--ok-bg)", color: "var(--ok-text)", border: "1px solid var(--ok-border)", fontSize: 14 }}
              >
                {lettreCaisse(rang)}
              </span>
              {caisse.nom || "(sans nom)"}
            </div>
            <div className="mono" style={{ color: "var(--text-muted)" }}>
              {(caisse.longueur_mm / 1000).toFixed(2)} × {(caisse.largeur_mm / 1000).toFixed(2)} × {(caisse.hauteur_mm / 1000).toFixed(2)} m
            </div>
          </div>
          {!readOnly && (
            <>
              <button className="btn btn-sm" onClick={() => setEdition(true)}>
                Modifier
              </button>
              <button className="btn btn-sm btn-danger" onClick={supprimer}>
                Suppr.
              </button>
            </>
          )}
        </div>
      )}

      {/* Contenu : colis rangés ici. La lettre de la caisse n'est pas répétée (déjà à côté du
          nom, retour du 2026-10-15). */}
      {(calc.groupes.length === 0 || autresGroupes.length > 0) && (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {calc.groupes.length === 0 ? (
          <span style={{ color: "var(--text-faint)" }}>Rien de rangé</span>
        ) : (
          autresGroupes.map((g) => (
            <PastilleColis key={g.tag} tag={g.tag} />
          ))
        )}
      </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle} />
            <th style={{ ...thStyle, textAlign: "right" }}>Picking</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Colisage en cours</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={tdStyle}>Volume occupé</td>
            <td style={tdNum} className="mono">{source ? `${formaterVolumeM3(source.volumeOccupeM3)} m³` : "—"}</td>
            <td style={tdNum} className="mono">{formaterVolumeM3(calc.volumeOccupeM3)} m³</td>
          </tr>
          <tr>
            <td style={tdStyle}>Remplissage</td>
            <td style={{ ...tdNum, fontWeight: 700, color: source ? COULEUR_NIVEAU[source.niveauAlerte] : undefined }} className="mono">
              {source && source.volumeInterneM3 > 0 ? pct(source.tauxRemplissage) : "—"}
            </td>
            <td style={{ ...tdNum, fontWeight: 700, color: COULEUR_NIVEAU[calc.niveau] }} className="mono">
              {calc.volumeInterneM3 > 0 ? pct(calc.taux) : "—"}
            </td>
          </tr>
          <tr>
            <td style={tdStyle}>Poids</td>
            <td style={tdNum} className="mono">{source ? `${source.poidsTotalKg.toFixed(3)} kg` : "—"}</td>
            <td style={tdNum} className="mono">{calc.poidsKg.toFixed(3)} kg</td>
          </tr>
        </tbody>
      </table>
      {ecart !== null && (
        <div style={{ color: "var(--text-muted)" }}>
          Écart de volume :{" "}
          <span className="mono" style={{ fontWeight: 600, color: ecart > 0 ? "var(--warn-text)" : "var(--ok-text)" }}>
            {ecart >= 0 ? "+" : "−"}
            {formaterVolumeM3(Math.abs(ecart))} m³
          </span>
        </div>
      )}
      {!source && <div style={{ color: "var(--text-faint)", fontSize: 12 }}>Pas de caisse correspondante dans le picking.</div>}
      {calc.niveau === "alerte" && (
        <div style={{ color: "var(--danger-text)", fontWeight: 600 }}>⚠ Le contenu dépasse le volume de la caisse.</div>
      )}
    </div>
  );
}

// Nom + dimensions intérieures en mètres (texte local, « 0.5 » ne doit pas être bloqué).
function FormulaireCaisse({
  nom,
  dims,
  onValider,
  onAnnuler,
}: {
  nom: string;
  dims: [number, number, number];
  onValider: (nom: string, dims: [number, number, number]) => Promise<void>;
  onAnnuler: () => void;
}) {
  const [saisieNom, setSaisieNom] = useState(nom);
  const [saisieDims, setSaisieDims] = useState(dims.map((d) => (d === 0 ? "" : String(d / 1000))));
  const mm = (t: string) => {
    const n = Number(t.replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 1000) : 0;
  };
  const valeurs = saisieDims.map(mm) as [number, number, number];
  const complet = valeurs.every((v) => v > 0);

  return (
    <div
      style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && complet) onValider(saisieNom, valeurs);
        if (e.key === "Escape") onAnnuler();
      }}
    >
      <input autoFocus value={saisieNom} onChange={(e) => setSaisieNom(e.target.value)} placeholder="Nom" style={{ font: "inherit", width: 140 }} />
      {["L", "l", "H"].map((libelle, i) => (
        <input
          key={libelle}
          value={saisieDims[i]}
          inputMode="decimal"
          onChange={(e) => setSaisieDims((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
          onFocus={(e) => e.target.select()}
          placeholder={`${libelle} (m)`}
          style={{ font: "inherit", width: 62, background: valeurs[i] > 0 ? undefined : "var(--warn-bg)" }}
        />
      ))}
      <button className="btn btn-sm btn-primary" disabled={!complet} onClick={() => onValider(saisieNom, valeurs)}>
        OK
      </button>
      <button className="btn btn-sm" onClick={onAnnuler}>
        Annuler
      </button>
    </div>
  );
}

const thStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", padding: "2px 4px", textAlign: "left" };
const tdStyle: React.CSSProperties = { padding: "2px 4px", color: "var(--text-muted)" };
const tdNum: React.CSSProperties = { padding: "2px 4px", textAlign: "right", whiteSpace: "nowrap" };
