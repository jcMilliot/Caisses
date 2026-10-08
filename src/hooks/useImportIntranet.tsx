import { useCallback, useEffect, useState } from "react";
import IdentifiantsIntranetDialog from "../components/IdentifiantsIntranetDialog";
import ImportIntranetDialog from "../components/ImportIntranetDialog";
import { confirmerAction } from "../data/confirm";
import { intranetApi, ERR_IDENTIFIANTS_REFUSES, ERR_IDENTIFIANTS_REQUIS, type ImportIntranetInfo } from "../data/intranet";
import { aucunChangement, comparerPicking, type ResultatImport } from "../domain/importIntranet";
import type { Article } from "../domain/types";

// Import / vérification de mise à jour des articles d'une affaire depuis l'intranet (2026-10-07).
// `tousArticles` inclut les lignes supprimées dans l'intranet (hors tableau).
export function useImportIntranet(affaireId: number, nomAffaire: string | undefined, tousArticles: Article[], trigramme: string, reload: () => Promise<void>) {
  const [info, setInfo] = useState<ImportIntranetInfo | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [identifiants, setIdentifiants] = useState<{ message?: string } | null>(null);
  const [resultat, setResultat] = useState<ResultatImport | null>(null);
  const [application, setApplication] = useState(false);

  const rechargerInfo = useCallback(() => {
    intranetApi.getImport(affaireId).then(setInfo).catch(() => {});
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

  async function lancer() {
    if (!nomAffaire) return;
    setEnCours(true);
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
      const r = comparerPicking(tousArticles, lignes, premierImport);
      if (premierImport && r.ajoutes.length === 0) {
        await confirmerAction("Aucun article AR à importer pour cette affaire dans l'intranet.", "Importer");
        return;
      }
      if (aucunChangement(r)) {
        // Rien à montrer, mais on enregistre la vérification (date, lignes sans numéro de besoin).
        await appliquer(r);
        await confirmerAction("Aucune mise à jour : l'affaire est identique à l'intranet.", "Vérifier mise à jour");
        return;
      }
      setResultat(r);
    } catch (e) {
      await confirmerAction(String(e), "Import impossible");
    } finally {
      setEnCours(false);
    }
  }

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
    libelle: premierImport ? "Importer" : "Vérifier mise à jour",
    enCours,
    lancer,
    anomalies: info?.anomalies ?? [],
    dialogues,
  };
}
