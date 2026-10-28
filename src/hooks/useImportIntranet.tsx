import { useCallback, useEffect, useState } from "react";
import IdentifiantsIntranetDialog from "../components/IdentifiantsIntranetDialog";
import ImportIntranetDialog from "../components/ImportIntranetDialog";
import { confirmerAction } from "../data/confirm";
import { intranetApi, ERR_IDENTIFIANTS_REFUSES, ERR_IDENTIFIANTS_REQUIS, type ImportIntranetInfo } from "../data/intranet";
import { aucunChangement, comparerPicking, type ColisCaisse, type ResultatImport } from "../domain/importIntranet";
import { estColisChiffre } from "../domain/colisage";
import type { Article } from "../domain/types";

// Import / vérification de mise à jour des articles d'une affaire depuis l'intranet (2026-10-07).
// `tousArticles` inclut les lignes supprimées dans l'intranet (hors tableau).
// Lancé automatiquement une fois à l'ouverture de l'affaire (2026-10-27), dès que `peutEcrire`
// (on a la main) et que l'affaire est chargée (`pret`) : résumé à valider gardé, mais ni fenêtre
// « Aucune mise à jour » ni fenêtre d'erreur — l'erreur est rendue dans `erreurAuto`.
export function useImportIntranet(
  affaireId: number,
  nomAffaire: string | undefined,
  tousArticles: Article[],
  trigramme: string,
  reload: () => Promise<void>,
  peutEcrire: boolean,
  pret: boolean,
) {
  const [info, setInfo] = useState<ImportIntranetInfo | null>(null);
  // Sans ça, `premierImport` vaudrait vrai avant la lecture de `info` et le lancement automatique
  // remplacerait à tort les articles collés.
  const [infoChargee, setInfoChargee] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [identifiants, setIdentifiants] = useState<{ message?: string } | null>(null);
  const [resultat, setResultat] = useState<ResultatImport | null>(null);
  const [application, setApplication] = useState(false);
  const [autoLance, setAutoLance] = useState(false);
  const [erreurAuto, setErreurAuto] = useState<string | null>(null);
  // Échec de la liste de colisage seule : le picking est mis à jour quand même (2026-10-28).
  const [erreurColisage, setErreurColisage] = useState<string | null>(null);

  const rechargerInfo = useCallback(() => {
    intranetApi
      .getImport(affaireId)
      .then((i) => {
        setInfo(i);
        setInfoChargee(true);
      })
      .catch(() => {});
  }, [affaireId]);
  useEffect(() => {
    rechargerInfo();
  }, [rechargerInfo]);

  const premierImport = info === null;

  async function appliquer(r: ResultatImport) {
    await intranetApi.appliquerImport(affaireId, r.plan, trigramme);
    await reload();
    rechargerInfo();
  }

  async function lancer(auto = false) {
    if (!nomAffaire) return;
    setEnCours(true);
    setErreurAuto(null);
    setErreurColisage(null);
    try {
      let lignes;
      try {
        lignes = await intranetApi.fetchPicking(nomAffaire);
      } catch (e) {
        const err = String(e);
        if (err === ERR_IDENTIFIANTS_REQUIS || err === ERR_IDENTIFIANTS_REFUSES) {
          setIdentifiants({
            message: err === ERR_IDENTIFIANTS_REFUSES ? "Identifiants refusés par l'intranet (mot de passe changé ?)." : undefined,
          });
          return;
        }
        throw e;
      }
      // Caisses des colis : liste de colisage lue seulement s'il y a des colis (chiffres).
      let caissesIntranet: ColisCaisse[] | null = null;
      let caissesAvant: ColisCaisse[] = [];
      if (lignes.some((l) => estColisChiffre(l.colis.trim()))) {
        try {
          [caissesIntranet, caissesAvant] = await Promise.all([
            intranetApi.fetchPacking(nomAffaire),
            intranetApi.listColisCaisse(affaireId),
          ]);
        } catch (e) {
          caissesIntranet = null;
          setErreurColisage(String(e));
        }
      }
      const r = comparerPicking(tousArticles, lignes, premierImport, caissesAvant, caissesIntranet);
      if (premierImport && r.ajoutes.length === 0) {
        if (auto) setErreurAuto("aucun article AR pour cette affaire dans l'intranet.");
        else await confirmerAction("Aucun article AR à importer pour cette affaire dans l'intranet.", "Importer");
        return;
      }
      if (aucunChangement(r)) {
        // Rien à montrer, mais on enregistre la vérification (date, lignes sans numéro de besoin).
        await appliquer(r);
        if (!auto) await confirmerAction("Aucune mise à jour : l'affaire est identique à l'intranet.", "Vérifier la mise à jour du picking");
        return;
      }
      setResultat(r);
    } catch (e) {
      if (auto) setErreurAuto(String(e));
      else await confirmerAction(String(e), "Import impossible");
    } finally {
      setEnCours(false);
    }
  }

  // Une seule fois par ouverture de l'affaire ; si un autre poste a la main, attend de l'avoir.
  useEffect(() => {
    if (autoLance || !peutEcrire || !pret || !infoChargee || !nomAffaire) return;
    setAutoLance(true);
    lancer(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLance, peutEcrire, pret, infoChargee, nomAffaire]);

  const dialogues = (
    <>
      {identifiants && (
        <IdentifiantsIntranetDialog
          message={identifiants.message}
          onAnnuler={() => setIdentifiants(null)}
          onOk={() => {
            setIdentifiants(null);
            lancer();
          }}
        />
      )}
      {resultat && (
        <ImportIntranetDialog
          resultat={resultat}
          premierImport={premierImport}
          busy={application}
          onAnnuler={() => setResultat(null)}
          onAppliquer={async () => {
            setApplication(true);
            try {
              await appliquer(resultat);
              setResultat(null);
            } catch (e) {
              await confirmerAction(String(e), "Import impossible");
            } finally {
              setApplication(false);
            }
          }}
        />
      )}
    </>
  );

  return {
    libelle: premierImport ? "Importer le picking" : "Vérifier la mise à jour du picking",
    enCours,
    lancer: () => lancer(),
    anomalies: info?.anomalies ?? [],
    // Date (UTC, datetime('now')) de la dernière vérification enregistrée, null si jamais importée.
    derniereMaj: info?.importe_le ?? null,
    autoLance,
    erreurAuto,
    erreurColisage,
    dialogues,
  };
}
