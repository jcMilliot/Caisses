import { useCallback, useEffect, useMemo, useState } from "react";
import type { Article, CaisseCalculee, CaisseColisage, CartonConso } from "../domain/types";
import { cartonConsoApi } from "../data/cartonConso";
import { colisAffaireApi } from "../data/colisAffaire";
import { calculerColisage, cartonLibre, grouperColis } from "../domain/colisage";
import type { ColisAffaire } from "../data/colisAffaire";

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
) {
  const [cartons, setCartons] = useState<CartonConso[]>([]);
  const [choixCarton, setChoixCarton] = useState<ColisAffaire[]>([]);
  const [caisses, setCaisses] = useState<CaisseColisage[]>([]);
  const [rangements, setRangements] = useState<Map<string, number | null>>(new Map());
  const [acceptees, setAcceptees] = useState<Map<number, string>>(new Map());
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
      setAcceptees(new Map(pa.map((p) => [p.article_id, p.carton])));
      setCartons(c);
      setChoixCarton(ch);
      setCaisses(cc);
      setRangements(new Map(r.map((x) => [x.tag, x.caisse_colisage_id])));
    } catch (e) {
      setErreur(String(e));
    }
  }, [affaireId]);

  useEffect(() => {
    if (actif) recharger();
  }, [actif, recharger]);

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
    ...calcul,
    // Rangements choisis à la main (absent = rangement proposé).
    rangementsChoisis: rangements,
    // Pièces acceptées malgré l'alerte de dimensions : article → clé du carton.
    acceptees,
    accepterPiece: (articleId: number, carton: string | null) =>
      executer(() => colisAffaireApi.setPieceAcceptee(articleId, carton, trigramme)),
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
