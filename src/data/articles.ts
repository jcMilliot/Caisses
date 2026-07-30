import { call } from "./client";
import type { Article, NewArticle } from "../domain/types";

export const articlesApi = {
  list: (affaire_id: number) => call<Article[]>("list_articles", { affaireId: affaire_id }),
  create: (affaire_id: number, article: NewArticle) =>
    call<Article>("create_article", { affaireId: affaire_id, article }),
  bulkCreate: (affaire_id: number, articles: NewArticle[]) =>
    call<Article[]>("bulk_create_articles", { affaireId: affaire_id, articles }),
  update: (id: number, article: NewArticle) =>
    call<void>("update_article", {
      id,
      ar: article.ar,
      reference: article.reference,
      designation: article.designation,
      dim1Mm: article.dim1_mm,
      dim2Mm: article.dim2_mm,
      dim3Mm: article.dim3_mm,
      poidsUnitaireKg: article.poids_unitaire_kg,
      quantite: article.quantite,
    }),
  delete: (id: number) => call<void>("delete_article", { id }),
  assign: (article_ids: number[], caisse_id: number | null) =>
    call<void>("assign_articles", { articleIds: article_ids, caisseId: caisse_id }),
};
