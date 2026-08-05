import { useCallback, useEffect, useState } from "react";
import { affairesApi } from "../data/affaires";
import { articlesApi } from "../data/articles";
import { caissesApi } from "../data/caisses";
import { articlesParCaisse, calculerCaisse } from "../domain/calculs";
import type { Affaire, Article, Caisse, CaisseCalculee, NewArticle } from "../domain/types";

export function useAffaire(affaireId: number, trigramme: string) {
  const [affaire, setAffaire] = useState<Affaire | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [caisses, setCaisses] = useState<Caisse[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [affaires, arts, cais] = await Promise.all([
        affairesApi.list(),
        articlesApi.list(affaireId),
        caissesApi.list(affaireId),
      ]);
      setAffaire(affaires.find((a) => a.id === affaireId) ?? null);
      setArticles(arts);
      setCaisses(cais);
    } finally {
      setLoading(false);
    }
  }, [affaireId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const seuilDefaut = affaire?.seuil_defaut ?? 90;
  const byCaisse = articlesParCaisse(articles);
  const caissesCalculees: CaisseCalculee[] = caisses.map((c) =>
    calculerCaisse(c, byCaisse.get(c.id) ?? [], seuilDefaut),
  );
  const articlesNonAssignes = articles.filter((a) => a.caisse_id === null);

  async function ajouterArticles(nouveaux: NewArticle[]) {
    await articlesApi.bulkCreate(affaireId, nouveaux, trigramme);
    await reload();
  }

  async function modifierArticle(id: number, article: NewArticle) {
    await articlesApi.update(id, article, trigramme);
    await reload();
  }

  async function supprimerArticle(id: number) {
    await articlesApi.delete(id, trigramme);
    await reload();
  }

  async function creerCaisse(
    nom: string,
    longueur_mm: number,
    largeur_mm: number,
    hauteur_mm: number,
    seuil_pct: number | null,
    type_envoi_caisse: string = "",
    demande_caisse_id: number | null = null,
  ) {
    const caisse = await caissesApi.create(
      affaireId,
      nom,
      longueur_mm,
      largeur_mm,
      hauteur_mm,
      seuil_pct,
      null,
      type_envoi_caisse,
      demande_caisse_id,
      trigramme,
    );
    await reload();
    return caisse;
  }

  async function modifierCaisse(
    id: number,
    nom: string,
    longueur_mm: number,
    largeur_mm: number,
    hauteur_mm: number,
    seuil_pct: number | null,
    couleur: string,
    type_envoi_caisse: string,
  ) {
    await caissesApi.update(id, nom, longueur_mm, largeur_mm, hauteur_mm, seuil_pct, couleur, type_envoi_caisse, trigramme);
    await reload();
  }

  async function supprimerCaisse(id: number) {
    await caissesApi.delete(id, trigramme);
    await reload();
  }

  async function assignerArticles(articleIds: number[], caisseId: number | null) {
    await articlesApi.assign(articleIds, caisseId, trigramme);
    await reload();
  }

  return {
    affaire,
    articles,
    caisses,
    caissesCalculees,
    articlesNonAssignes,
    loading,
    reload,
    ajouterArticles,
    modifierArticle,
    supprimerArticle,
    creerCaisse,
    modifierCaisse,
    supprimerCaisse,
    assignerArticles,
  };
}
