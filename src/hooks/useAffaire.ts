import { useCallback, useEffect, useState } from "react";
import { affairesApi } from "../data/affaires";
import { articlesApi } from "../data/articles";
import { caissesApi } from "../data/caisses";
import { caisseStockApi } from "../data/caisseStock";
import { poidsCaisseApi } from "../data/poidsCaisse";
import { lireReglagesPoids, poidsDeLaCaisse, REGLAGES_POIDS_DEFAUT } from "../domain/poidsCaisse";
import { articlesParCaisse, calculerCaisse, POIDS_MAX_KG_M2_DEFAUT } from "../domain/calculs";
import type { Affaire, Article, Caisse, CaisseCalculee, CaisseStock, NewArticle } from "../domain/types";

export function useAffaire(affaireId: number, trigramme: string) {
  const [affaire, setAffaire] = useState<Affaire | null>(null);
  // Tous les articles, y compris les lignes supprimées dans l'intranet (hors tableau et calculs).
  const [tousArticles, setTousArticles] = useState<Article[]>([]);
  const articles = tousArticles.filter((a) => !a.supprime_intranet);
  const articlesSupprimesIntranet = tousArticles.filter((a) => a.supprime_intranet);
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
      setTousArticles(arts);
      setCaisses(cais);
    } finally {
      setLoading(false);
    }
  }, [affaireId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const seuilDefaut = affaire?.seuil_defaut ?? 90;
  // Limite de poids au m² (Admin › Paramètres) — défaut tant qu'elle n'est pas chargée.
  const [poidsMaxKgM2, setPoidsMaxKgM2] = useState(POIDS_MAX_KG_M2_DEFAUT);
  useEffect(() => {
    affairesApi.getPoidsMaxKgM2().then(setPoidsMaxKgM2).catch(() => {});
  }, []);
  // Poids de la caisse elle-même (alerte de charge, 2026-10-08) : réglages de l'estimation et
  // tares des caisses en stock.
  const [reglagesPoids, setReglagesPoids] = useState(REGLAGES_POIDS_DEFAUT);
  const [caissesStock, setCaissesStock] = useState<CaisseStock[]>([]);
  useEffect(() => {
    poidsCaisseApi.getReglages().then((r) => setReglagesPoids(lireReglagesPoids(r))).catch(() => {});
    caisseStockApi.list().then(setCaissesStock).catch(() => {});
  }, []);
  const byCaisse = articlesParCaisse(articles);
  const caissesCalculees: CaisseCalculee[] = caisses.map((c) =>
    calculerCaisse(c, byCaisse.get(c.id) ?? [], seuilDefaut, poidsMaxKgM2, poidsDeLaCaisse(c, caissesStock, reglagesPoids)),
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
    tousArticles,
    articlesSupprimesIntranet,
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
