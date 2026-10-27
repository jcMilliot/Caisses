import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Article, CaisseCalculee, CaisseColisage, CartonConso } from "../domain/types";
import { cartonConsoApi } from "../data/cartonConso";
import { colisAffaireApi } from "../data/colisAffaire";
import { calculerColisage, cartonLibre, grouperColis } from "../domain/colisage";
import type { AlerteAcceptable, ColisAffaire } from "../data/colisAffaire";

// État de l'onglet Colisage d'une affaire (2026-10-14) : cartons des colis, caisses colisage
// (copies indépendantes) et rangement des colis / lettres, partagé entre la liste des colis et le
// panneau des caisses colisage. Chaque action enregistre tout de suite puis recharge.
export function useColisage(
  affaireId: number,
  articles: Article[],
  caissesInfos: CaisseCalculee[],
  seuilPct: number,
  trigramme: string,
  actif: boolean,
  peutEcrire: boolean,
) {
  const [cartons, setCartons] = useState<CartonConso[]>([]);
  const [choixCarton, setChoixCarton] = useState<ColisAffaire[]>([]);
  const [caisses, setCaisses] = useState<CaisseColisage[]>([]);
  const [rangements, setRangements] = useState<Map<string, number | null>>(new Map());
  const [acceptees, setAcceptees] = useState<Map<number, string>>(new Map());
  const [accepteesVolume, setAccepteesVolume] = useState<Map<number, string>>(new Map());
  const [erreur, setErreur] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    try {
      const [c, ch, cc, r, pa] = await Promise.all([
        cartonConsoApi.list(),
        colisAffaireApi.list(affaireId),
        colisAffaireApi.listCaisses(affaireId),
        colisAffaireApi.listRangements(affaireId),
        colisAffaireApi.listPiecesAcceptees(affaireId),
      ]);
      setAcceptees(new Map(pa.filter((p) => p.alerte === "dimensions").map((p) => [p.article_id, p.carton])));
      setAccepteesVolume(new Map(pa.filter((p) => p.alerte === "volume").map((p) => [p.article_id, p.carton])));
      setCartons(c);
      setChoixCarton(ch);
      setCaisses(cc);
      setRangements(new Map(r.map((x) => [x.tag, x.caisse_colisage_id])));
    } catch (e) {
      setErreur(String(e));
    }
  }, [affaireId]);

  // À l'arrivée sur l'onglet (2026-10-27) : les caisses du Picking pas encore copiées le sont
  // d'office, une fois par arrivée, dès qu'on a la main (sinon au moment où on la prend).
  const copieFaite = useRef(false);
  useEffect(() => {
    if (!actif) {
      copieFaite.current = false;
      return;
    }
    (async () => {
      if (peutEcrire && !copieFaite.current && caissesInfos.length > 0) {
        copieFaite.current = true;
        try {
          const sources = new Set((await colisAffaireApi.listCaisses(affaireId)).map((c) => c.source_caisse_id));
          if (caissesInfos.some((c) => !sources.has(c.id))) await colisAffaireApi.copierCaisses(affaireId, trigramme);
        } catch (e) {
          setErreur(String(e));
        }
      }
      await recharger();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif, peutEcrire, recharger]);

  async function executer(action: () => Promise<void>) {
    setErreur(null);
    try {
      await action();
    } catch (e) {
      setErreur(String(e));
    }
    await recharger();
  }

  const calcul = useMemo(() => {
    const cartonParId = new Map(cartons.map((c) => [c.id, c]));
    const cartonParTag = new Map<string, CartonConso>();
    for (const ch of choixCarton) {
      const c =
        ch.carton_conso_id !== null
          ? cartonParId.get(ch.carton_conso_id)
          : cartonLibre([ch.libre_longueur_mm, ch.libre_largeur_mm, ch.libre_hauteur_mm], ch.libre_poids_kg);
      if (c) cartonParTag.set(ch.tag, c);
    }
    return calculerColisage({
      groupes: grouperColis(articles),
      cartonParTag,
      rangements,
      caisses,
      seuilPct,
      caissesInfos,
      articles,
    });
  }, [articles, cartons, choixCarton, rangements, caisses, seuilPct, caissesInfos]);

  return {
    cartons,
    erreur,
    recharger,
    ...calcul,
    // Rangements choisis à la main (absent = rangement proposé).
    rangementsChoisis: rangements,
    // Pièces acceptées malgré l'alerte de dimensions / de volume : article → clé du carton.
    acceptees,
    accepteesVolume,
    accepterPiece: (articleId: number, alerte: AlerteAcceptable, carton: string | null) =>
      executer(() => colisAffaireApi.setPieceAcceptee(articleId, alerte, carton, trigramme)),
    choisirCarton: (tag: string, id: number | null) => executer(() => colisAffaireApi.setCarton(affaireId, tag, id, trigramme)),
    choisirCartonLibre: (tag: string, dims: [number, number, number], poidsKg: number) =>
      executer(() => colisAffaireApi.setCartonLibre(affaireId, tag, dims, poidsKg, trigramme)),
    ranger: (tag: string, propose: boolean, caisseId: number | null) =>
      executer(() => colisAffaireApi.ranger(affaireId, tag, propose, caisseId, trigramme)),
    copierCaisses: () => executer(() => colisAffaireApi.copierCaisses(affaireId, trigramme)),
    creerCaisse: (nom: string, dims: [number, number, number]) =>
      executer(() => colisAffaireApi.creerCaisse(affaireId, nom, dims, trigramme)),
    modifierCaisse: (id: number, nom: string, dims: [number, number, number]) =>
      executer(() => colisAffaireApi.modifierCaisse(id, nom, dims, trigramme)),
    supprimerCaisse: (id: number) => executer(() => colisAffaireApi.supprimerCaisse(id, trigramme)),
  };
}

export type Colisage = ReturnType<typeof useColisage>;
