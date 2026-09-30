import { call } from "./client";
import type { NewArticle } from "../domain/types";

// Lignes écartées au collage Excel (AR ne commençant ni par « AR » ni par « ZR »), gardées avec
// l'affaire. Modification, ajout au tableau et suppression réservés aux administrateurs.
export interface ArticleNonColle extends NewArticle {
  id: number;
  affaire_id: number;
  ligne_brute: string;
  cree_le: string;
  cree_par: string;
}

export const articlesNonCollesApi = {
  list: (affaireId: number) => call<ArticleNonColle[]>("list_articles_non_colles", { affaireId }),
  create: (affaireId: number, lignes: (NewArticle & { ligne_brute: string })[], trigramme: string) =>
    call<void>("create_articles_non_colles", { affaireId, lignes, trigramme }),
  update: (id: number, article: NewArticle, trigramme: string) =>
    call<void>("update_article_non_colle", { id, article, trigramme }),
  delete: (id: number, trigramme: string) => call<void>("delete_article_non_colle", { id, trigramme }),
  integrer: (id: number, trigramme: string) => call<void>("integrer_article_non_colle", { id, trigramme }),
};
