import { useEffect } from "react";
import { demandesApi } from "../data/demandes";
import { alerteApi } from "../data/alerte";
import { affairesACommanderUrgentes } from "../domain/caissesACommander";

// Pastille rouge sur l'icône de la barre des tâches tant qu'au moins une affaire est en alerte
// « à Commander » (cf. estACommanderUrgent). Recalculée au démarrage, à chaque changement
// d'écran (ex. retour de Gestion des caisses après avoir coché la case) et toutes les 2 min
// (modifications faites sur un autre poste, passage d'un jour à l'autre).
const INTERVALLE_MS = 2 * 60 * 1000;

export function useAlerteCommande(pret: boolean, declencheur: unknown) {
  useEffect(() => {
    if (!pret) return;
    let annule = false;
    const verifier = () => {
      demandesApi
        .list()
        .then((demandes) => {
          if (!annule) return alerteApi.definirBarreDesTaches(affairesACommanderUrgentes(demandes).length > 0);
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
