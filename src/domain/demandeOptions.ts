// Valeurs prédéfinies proposées dans les champs de la section Demandes. Chaque liste inclut
// une option "Autre" en saisie libre côté UI (pas ici — voir SelectOuAutre).

import type { Demande, DemandeCaisse, ListeOption, OptionListe } from "./types";

export const TYPES_ENVOI_CAISSE = ["STANDARD", "STANDARD (4B)", "STANDARD (4C)"];

export const TYPES_OUVERTURE = ["Par dessus", "Par dessus et par devant", "Par devant"];

export const OUVERTURE_PAR_DESSUS = "Par dessus";
// Ouvertures interdites pour une caisse 4C (housse soudée — pas d'ouverture par devant).
const OUVERTURES_INTERDITES_4C = ["Par dessus et par devant", "Par devant"];

export const VALEURS_STOCK = ["AR_CAISS_00001", "AR_CAISS_00002", "AR_CAISS_00005", "AR_CAISS_00006", "CAISSE RECUP"];

export const TRAITEMENTS = ["NIMP15"];

// Les valeurs des colonnes Moteurs / Module linéaire / Terminaux vivent entièrement en base
// (table `option_liste`, seedée par la migration 0017) — plus de socle codé en dur, elles sont
// toutes modifiables / supprimables via l'outil « Gérer les références ».
export const LIBELLE_LISTE: Record<ListeOption, string> = {
  moteurs: "Moteurs",
  module_lineaire: "Module linéaire",
  terminaux: "Terminaux",
};

