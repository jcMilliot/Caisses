import { call } from "./client";
import type { CaisseStock, MouvementStock, NewCaisseStock, TableLigne } from "../domain/types";

export const caisseStockApi = {
  list: () => call<CaisseStock[]>("list_caisses_stock"),
  create: (caisse: NewCaisseStock, trigramme: string) =>
    call<CaisseStock>("create_caisse_stock", { caisse, trigramme }),
  update: (id: number, caisse: NewCaisseStock, trigramme: string) =>
    call<void>("update_caisse_stock", { id, caisse, trigramme }),
  delete: (id: number, trigramme: string) => call<void>("delete_caisse_stock", { id, trigramme }),
  // Lignes de Gestion des caisses non livrées qui utilisent cette caisse (reprendront ses
  // dimensions et son type d'ouverture si on la modifie).
  countLignesLiees: (id: number) => call<number>("count_caisse_stock_lignes_liees", { id }),
  transfer: (caisseStockId: number, demandeCibleId: number, trigramme: string) =>
    call<void>("transfer_caisse_stock", { caisseStockId, demandeCibleId, trigramme }),
  setValidee: (id: number, validee: boolean, trigramme: string) =>
    call<void>("set_caisse_stock_validee", { id, validee, trigramme }),
  // Admin › Caisses (session admin requise) : quantité, suivi et seuil d'une caisse AR_CAISS_.
  setSuivi: (id: number, quantite: number, gere: boolean, seuilAlerte: number, trigramme: string) =>
    call<void>("set_caisse_stock_suivi", { id, quantite, gere, seuilAlerte, trigramme }),
  // Livraison d'une ligne : décompte de sa quantité si elle utilise une AR_CAISS_ gérée
  // (null = rien à décompter, ou déjà décomptée).
  decompterLivraison: (table: TableLigne, id: number, trigramme: string) =>
    call<MouvementStock | null>("decompter_stock_livraison", { table, id, trigramme }),
  // Ce qui a été retiré du stock à la livraison de la ligne (null = pas décomptée).
  stockDecompteLigne: (table: TableLigne, id: number) =>
    call<MouvementStock | null>("stock_decompte_ligne", { table, id }),
  // Dévalidation acceptée : remet en stock ce qui avait été retiré.
  remettreStockLigne: (table: TableLigne, id: number, trigramme: string) =>
    call<void>("remettre_stock_ligne", { table, id, trigramme }),
};
