import { estDemandeAchstock, libelleCategorie } from "./affiches";
import { estArCaiss } from "./caisseStock";
import { dateExcelVersIso } from "./dates";
import { estDemandeCaisseValidee, estDemandeValidee } from "./demandeOptions";
import type { CaisseStock, Demande, DemandeCaisse } from "./types";

// Statistiques d'utilisation des caisses (Admin › Caisses, décisions du 2026-10-02) :
//  - une « caisse utilisée » = une ligne de Gestion des caisses (mère ou sous-caisse) **livrée**,
//    hors affaires ACHSTOCK (commandes pour le stock, pas des caisses expédiées) ;
//  - comptage en **quantités** (colonne Qté), pas en nombre de lignes ;
//  - période sur la **date de picking** (celle de la sous-caisse, sinon celle de sa mère) ;
//  - caisse **de stock** = caisse choisie dans le menu Stock (ou, pour une ligne ancienne, nom
//    écrit dans la colonne Stock) ; sinon **sur mesure**, regroupée par type d'envoi ET par
//    format L × l × H.

export interface Periode {
  du: string | null; // AAAA-MM-JJ inclus, null = sans borne
  au: string | null;
}

export interface LigneUtilisee {
  quantite: number;
  typeEnvoi: string; // libellé Standard / 4B / 4C
  longueurMm: number;
  largeurMm: number;
  hauteurMm: number;
  caisseStock: string | null; // nom de la caisse de stock, null = sur mesure
}

export interface FormatSurMesure {
  cle: string;
  typeEnvoi: string;
  longueurMm: number;
  largeurMm: number;
  hauteurMm: number;
  quantite: number;
  lignes: number;
}

export interface UsageCaisseStock {
  nom: string;
  estArCaiss: boolean;
  quantite: number;
  lignes: number;
}

export interface Statistiques {
  total: number;
  surMesure: number;
  stock: number;
  surMesureParType: { typeEnvoi: string; quantite: number }[];
  formats: FormatSurMesure[];
  caissesStock: UsageCaisseStock[];
  // Lignes sur mesure livrées sans dimensions : comptées dans les totaux, pas dans les formats.
  surMesureSansDimensions: number;
  // Lignes livrées sans date de picking lisible : exclues dès qu'une période est choisie.
  sansDate: number;
}

function dateIso(s: string): string | null {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return dateExcelVersIso(t) || null;
}

export function lignesUtilisees(
  demandes: Demande[],
  demandeCaisses: DemandeCaisse[],
  caissesStock: CaisseStock[],
  periode: Periode,
): { lignes: LigneUtilisee[]; sansDate: number } {
  const nomStock = (id: number | null, texte: string): string | null => {
    if (id !== null) return caissesStock.find((c) => c.id === id)?.nom ?? (texte.trim() || "Caisse en stock supprimée");
    return texte.trim() || null;
  };
  const lignes: LigneUtilisee[] = [];
  let sansDate = 0;
  const avecPeriode = periode.du !== null || periode.au !== null;
  const ajouter = (datePicking: string, ligne: LigneUtilisee) => {
    const d = dateIso(datePicking);
    if (avecPeriode) {
      if (!d) {
        sansDate++;
        return;
      }
      if ((periode.du && d < periode.du) || (periode.au && d > periode.au)) return;
    }
    lignes.push(ligne);
  };

  for (const d of demandes) {
    if (estDemandeAchstock(d)) continue;
    const mereLivree = estDemandeValidee(d);
    if (mereLivree) {
      ajouter(d.date_picking, {
        quantite: Math.max(0, d.quantite),
        typeEnvoi: libelleCategorie(d.type_envoi_caisse),
        longueurMm: d.longueur_mm,
        largeurMm: d.largeur_mm,
        hauteurMm: d.hauteur_mm,
        caisseStock: nomStock(d.caisse_stock_id, d.stock),
      });
    }
    for (const sc of demandeCaisses) {
      if (sc.demande_id !== d.id || !(mereLivree || estDemandeCaisseValidee(sc))) continue;
      ajouter(sc.date_picking.trim() ? sc.date_picking : d.date_picking, {
        quantite: Math.max(0, sc.quantite),
        typeEnvoi: libelleCategorie(sc.type_envoi_caisse || d.type_envoi_caisse),
        longueurMm: sc.longueur_mm,
        largeurMm: sc.largeur_mm,
        hauteurMm: sc.hauteur_mm,
        caisseStock: nomStock(sc.caisse_stock_id, sc.stock),
      });
    }
  }
  return { lignes, sansDate };
}

const ORDRE_TYPES = ["Standard", "4B", "4C"];

export function calculerStatistiques(
  demandes: Demande[],
  demandeCaisses: DemandeCaisse[],
  caissesStock: CaisseStock[],
  periode: Periode,
): Statistiques {
  const { lignes, sansDate } = lignesUtilisees(demandes, demandeCaisses, caissesStock, periode);
  const parType = new Map<string, number>(ORDRE_TYPES.map((t) => [t, 0]));
  const formats = new Map<string, FormatSurMesure>();
  const stock = new Map<string, UsageCaisseStock>();
  let surMesure = 0;
  let enStock = 0;
  let surMesureSansDimensions = 0;

  for (const l of lignes) {
    if (l.caisseStock !== null) {
      enStock += l.quantite;
      const u = stock.get(l.caisseStock) ?? { nom: l.caisseStock, estArCaiss: estArCaiss(l.caisseStock), quantite: 0, lignes: 0 };
      u.quantite += l.quantite;
      u.lignes++;
      stock.set(l.caisseStock, u);
      continue;
    }
    surMesure += l.quantite;
    parType.set(l.typeEnvoi, (parType.get(l.typeEnvoi) ?? 0) + l.quantite);
    if (l.longueurMm <= 0 || l.largeurMm <= 0 || l.hauteurMm <= 0) {
      surMesureSansDimensions += l.quantite;
      continue;
    }
    // Arrondi au mm : 1199.9999 et 1200 sont le même format.
    const L = Math.round(l.longueurMm);
    const W = Math.round(l.largeurMm);
    const H = Math.round(l.hauteurMm);
    const cle = `${l.typeEnvoi}|${L}|${W}|${H}`;
    const f = formats.get(cle) ?? { cle, typeEnvoi: l.typeEnvoi, longueurMm: L, largeurMm: W, hauteurMm: H, quantite: 0, lignes: 0 };
    f.quantite += l.quantite;
    f.lignes++;
    formats.set(cle, f);
  }

  const parQuantite = <T extends { quantite: number }>(a: T, b: T) => b.quantite - a.quantite;
  return {
    total: surMesure + enStock,
    surMesure,
    stock: enStock,
    surMesureParType: [...parType].map(([typeEnvoi, quantite]) => ({ typeEnvoi, quantite })),
    formats: [...formats.values()].sort(parQuantite),
    caissesStock: [...stock.values()].sort(parQuantite),
    surMesureSansDimensions,
    sansDate,
  };
}

// Bornes des raccourcis de période (date de picking), en jours calendaires locaux.
export function periodeDepuisMois(mois: number, aujourdhui = new Date()): Periode {
  const d = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth() - mois, aujourdhui.getDate());
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { du: iso(d), au: iso(aujourdhui) };
}