// Tri "quantité puis référence" : un libellé de la forme "<n> <texte> <ref numérique>" est
// classé d'abord par le nombre de tête (1, 2, 3…), puis par le dernier nombre du libellé (n° de
// référence, ex. FESTO 426 < FESTO 485), puis alphabétiquement. Les libellés sans ce format
// tombent en fin de liste, triés alpha. Vaut pour les 3 listes (moteurs "1 MOTEUR"…, terminaux,
// modules linéaires "1 FESTO 426 (…)") et pour les valeurs ajoutées ensuite via l'outil.
export function comparerOption(a: string, b: string): number {
  // Ignore la partie entre parenthèses (dimensions informatives) pour l'analyse.
  const noyau = (s: string) => s.replace(/\(.*$/, "").trim();
  const qte = (s: string) => {
    const m = noyau(s).match(/^(\d+)\b/);
    return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
  };
  const ref = (s: string) => {
    // 2e nombre du noyau (après le préfixe quantité) = n° de référence.
    const nombres = noyau(s).match(/\d+/g);
    return nombres && nombres.length > 1 ? Number(nombres[1]) : Number.POSITIVE_INFINITY;
  };
  return qte(a) - qte(b) || ref(a) - ref(b) || a.localeCompare(b, "fr");
}

// Valeurs d'une liste, triées "quantité puis référence" (cf. comparerOption).
export function optionsListe(liste: ListeOption, options: OptionListe[]): string[] {
  return options
    .filter((o) => o.liste === liste)
    .map((o) => o.valeur)
    .sort(comparerOption);
}

// Une caisse "4B"/"4C" (renforcée) impose systématiquement le traitement NIMP15 ; le "4C"
// contient en plus de la mousse de calage qui réduit le volume utile.
export function estCaisse4B(typeEnvoiCaisse: string): boolean {
  return /4B/i.test(typeEnvoiCaisse);
}

export function estCaisse4C(typeEnvoiCaisse: string): boolean {
  return /4C/i.test(typeEnvoiCaisse);
}

export function necessiteNimp15(typeEnvoiCaisse: string): boolean {
  return estCaisse4B(typeEnvoiCaisse) || estCaisse4C(typeEnvoiCaisse);
}

// --- Règles dynamiques d'une caisse (Demandes) --------------------------------------------
// Ces règles doivent s'appliquer à chaque changement de type d'envoi / de caisse en stock,
// aussi bien sur la ligne mère que sur les sous-caisses. Centralisées ici pour être identiques
// partout (édition inline, dialogue de création, sélection de caisse en stock).

interface EtatCaisseRegles {
  type_envoi_caisse: string;
  type_ouverture: string;
  traitement: string;
  caisse_stock_id?: number | null;
}

// Types d'ouverture réellement sélectionnables selon l'état de la caisse :
//  - 4C : uniquement « Par dessus » (housse soudée, pas d'ouverture par devant)
//  - caisse en stock : uniquement « Par dessus » (pas de type d'ouverture par caisse en stock,
//    cf. « À réfléchir plus tard » — ajouter la colonne côté Caisses en stock)
//  - sinon : toutes les valeurs de TYPES_OUVERTURE
export function ouverturesAutorisees(etat: Pick<EtatCaisseRegles, "type_envoi_caisse" | "caisse_stock_id">): string[] {
  if (etat.caisse_stock_id != null) return [OUVERTURE_PAR_DESSUS];
  if (estCaisse4C(etat.type_envoi_caisse)) {
    return TYPES_OUVERTURE.filter((o) => !OUVERTURES_INTERDITES_4C.includes(o));
  }
  return TYPES_OUVERTURE;
}

// Corrige l'état d'une caisse après un changement, pour respecter les règles métier :
//  - type d'ouverture ramené à « Par dessus » s'il n'est plus autorisé (4C, ou caisse en stock)
//  - traitement NIMP15 : forcé si 4B/4C, retiré si STANDARD (on ne touche pas à un autre
//    traitement saisi manuellement)
//  - contre-plaqué recalculé (STANDARD/4B requis, 4C non)
// Renvoie uniquement les champs qui changent (patch à appliquer via onEdit).
export function appliquerReglesCaisse(etat: EtatCaisseRegles): Partial<EtatCaisseRegles> & { contre_plaque?: boolean } {
  const patch: Partial<EtatCaisseRegles> & { contre_plaque?: boolean } = {};

  const autorisees = ouverturesAutorisees(etat);
  if (etat.type_ouverture !== "" && !autorisees.includes(etat.type_ouverture)) {
    patch.type_ouverture = OUVERTURE_PAR_DESSUS;
  }

  const traitementActuel = etat.traitement.trim();
  if (necessiteNimp15(etat.type_envoi_caisse)) {
    if (traitementActuel === "") patch.traitement = "NIMP15";
  } else if (traitementActuel.toUpperCase() === "NIMP15") {
    // STANDARD : pas de NIMP15 — on le retire.
    patch.traitement = "";
  }

  patch.contre_plaque = contrePlaqueParDefaut(etat.type_envoi_caisse);
  return patch;
}

export const AVERTISSEMENT_MOUSSE_4C =
  "Attention, mousse présente, prévoir 5cm de plus sur les côtés et sur la hauteur.";

// Mesures max pour une caisse 4C : 2.22 × 0.80 × 0.80 m. La longueur (2.22 m) est une limite
// informative — dépassable si besoin — contrairement à largeur/hauteur qui restent des maximums
// physiques stricts. Dans les deux cas on se contente d'avertir (pas de blocage de saisie).
export const MESURES_MAX_4C_MM = { longueur: 2220, largeur: 800, hauteur: 800 };

export function depassementMesuresMax4C(
  typeEnvoiCaisse: string,
  longueurMm: number,
  largeurMm: number,
  hauteurMm: number,
): string | undefined {
  if (!estCaisse4C(typeEnvoiCaisse)) return undefined;
  const depassements: string[] = [];
  if (longueurMm > MESURES_MAX_4C_MM.longueur) depassements.push("longueur");
  if (largeurMm > MESURES_MAX_4C_MM.largeur) depassements.push("largeur");
  if (hauteurMm > MESURES_MAX_4C_MM.hauteur) depassements.push("hauteur");
  if (depassements.length === 0) return undefined;
  return `Mesure(s) au-delà du maximum habituel pour une caisse 4C (2.22 × 0.80 × 0.80 m) : ${depassements.join(", ")}.`;
}

// Le contre-plaqué est systématiquement requis pour STANDARD et 4B ; le 4C (housse soudée) ne
// l'impose pas automatiquement, donc reste décoché par défaut et à la discrétion de l'utilisateur.
export function contrePlaqueParDefaut(typeEnvoiCaisse: string): boolean {
  return !estCaisse4C(typeEnvoiCaisse);
}

// Une demande est considérée validée soit via la colonne `validee` (case "Valider" cochée et
// enregistrée), soit via une observation historique "livrée"/"rapatriée" saisie avant que cette
// colonne n'existe (données Excel importées, ou saisies manuelles anciennes) — les deux signaux
// doivent rester équivalents partout où l'app décide qu'une demande est "terminée".
export function estDemandeValidee(d: Demande): boolean {
  const obs = d.observations.trim().toLowerCase();
  return d.validee || obs.includes("livrée") || obs.includes("livree") || obs.includes("rapatriée") || obs.includes("rapatriee");
}

// Compare deux noms d'affaire : égalité stricte (après trim, insensible à la casse). La
// comparaison est volontairement exacte — "UUSPM01D" et "UUSPM010" sont deux affaires
// différentes, une variante d'affaire porte toujours un suffixe distinct assumé.
export function memeNomAffaire(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Demandes existantes portant exactement ce nom d'affaire ET non validées — sert à avertir
// avant d'ajouter une nouvelle ligne / une nouvelle caisse pour une affaire déjà en cours.
// Les demandes déjà validées sont ignorées : rouvrir le même nom d'affaire pour un nouveau
// besoin est normal, l'ancienne demande est close.
export function demandesActivesPourAffaire(nomAffaire: string, demandes: Demande[]): Demande[] {
  if (nomAffaire.trim() === "") return [];
  return demandes.filter((d) => !estDemandeValidee(d) && memeNomAffaire(d.affaire, nomAffaire));
}

// Une sous-caisse (demande_caisse) n'a pas sa propre colonne `validee` — elle est considérée
// validée UNIQUEMENT par sa propre observation "livrée"/"rapatriée". La validation de la
// demande mère la propage via une cascade explicite (DemandesList.handleValider écrit
// l'observation sur les sous-caisses existantes) — mais on n'HÉRITE PAS de la mère : une
// sous-caisse ajoutée après coup à une affaire déjà livrée reste "à faire" (pas de "Livré").
// `demandeMere` gardé en 2e paramètre pour compat des appelants, non utilisé.
export function estDemandeCaisseValidee(c: DemandeCaisse, _demandeMere?: Demande | undefined): boolean {
  const obs = c.observations.trim().toLowerCase();
  return obs.includes("livrée") || obs.includes("livree") || obs.includes("rapatriée") || obs.includes("rapatriee");
}
