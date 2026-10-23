import { useEffect, useMemo, useState } from "react";
import { demandesApi } from "../data/demandes";
import { demandeAlertesApi } from "../data/demandeAlertes";
import { useSectionLock } from "../hooks/useSectionLock";
import LockBanner from "../components/LockBanner";
import PastilleAlerte from "../components/PastilleAlerte";
import { dateIsoVersAffichage } from "../domain/dates";
import { estDemandeValidee } from "../domain/demandeOptions";
import {
  MESSAGE_ALERTE_COMMANDE,
  dateReference,
  datesAnticipees,
  estACommanderUrgent,
  estAchstock,
  libelleDateModifiee,
  type DatesAnticipees,
} from "../domain/caissesACommander";
import type { Demande, DemandeAlerte } from "../domain/types";

interface Props {
  trigramme: string;
}

// Page « Alertes » (2026-10-19) : une ligne par ligne mère de Gestion des caisses non livrée (hors
// ACHSTOCK). Sert quand une expédition est demandée plus tôt que prévu : la date anticipée
// remplace la date de picking pour l'alerte « À commander » et les blocs de l'accueil (cf.
// domain/caissesACommander.ts). Chaque saisie est enregistrée tout de suite. Verrou « alertes ».
export default function AlertesList({ trigramme }: Props) {
  const lock = useSectionLock("alertes", trigramme);
  const readOnly = lock.status !== "held";
  const [demandes, setDemandes] = useState<Demande[] | null>(null);
  const [alertes, setAlertes] = useState<Map<number, DemandeAlerte>>(new Map());
  const [recherche, setRecherche] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  // Dates utilisées pour le tri : recopiées seulement au chargement et en quittant le champ date,
  // pour que la ligne ne change pas de place pendant la saisie.
  const [anticipeesTri, setAnticipeesTri] = useState<DatesAnticipees>(new Map());

  async function reload() {
    const [d, a] = await Promise.all([demandesApi.list(), demandeAlertesApi.list()]);
    setAlertes(new Map(a.map((x) => [x.demande_id, x])));
    setAnticipeesTri(datesAnticipees(a));
    setDemandes(d);
  }

  useEffect(() => {
    reload().catch((e) => setErreur(String(e)));
  }, []);

  const anticipees = useMemo(() => datesAnticipees([...alertes.values()]), [alertes]);

  // Non livrées, hors ACHSTOCK ; date la plus proche en haut (date anticipée / repoussée si
  // saisie, sinon picking), lignes sans date à la fin.
  const lignes = useMemo(() => {
    const r = recherche.trim().toUpperCase();
    return (demandes ?? [])
      .filter((d) => !estDemandeValidee(d) && !estAchstock(d))
      .filter((d) => r === "" || d.affaire.toUpperCase().includes(r))
      .sort((a, b) => {
        const da = dateReference(a, anticipeesTri);
        const db = dateReference(b, anticipeesTri);
        if (!da !== !db) return da ? -1 : 1;
        return da.localeCompare(db) || a.affaire.localeCompare(b.affaire);
      });
  }, [demandes, recherche, anticipeesTri]);

  async function enregistrer(demandeId: number, patch: Partial<Pick<DemandeAlerte, "date_anticipee" | "commentaire">>) {
    const avant = alertes.get(demandeId);
    const apres: DemandeAlerte = {
      demande_id: demandeId,
      date_anticipee: avant?.date_anticipee ?? "",
      commentaire: avant?.commentaire ?? "",
      ...patch,
    };
    setAlertes((m) => new Map(m).set(demandeId, apres));
    try {
      await demandeAlertesApi.set(demandeId, apres.date_anticipee, apres.commentaire, trigramme);
      setErreur(null);
    } catch (e) {
      setErreur(String(e));
      setAlertes((m) => {
        const n = new Map(m);
        if (avant) n.set(demandeId, avant);
        else n.delete(demandeId);
        return n;
      });
    }
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px 48px" }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Alertes</h1>
          <p className="page-subtitle">
            Expédition demandée plus tôt que prévu : la date anticipée remplace la date de picking pour l'alerte « À
            commander » et les caisses à commander / à rapatrier de l'accueil.
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
            if (await lock.prendreLaMain()) await reload().catch((e) => setErreur(String(e)));
          }}
        />
      )}

      {erreur && (
        <div className="panel" style={{ padding: "10px 14px", marginBottom: 12, background: "var(--danger-bg)", color: "var(--danger-text)" }}>
          {erreur}
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <input
          type="search"
          placeholder="Rechercher une affaire"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          style={{ width: 260 }}
        />
      </div>

      {demandes === null ? (
        <p style={{ color: "var(--text-muted)" }}>Chargement…</p>
      ) : lignes.length === 0 ? (
        <div className="panel" style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-muted)" }}>
          <p style={{ margin: 0 }}>Aucune affaire en cours.</p>
        </div>
      ) : (
        <div className="panel" style={{ padding: 0, overflowX: "auto" }}>
          <table className="table-donnees">
            <thead>
              <tr>
                <th style={{ width: 28 }} />
                <th>Affaire</th>
                <th>Date expé initiale</th>
                <th>Date anticipée / repoussée</th>
                <th style={{ width: "50%" }}>Commentaires</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((d) => {
                const alerte = alertes.get(d.id);
                const dateAnticipee = alerte?.date_anticipee ?? "";
                const repoussee = dateAnticipee !== "" && libelleDateModifiee(d.date_picking, dateAnticipee) === "Repoussée";
                return (
                  <tr key={d.id}>
                    <td style={{ textAlign: "center" }}>
                      {estACommanderUrgent(d, anticipees) && <PastilleAlerte titre={MESSAGE_ALERTE_COMMANDE} />}
                    </td>
                    <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{d.affaire}</td>
                    <td className="mono" style={{ whiteSpace: "nowrap" }}>
                      {d.date_picking ? dateIsoVersAffichage(d.date_picking) : <span style={{ color: "var(--text-faint)" }}>—</span>}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <input
                        type="date"
                        value={dateAnticipee}
                        disabled={readOnly}
                        onChange={(e) => enregistrer(d.id, { date_anticipee: e.target.value })}
                        onBlur={() => setAnticipeesTri(anticipees)}
                        style={dateAnticipee ? { borderColor: "var(--warn-text)", fontWeight: 600 } : undefined}
                      />
                      {repoussee && (
                        <div style={{ fontSize: 11.5, color: "var(--warn-text)", marginTop: 2 }}>Repoussée</div>
                      )}
                    </td>
                    <td>
                      <ChampCommentaire
                        valeur={alerte?.commentaire ?? ""}
                        disabled={readOnly}
                        onCommit={(v) => enregistrer(d.id, { commentaire: v })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Texte libre enregistré en quittant le champ (ou Entrée) ; Échap revient au texte enregistré.
function ChampCommentaire({ valeur, disabled, onCommit }: { valeur: string; disabled: boolean; onCommit: (v: string) => void }) {
  const [texte, setTexte] = useState(valeur);
  useEffect(() => setTexte(valeur), [valeur]);
  return (
    <input
      type="text"
      value={texte}
      disabled={disabled}
      placeholder={disabled ? "" : "Commentaire…"}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={() => texte.trim() !== valeur.trim() && onCommit(texte.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setTexte(valeur);
      }}
      style={{ width: "100%" }}
    />
  );
}
