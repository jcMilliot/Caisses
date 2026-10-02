import { useEffect } from "react";
import { demandesApi } from "../data/demandes";
import { alerteApi } from "../data/alerte";
import { caisseStockApi } from "../data/caisseStock";
import { affairesACommanderUrgentes } from "../domain/caissesACommander";
import { caissesStockACommander } from "../domain/caisseStock";

// Pastille rouge sur l'icône de la barre des tâches tant qu'au moins une affaire est en alerte
// « à Commander » (cf. estACommanderUrgent) ou qu'une caisse AR_CAISS_ gérée est au seuil de
// réappro (cf. estStockACommander, 2026-10-02). Recalculée au démarrage, à chaque changement
// d'écran (ex. retour de Gestion des caisses après avoir coché la case) et toutes les 2 min
// (modifications faites sur un autre poste, passage d'un jour à l'autre).
const INTERVALLE_MS = 2 * 60 * 1000;

export function useAlerteCommande(pret: boolean, declencheur: unknown) {
  useEffect(() => {
    if (!pret) return;
    let annule = false;
    const verifier = () => {
      Promise.all([demandesApi.list(), caisseStockApi.list()])
        .then(([demandes, caissesStock]) => {
          if (annule) return;
          const alerte = affairesACommanderUrgentes(demandes).length > 0 || caissesStockACommander(caissesStock).length > 0;
          return alerteApi.definirBarreDesTaches(alerte);
        })
        .catch((e) => console.warn("Alerte à commander :", e));
    };
    verifier();
    const periodique = window.setInterval(verifier, INTERVALLE_MS);
    return () => {
      annule = true;
      window.clearInterval(periodique);
    };
  }, [pret, declencheur]);
}
