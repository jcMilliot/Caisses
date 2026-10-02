import PastilleAlerte from "./PastilleAlerte";
import TauxRemplissage from "./TauxRemplissage";
import type { TauxCaisse } from "../domain/remplissage";

type TauxLigne = { caisses: TauxCaisse[]; seuil: number };
import { libelleCaisseStock } from "../domain/caisseStock";
import IconeFiltre from "./IconeFiltre";
import { MESSAGE_ALERTE_COMMANDE, estACommanderUrgent } from "../domain/caissesACommander";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Demande, DemandeCaisse, CaisseStock, OptionListe } from "../domain/types";
import { dateIsoVersAffichage, dateEstDansLePasse } from "../domain/dates";
import {
  estCaisse4C,
  estDemandeValidee,
  estDemandeCaisseValidee,
  AVERTISSEMENT_MOUSSE_4C,
  depassementMesuresMax4C,
  TYPES_ENVOI_CAISSE,
  TRAITEMENTS,
  optionsListe,
  ouverturesAutorisees,
  ouvertureImposee,
  motifOuvertureImposee,
  stockAutorisePourEnvoi,
  appliquerReglesCaisse,
  champsManquantsPourCommande,
} from "../domain/demandeOptions";
import { PALETTE_CAISSES } from "../domain/palette";
import { confirmerAction } from "../data/confirm";
import ColumnFilterMenu from "./ColumnFilterMenu";
import TableOptionsMenu from "./TableOptionsMenu";
import ScrollToTopButton from "./ScrollToTopButton";

interface Props {
  demandes: Demande[];
  demandeCaisses: DemandeCaisse[];
  caissesStock: CaisseStock[];
  lignesEtendues: Set<number>;
  onToggleEtendue: (demandeId: number) => void;
  onCreerDemandeCaisse: (demande: Demande) => void;
  onEditDemandeCaisse: (id: number, patch: Partial<DemandeCaisse>) => void;
  onDeleteDemandeCaisse: (id: number) => void;
  onSelectStock: (demandeId: number, caisseStockId: number | null) => void;
  onSelectStockSousLigne: (id: number, caisseStockId: number | null) => void;
  onEdit: (id: number, patch: Partial<Demande>) => void;
  onDelete: (id: number, affaire: string) => void;
  onValider: (id: number, validee: boolean) => void;
  onSimulerAffaire: (demande: Demande) => void;
  optionsPersonnalisees: OptionListe[];
  // Nœud DOM (dans l'en-tête de DemandesList) où porter le bouton « Options » via un portail,
  // pour le grouper avec « Créer une nouvelle caisse » / « Gérer les références » / etc.
  slotOptions?: HTMLElement | null;
  // Taux de remplissage des caisses de Simulations liées à une ligne mère / sous-caisse
  // (null = aucune caisse remplie liée).
  tauxRemplissage?: {
    mere: (d: Demande) => TauxLigne | null;
    sous: (sc: DemandeCaisse, mere: Demande) => TauxLigne | null;
  };
  readOnly?: boolean;
}

type Champ =
  | "ok_pour_passer_cde"
  | "affaire"
  | "type_envoi_caisse"
  | "type_ouverture"
  | "stock"
  | "longueur_mm"
  | "largeur_mm"
  | "hauteur_mm"
  | "quantite"
  | "date_picking"
  | "date_demandee_s2c"
  | "moteurs"
  | "module_lineaire"
  | "terminaux"
  | "traitement"
  | "informations_supp"
  | "cde_passee_affaire"
  | "cde_passee_achat_stock"
  | "observations";

// Colonnes affichables : les champs de la demande + des colonnes calculées (non filtrables).
type Colonne = Champ | "taux_remplissage";

type Tri = { colonne: Champ; sens: "asc" | "desc" };

const CLE_TRI = "caisses:tri:demandes";
const CLE_FILTRES = "caisses:filtres:demandes";

// Tri par défaut à l'arrivée sur l'écran : date de picking la plus récente en premier, tant que
// l'utilisateur n'a jamais choisi lui-même un tri (dans ce cas son choix, sauvegardé en
// localStorage, prime toujours).
const TRI_PAR_DEFAUT: Tri = { colonne: "date_picking", sens: "desc" };

function chargerTri(): Tri | null {
  try {
    const brut = localStorage.getItem(CLE_TRI);
    return brut ? (JSON.parse(brut) as Tri) : TRI_PAR_DEFAUT;
  } catch {
    return TRI_PAR_DEFAUT;
  }
}

function sauvegarderTri(tri: Tri | null) {
  if (tri) localStorage.setItem(CLE_TRI, JSON.stringify(tri));
  else localStorage.removeItem(CLE_TRI);
}

// null = pas de filtre actif sur cette colonne (tout affiché) ; sinon ensemble des valeurs
// sélectionnées (au format texte affiché, ex. "Oui"/"" pour les booléens).
type Filtres = Partial<Record<Champ, string[]>>;

function chargerFiltres(): Filtres {
  try {
    const brut = localStorage.getItem(CLE_FILTRES);
    return brut ? (JSON.parse(brut) as Filtres) : {};
  } catch {
    return {};
  }
}

function sauvegarderFiltres(filtres: Filtres) {
  if (Object.keys(filtres).length === 0) localStorage.removeItem(CLE_FILTRES);
  else localStorage.setItem(CLE_FILTRES, JSON.stringify(filtres));
}

const CLE_COLONNES_VISIBLES = "caisses:colonnesVisibles:demandes";
const CLE_COMPACT = "caisses:compact:demandes";

// Colonnes ajoutées après coup : visibles d'office la première fois, même si le poste avait déjà
// enregistré sa liste de colonnes visibles (sinon elles resteraient cachées sans qu'on le sache).
const NOUVELLES_COLONNES: Colonne[] = ["taux_remplissage"];
const CLE_COLONNES_CONNUES = "caisses:colonnesConnues:demandes";

function chargerColonnesVisibles(toutesLesColonnes: Colonne[]): Set<Colonne> {
  try {
    const brut = localStorage.getItem(CLE_COLONNES_VISIBLES);
    if (!brut) return new Set(toutesLesColonnes);
    const visibles = new Set(JSON.parse(brut) as Colonne[]);
    const connues = new Set(JSON.parse(localStorage.getItem(CLE_COLONNES_CONNUES) ?? "[]") as Colonne[]);
    for (const c of NOUVELLES_COLONNES) if (!connues.has(c)) visibles.add(c);
    localStorage.setItem(CLE_COLONNES_CONNUES, JSON.stringify(toutesLesColonnes));
    return visibles;
  } catch {
    return new Set(toutesLesColonnes);
  }
}

function sauvegarderColonnesVisibles(visibles: Set<Colonne>) {
  localStorage.setItem(CLE_COLONNES_VISIBLES, JSON.stringify([...visibles]));
  localStorage.setItem(CLE_COLONNES_CONNUES, JSON.stringify(TOUTES_LES_COLONNES));
}

// Ordre des colonnes choisi dans Options (2026-10-02) ; une colonne inconnue de l'ordre
// enregistré (ajoutée depuis) se place à sa position par défaut.
const CLE_ORDRE_COLONNES = "caisses:ordreColonnes:demandes";

function chargerOrdreColonnes(): Colonne[] {
  try {
    const brut = localStorage.getItem(CLE_ORDRE_COLONNES);
    if (!brut) return TOUTES_LES_COLONNES;
    const ordre = (JSON.parse(brut) as Colonne[]).filter((c) => TOUTES_LES_COLONNES.includes(c));
    for (const c of TOUTES_LES_COLONNES) {
      if (ordre.includes(c)) continue;
      const iDefaut = TOUTES_LES_COLONNES.indexOf(c);
      const precedente = TOUTES_LES_COLONNES.slice(0, iDefaut).reverse().find((p) => ordre.includes(p));
      ordre.splice(precedente ? ordre.indexOf(precedente) + 1 : 0, 0, c);
    }
    return ordre;
  } catch {
    return TOUTES_LES_COLONNES;
  }
}

function sauvegarderOrdreColonnes(ordre: Colonne[] | null) {
  try {
    if (ordre) localStorage.setItem(CLE_ORDRE_COLONNES, JSON.stringify(ordre));
    else localStorage.removeItem(CLE_ORDRE_COLONNES);
  } catch {
    // stockage indisponible : l'ordre reste valable pour la session
  }
}

function chargerCompact(): boolean {
  return localStorage.getItem(CLE_COMPACT) === "1";
}

function sauvegarderCompact(compact: boolean) {
  if (compact) localStorage.setItem(CLE_COMPACT, "1");
  else localStorage.removeItem(CLE_COMPACT);
}

const CLE_MASQUER_VALIDEES = "caisses:masquerValidees:demandes";

function chargerMasquerValidees(): boolean {
  return localStorage.getItem(CLE_MASQUER_VALIDEES) === "1";
}

function sauvegarderMasquerValidees(masquer: boolean) {
  if (masquer) localStorage.setItem(CLE_MASQUER_VALIDEES, "1");
  else localStorage.removeItem(CLE_MASQUER_VALIDEES);
}

// "Tableau inversé" : les lignes les plus anciennes en haut, les plus récentes en bas — pour
// reproduire l'habitude Excel de remplir de haut en bas. Réglage par poste (localStorage).
const CLE_INVERSE = "caisses:inverse:demandes";

function chargerInverse(): boolean {
  return localStorage.getItem(CLE_INVERSE) === "1";
}

function sauvegarderInverse(inverse: boolean) {
  if (inverse) localStorage.setItem(CLE_INVERSE, "1");
  else localStorage.removeItem(CLE_INVERSE);
}

const CLE_LARGEURS = "caisses:largeursColonnes:demandes";
const LARGEUR_MIN = 40;

function chargerLargeurs(): Partial<Record<Colonne, number>> {
  try {
    const brut = localStorage.getItem(CLE_LARGEURS);
    return brut ? (JSON.parse(brut) as Partial<Record<Colonne, number>>) : {};
  } catch {
    return {};
  }
}

function sauvegarderLargeurs(largeurs: Partial<Record<Colonne, number>>) {
  localStorage.setItem(CLE_LARGEURS, JSON.stringify(largeurs));
}

// Champs à valeurs prédéfinies : l'édition inline ouvre une liste déroulante (avec "Autre…"
// pour rester saisissable librement) plutôt qu'un simple champ texte. Les listes moteurs /
// module linéaire / terminaux sont étendues par les options personnalisées (cf. buildOptions).
function buildOptions(perso: OptionListe[]): {
  parChamp: Partial<Record<Champ, string[]>>;
  parChampSousLigne: Partial<Record<keyof DemandeCaisse, string[]>>;
} {
  const moteurs = optionsListe("moteurs", perso);
  const moduleLineaire = optionsListe("module_lineaire", perso);
  const terminaux = optionsListe("terminaux", perso);
  // Note : `type_ouverture` n'est PAS ici — ses options dépendent de l'état de chaque caisse
  // (4C / caisse en stock), calculées par cellule via ouverturesAutorisees().
  return {
    parChamp: {
      type_envoi_caisse: TYPES_ENVOI_CAISSE,
      moteurs,
      module_lineaire: moduleLineaire,
      terminaux,
      traitement: TRAITEMENTS,
    },
    parChampSousLigne: {
      moteurs,
      module_lineaire: moduleLineaire,
      terminaux,
      traitement: TRAITEMENTS,
    },
  };
}

const CHAMPS_BOOL: ReadonlySet<Champ> = new Set(["ok_pour_passer_cde", "cde_passee_affaire", "cde_passee_achat_stock"]);
const CHAMPS_NOMBRE: ReadonlySet<Champ> = new Set(["longueur_mm", "largeur_mm", "hauteur_mm", "quantite"]);
const CHAMPS_DIM: ReadonlySet<Champ> = new Set(["longueur_mm", "largeur_mm", "hauteur_mm"]);
const CHAMPS_DATE: ReadonlySet<Champ> = new Set(["date_picking", "date_demandee_s2c"]);

function valeurTexte(d: Demande, champ: Champ): string {
  const v = d[champ];
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  if (CHAMPS_DATE.has(champ)) return dateIsoVersAffichage(String(v));
  if (CHAMPS_DIM.has(champ)) return ((v as number) / 1000).toFixed(2);
  return String(v);
}

// align: "center" pour les dates et Qté, "left" (défaut) pour tout le reste — toutes les
// valeurs texte sont alignées à gauche avec une petite marge (cf. tdStyle).
const COLONNES: { champ: Colonne; label: string; align?: "left" | "center" }[] = [
  { champ: "ok_pour_passer_cde", label: "OK pour être commandée" },
  { champ: "affaire", label: "Affaire" },
  { champ: "type_envoi_caisse", label: "Type envoi caisse" },
  { champ: "type_ouverture", label: "Type ouverture" },
  { champ: "stock", label: "Stock" },
  { champ: "longueur_mm", label: "Long. (m)" },
  { champ: "largeur_mm", label: "Larg. (m)" },
  { champ: "hauteur_mm", label: "Haut. (m)" },
  { champ: "quantite", label: "Qté", align: "center" },
  { champ: "date_picking", label: "Date picking", align: "center" },
  { champ: "date_demandee_s2c", label: "Date dem. S2C", align: "center" },
  { champ: "moteurs", label: "Moteurs" },
  { champ: "module_lineaire", label: "Module linéaire" },
  { champ: "terminaux", label: "Terminaux" },
  { champ: "traitement", label: "Traitement" },
  { champ: "informations_supp", label: "Infos suppl." },
  { champ: "cde_passee_affaire", label: "Cde passée affaire" },
  { champ: "cde_passee_achat_stock", label: "Cde passée achat stock" },
  // Calculée : taux de remplissage de l'affaire simulée du même nom (non filtrable).
  { champ: "taux_remplissage", label: "Taux de remplissage" },
  // `observations` reste un champ (marqueur Livré/Reçu) mais n'est plus affiché en colonne.
];

const TOUTES_LES_COLONNES = COLONNES.map((c) => c.champ);

export default function DemandesTable({
  demandes,
  demandeCaisses,
  caissesStock,
  lignesEtendues,
  onToggleEtendue,
  onCreerDemandeCaisse,
  onEditDemandeCaisse,
  onDeleteDemandeCaisse,
  onSelectStock,
  onSelectStockSousLigne,
  onEdit,
  onDelete,
  onValider,
  onSimulerAffaire,
  optionsPersonnalisees,
  slotOptions,
  readOnly,
  tauxRemplissage,
}: Props) {
  const { parChamp: optionsParChamp, parChampSousLigne: optionsParChampSousLigne } = useMemo(
    () => buildOptions(optionsPersonnalisees),
    [optionsPersonnalisees],
  );
  const [cellEnEdition, setCellEnEdition] = useState<{ id: number; champ: Champ } | null>(null);
  const [tri, setTri] = useState<Tri | null>(() => chargerTri());
  const [filtres, setFiltres] = useState<Filtres>(() => chargerFiltres());
  const [menuOuvert, setMenuOuvert] = useState<Champ | null>(null);
  const [colonnesVisibles, setColonnesVisibles] = useState<Set<Colonne>>(() => chargerColonnesVisibles(TOUTES_LES_COLONNES));
  const [ordreColonnes, setOrdreColonnes] = useState<Colonne[]>(() => chargerOrdreColonnes());
  const [compact, setCompact] = useState(() => chargerCompact());
  const [masquerValidees, setMasquerValidees] = useState(() => chargerMasquerValidees());
  const [inverse, setInverse] = useState(() => chargerInverse());
  const [largeurs, setLargeurs] = useState<Partial<Record<Colonne, number>>>(() => chargerLargeurs());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const boutonsFiltreRef = useRef<Partial<Record<Champ, HTMLButtonElement>>>({});
  const redimensionnement = useRef<{ champ: Colonne; xDepart: number; largeurDepart: number } | null>(null);
  const conteneurScrollRef = useRef<HTMLDivElement>(null);

  function commencerRedimensionnement(e: React.PointerEvent, champ: Colonne, largeurActuelle: number) {
    e.preventDefault();
    e.stopPropagation();
    redimensionnement.current = { champ, xDepart: e.clientX, largeurDepart: largeurActuelle };

    function onMove(ev: PointerEvent) {
      if (!redimensionnement.current) return;
      const { champ, xDepart, largeurDepart } = redimensionnement.current;
      const nouvelle = Math.max(LARGEUR_MIN, largeurDepart + (ev.clientX - xDepart));
      setLargeurs((prev) => ({ ...prev, [champ]: nouvelle }));
    }
    function onUp() {
      redimensionnement.current = null;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      setLargeurs((prev) => {
        sauvegarderLargeurs(prev);
        return prev;
      });
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  function largeurColonne(champ: Colonne): number {
    return largeurs[champ] ?? (compact ? 90 : 130);
  }

  // Une ligne sélectionnée peut disparaître du brouillon (suppression de l'affaire avant
  // enregistrement) sans passer par toggleSelect/validerSelection — purger la sélection pour
  // qu'elle ne référence jamais un id qui n'existe plus, sinon la barre d'actions groupées
  // (« Valider la sélection ») reste affichée à tort.
  useEffect(() => {
    setSelectedIds((prev) => {
      const ids = new Set(demandes.map((d) => d.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [demandes]);

  function changerColonnesVisibles(visibles: Set<Colonne>) {
    setColonnesVisibles(visibles);
    sauvegarderColonnesVisibles(visibles);
  }

  // null = ordre par défaut.
  function changerOrdreColonnes(ordre: Colonne[] | null) {
    setOrdreColonnes(ordre ?? TOUTES_LES_COLONNES);
    sauvegarderOrdreColonnes(ordre);
  }

  function changerCompact(v: boolean) {
    setCompact(v);
    sauvegarderCompact(v);
  }

  function changerMasquerValidees(v: boolean) {
    setMasquerValidees(v);
    sauvegarderMasquerValidees(v);
  }

  function changerInverse(v: boolean) {
    setInverse(v);
    sauvegarderInverse(v);
    // À l'activation, aller directement en bas du tableau (là où se fait la nouvelle saisie).
    if (v) {
      requestAnimationFrame(() => {
        const el = conteneurScrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === demandesTriees.length ? new Set() : new Set(demandesTriees.map((d) => d.id))));
  }

  function validerSelection(validee: boolean) {
    for (const id of selectedIds) onValider(id, validee);
    setSelectedIds(new Set());
  }

  const colonnesAffichees = ordreColonnes
    .map((id) => COLONNES.find((c) => c.champ === id)!)
    .filter((c) => c && colonnesVisibles.has(c.champ));

  // Colonnes qui passent par EditableCellInput (texte/nombre/date) — les booléens et "stock"
  // ont leur propre widget (case à cocher / <select>) et ne font pas partie du parcours Tab.
  const champsEditablesOrdre = colonnesAffichees
    .map((c) => c.champ)
    .filter((champ): champ is Champ => champ !== "taux_remplissage" && !CHAMPS_BOOL.has(champ) && champ !== "stock");

  function champEditableSuivant(champActuel: Champ, backward: boolean): Champ | null {
    const index = champsEditablesOrdre.indexOf(champActuel);
    if (index === -1) return null;
    const prochainIndex = backward ? index - 1 : index + 1;
    return champsEditablesOrdre[prochainIndex] ?? null;
  }

  const demandesVisibles = masquerValidees ? demandes.filter((d) => !estDemandeValidee(d)) : demandes;

  const demandesFiltrees = useMemo(() => {
    const colonnesFiltrees = Object.entries(filtres) as [Champ, string[]][];
    if (colonnesFiltrees.length === 0) return demandesVisibles;
    return demandesVisibles.filter((d) => colonnesFiltrees.every(([champ, valeurs]) => valeurs.includes(valeurTexte(d, champ))));
  }, [demandesVisibles, filtres]);

  const demandesTriees = useMemo(() => {
    if (!tri) return demandesFiltrees;
    const facteur = tri.sens === "asc" ? 1 : -1;
    const valeur = (d: Demande): string | number => {
      const v = d[tri.colonne];
      if (typeof v === "boolean") return v ? 1 : 0;
      if (typeof v === "number") return v;
      return String(v).toLowerCase();
    };
    return [...demandesFiltrees].sort((a, b) => {
      const va = valeur(a);
      const vb = valeur(b);
      if (va < vb) return -1 * facteur;
      if (va > vb) return 1 * facteur;
      return 0;
    });
  }, [demandesFiltrees, tri]);

  // Ordre d'affichage effectif : le tableau inversé retourne la liste triée pour placer les
  // lignes les plus anciennes en haut (saisie de haut en bas façon Excel).
  const demandesAffichees = useMemo(
    () => (inverse ? [...demandesTriees].reverse() : demandesTriees),
    [demandesTriees, inverse],
  );

  function appliquerFiltreColonne(champ: Champ, selection: Set<string> | null, sens: "asc" | "desc" | null) {
    setFiltres((prev) => {
      const next = { ...prev };
      if (selection === null) delete next[champ];
      else next[champ] = [...selection];
      sauvegarderFiltres(next);
      return next;
    });
    // Ne modifie le tri global que si l'utilisateur a choisi un sens pour cette colonne, ou
    // s'il retire le tri qui portait déjà dessus — sans ça, valider le filtre d'une colonne
    // non triée effacerait à tort le tri actif sur une autre colonne.
    if (sens) {
      const nextTri: Tri = { colonne: champ, sens };
      setTri(nextTri);
      sauvegarderTri(nextTri);
    } else if (tri?.colonne === champ) {
      setTri(null);
      sauvegarderTri(null);
    }
  }

  async function sauvegarderChamp(demande: Demande, champ: Champ, valeurBrute: string) {
    setCellEnEdition(null);
    const nombre = Number(valeurBrute.replace(",", ".")) || 0;
    // Arrondi au mm : 0.56 * 1000 = 560.0000000000001, qui passerait pour une modification.
    const valeur = CHAMPS_DIM.has(champ) ? Math.round(nombre * 1000) : CHAMPS_NOMBRE.has(champ) ? nombre : valeurBrute;
    if (demande[champ] === valeur) return;
    // Même règle qu'à la création (AjouterDemandesDialog, AffairesList) : exactement 8 caractères.
    if (champ === "affaire" && String(valeur).trim().length !== 8) {
      await confirmerAction("Le nom d'affaire doit comporter exactement 8 caractères.", "Nom d'affaire invalide");
      return;
    }
    // Avertissement (pas de blocage strict) si la date demandée à S2C saisie est dans le passé —
    // édition inline uniquement, comme dans AjouterDemandesDialog.
    if (champ === "date_demandee_s2c" && dateEstDansLePasse(String(valeur))) {
      const confirme = await confirmerAction("La date demandée à S2C est dans le passé. Confirmer cette date ?", "Date passée");
      if (!confirme) return;
    }
    // Changer le type d'envoi applique les règles dynamiques (ouverture autorisée, NIMP15,
    // contre-plaqué), cf. appliquerReglesCaisse.
    if (champ === "type_envoi_caisse") {
      const regles = appliquerReglesCaisse({
        type_envoi_caisse: String(valeur),
        type_ouverture: demande.type_ouverture,
        traitement: demande.traitement,
        caisse_stock_id: demande.caisse_stock_id,
      });
      onEdit(demande.id, { type_envoi_caisse: valeur as string, ...regles });
      return;
    }
    onEdit(demande.id, { [champ]: valeur });
  }

  async function toggleBool(demande: Demande, champ: "ok_pour_passer_cde" | "cde_passee_affaire" | "cde_passee_achat_stock") {
    const nouvelle = !demande[champ];
    if (champ === "ok_pour_passer_cde" && nouvelle) {
      const manquants = champsManquantsPourCommande(demande);
      if (manquants.length > 0) {
        await confirmerAction(
          `Champ(s) manquant(s) : ${manquants.join(", ")}.`,
          "Impossible de cocher « OK pour être commandée »",
        );
        return;
      }
    }
    if (champ === "cde_passee_affaire" && nouvelle) {
      onEdit(demande.id, { cde_passee_affaire: true, cde_passee_achat_stock: false });
    } else if (champ === "cde_passee_achat_stock" && nouvelle) {
      onEdit(demande.id, { cde_passee_achat_stock: true, cde_passee_affaire: false });
    } else {
      onEdit(demande.id, { [champ]: nouvelle });
    }
  }

  function cell(demande: Demande, champ: Champ, align: "left" | "center" = "left", td: React.CSSProperties = tdStyle) {
    // Ligne livrée / rapatriée : plus rien n'est modifiable (seul « Non livré » reste possible).
    const figee = readOnly || estDemandeValidee(demande);
    if (CHAMPS_BOOL.has(champ)) {
      return (
        <td style={{ ...td, textAlign: "center" }}>
          <input
            type="checkbox"
            checked={demande[champ] as boolean}
            disabled={figee}
            onChange={() => toggleBool(demande, champ as "ok_pour_passer_cde" | "cde_passee_affaire" | "cde_passee_achat_stock")}
          />
        </td>
      );
    }
    if (champ === "stock") {
      const options = caissesStock.filter((c) => !c.validee || c.id === demande.caisse_stock_id);
      return (
        <td style={{ ...td, textAlign: align, width: largeurColonne(champ), maxWidth: largeurColonne(champ) }}>
          <select
            value={demande.caisse_stock_id ?? ""}
            disabled={figee || (!stockAutorisePourEnvoi(demande.type_envoi_caisse) && demande.caisse_stock_id == null)}
            title={stockAutorisePourEnvoi(demande.type_envoi_caisse) ? undefined : "Pas de caisse en stock pour un envoi 4B / 4C"}
            onChange={(e) => onSelectStock(demande.id, e.target.value === "" ? null : Number(e.target.value))}
            style={{ width: "100%", border: "none", background: "transparent", font: "inherit", color: "inherit" }}
          >
            <option value="">—</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {libelleCaisseStock(c)}
              </option>
            ))}
          </select>
        </td>
      );
    }
    const enEdition = cellEnEdition?.id === demande.id && cellEnEdition.champ === champ;
    const estNombre = CHAMPS_NOMBRE.has(champ);
    const estDim = CHAMPS_DIM.has(champ);
    const estDate = CHAMPS_DATE.has(champ);
    const valeurBrute = demande[champ] as string | number;
    const valeurAffichee = estDim
      ? ((valeurBrute as number) / 1000).toFixed(2)
      : estDate
        ? dateIsoVersAffichage(String(valeurBrute))
        : valeurBrute;
    const largeur = largeurColonne(champ);
    const avertissementMousse = champ === "type_envoi_caisse" && estCaisse4C(demande.type_envoi_caisse) ? AVERTISSEMENT_MOUSSE_4C : undefined;
    const avertissementMesures4C = CHAMPS_DIM.has(champ)
      ? depassementMesuresMax4C(demande.type_envoi_caisse, demande.longueur_mm, demande.largeur_mm, demande.hauteur_mm)
      : undefined;
    const ouvertureVerrouillee = champ === "type_ouverture" && ouvertureImposee(demande) !== null;
    const avertissement = ouvertureVerrouillee ? motifOuvertureImposee(demande) : (avertissementMousse ?? avertissementMesures4C);
    const nonEditable = figee || ouvertureVerrouillee;
    return (
      <td
        style={{
          ...td,
          textAlign: align,
          cursor: nonEditable ? "default" : "text",
          padding: enEdition ? 2 : td.padding,
          width: largeur,
          maxWidth: largeur,
          whiteSpace: "normal",
          wordBreak: "break-word",
          fontWeight: champ === "affaire" ? 700 : undefined,
        }}
        className={estNombre ? "mono" : undefined}
        title={avertissement}
        onClick={() => !nonEditable && !enEdition && setCellEnEdition({ id: demande.id, champ })}
      >
        {enEdition && champ === "type_ouverture" ? (
          <EditableCellSelect
            defaultValue={String(valeurBrute)}
            options={ouverturesAutorisees(demande)}
            onCommit={(v) => sauvegarderChamp(demande, champ, v)}
            onCancel={() => setCellEnEdition(null)}
          />
        ) : enEdition && optionsParChamp[champ] !== undefined ? (
          <EditableCellSelect
            defaultValue={String(valeurBrute)}
            options={optionsParChamp[champ]!}
            onCommit={(v) => sauvegarderChamp(demande, champ, v)}
            onCancel={() => setCellEnEdition(null)}
          />
        ) : enEdition ? (
          <EditableCellInput
            type={estDate ? "date" : estNombre ? "number" : "text"}
            defaultValue={estDim ? String((valeurBrute as number) / 1000) : String(valeurBrute)}
            align={align}
            onCommit={(v) => sauvegarderChamp(demande, champ, v)}
            onCancel={() => setCellEnEdition(null)}
            onTabNext={(backward) => {
              const suivant = champEditableSuivant(champ, backward);
              setCellEnEdition(suivant ? { id: demande.id, champ: suivant } : null);
            }}
          />
        ) : (
          <>
            {valeurAffichee}
            {avertissement && <AvertissementBadge texte={avertissement} rouge={!avertissementMousse && Boolean(avertissementMesures4C)} />}
          </>
        )}
      </td>
    );
  }

  function thFiltrable(champ: Champ, label: string, align: "left" | "center" = "left", th: React.CSSProperties = thStyle) {
    const actif = tri?.colonne === champ;
    const filtreActif = filtres[champ] !== undefined;
    // Valeurs proposées au filtre : uniquement celles des lignes actuellement visibles —
    // « masquer les caisses reçues » et les filtres des AUTRES colonnes sont pris en compte,
    // pour ne jamais proposer une valeur qui vide le tableau une fois sélectionnée.
    const autresFiltres = Object.entries(filtres).filter(([c]) => c !== champ) as [Champ, string[]][];
    const baseValeurs = demandesVisibles.filter((d) =>
      autresFiltres.every(([c, vals]) => vals.includes(valeurTexte(d, c))),
    );
    const valeursDistinctes = [...new Set(baseValeurs.map((d) => valeurTexte(d, champ)))].sort((a, b) =>
      a.localeCompare(b),
    );
    const selection = filtres[champ] ? new Set(filtres[champ]) : null;
    const largeur = largeurColonne(champ);
    return (
      <th
        className="th-filtrable"
        style={{
          ...th,
          textAlign: align,
          position: "sticky",
          top: 0,
          width: largeur,
          maxWidth: largeur,
          // Un filtre actif sur la colonne teinte son en-tête (repère visuel).
          background: filtreActif ? "var(--filtre-actif-bg)" : th.background,
          verticalAlign: "top",
          paddingBottom: 26,
        }}
      >
        {/* Libellé en haut (il peut passer sur plusieurs lignes à gauche), icône fixée en bas à
            droite de la cellule. L'espace réservé en fin de texte empêche l'icône de le recouvrir,
            même quand la colonne est étroite (retour utilisateur du 2026-10-02). */}
        <div style={{ textAlign: align, wordBreak: "keep-all", overflowWrap: "normal" }}>
          {label}
          <span aria-hidden="true" style={{ display: "inline-block", width: actif ? 34 : 24 }} />
        </div>
        <button
            ref={(el) => {
              if (el) boutonsFiltreRef.current[champ] = el;
            }}
            onClick={() => setMenuOuvert((prev) => (prev === champ ? null : champ))}
            title={filtreActif ? "Filtre actif — trier et filtrer" : "Trier et filtrer"}
            className={`btn-filtre-colonne${actif || filtreActif ? " btn-filtre-colonne-actif" : ""}`}
            style={{
              position: "absolute",
              right: 8,
              bottom: 5,
              background: filtreActif ? "var(--accent)" : "none",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              padding: "3px 4px",
              display: "inline-flex",
              alignItems: "center",
              gap: 2,
              fontSize: 10,
              lineHeight: 1,
              color: filtreActif ? "#fff" : actif ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            <IconeFiltre plein={filtreActif} />
            {actif && (tri!.sens === "asc" ? "▲" : "▼")}
          </button>
        {menuOuvert === champ && boutonsFiltreRef.current[champ] && (
          <ColumnFilterMenu
            valeurs={valeursDistinctes}
            selection={selection}
            onApply={(s, sens) => appliquerFiltreColonne(champ, s, sens)}
            triActif={actif ? tri!.sens : null}
            onClose={() => setMenuOuvert(null)}
            ancre={boutonsFiltreRef.current[champ]!}
            estDate={CHAMPS_DATE.has(champ)}
          />
        )}
        <div
          onPointerDown={(e) => commencerRedimensionnement(e, champ, largeur)}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: 6,
            cursor: "col-resize",
            touchAction: "none",
          }}
        />
      </th>
    );
  }

  const yATrouFiltre = Object.keys(filtres).length > 0;
  const th = compact ? thStyleCompact : thStyle;
  const td = compact ? tdStyleCompact : tdStyle;
  const colonnesAvecLargeur = colonnesAffichees.map((c) => ({ ...c, largeur: largeurColonne(c.champ) }));

  const optionsMenu = (
    <TableOptionsMenu
      colonnes={ordreColonnes.map((id) => ({ champ: id, label: COLONNES.find((c) => c.champ === id)!.label }))}
      onChangeOrdre={changerOrdreColonnes}
      colonnesVisibles={colonnesVisibles}
      onChangeColonnesVisibles={changerColonnesVisibles}
      compact={compact}
      onChangeCompact={changerCompact}
      masquerValidees={masquerValidees}
      onChangeMasquerValidees={changerMasquerValidees}
      inverse={inverse}
      onChangeInverse={changerInverse}
    />
  );

  return (
    <div>
      {slotOptions ? createPortal(optionsMenu, slotOptions) : null}
      {(selectedIds.size > 0 && !readOnly) || !slotOptions ? (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            background: selectedIds.size > 0 && !readOnly ? "var(--accent-soft)" : undefined,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div>
            {selectedIds.size > 0 && !readOnly && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button className="btn btn-sm btn-primary" onClick={() => validerSelection(true)}>
                  Valider la sélection ({selectedIds.size})
                </button>
                <button className="btn btn-sm" onClick={() => validerSelection(false)}>
                  Non livré (sélection)
                </button>
              </div>
            )}
          </div>
          {!slotOptions && optionsMenu}
        </div>
      ) : null}
      <div ref={conteneurScrollRef} style={{ overflow: "auto", maxHeight: "calc(100vh - 220px)", paddingBottom: 80 }}>
        <table
          style={{
            fontSize: compact ? 12 : 13,
            borderCollapse: "separate",
            borderSpacing: 0,
            tableLayout: "fixed",
          }}
        >
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
              <th style={{ ...th, width: 44 }}></th>
              <th style={{ ...th, width: 32 }}>
                <input
                  type="checkbox"
                  checked={demandesTriees.length > 0 && selectedIds.size === demandesTriees.length}
                  onChange={toggleSelectAll}
                />
              </th>
              {colonnesAffichees.map((c) =>
                c.champ === "taux_remplissage" ? (
                  <th
                    key={c.champ}
                    style={{ ...th, position: "sticky", top: 0, verticalAlign: "top", textAlign: "center", width: largeurColonne(c.champ), maxWidth: largeurColonne(c.champ) }}
                  >
                    {c.label}
                    <div
                      onPointerDown={(e) => commencerRedimensionnement(e, c.champ, largeurColonne(c.champ))}
                      style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 6, cursor: "col-resize", touchAction: "none" }}
                    />
                  </th>
                ) : (
                  <Fragment key={c.champ}>{thFiltrable(c.champ, c.label, c.align, th)}</Fragment>
                ),
              )}
              <th style={{ ...th, width: 210 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {demandes.length === 0 ? (
              <tr>
                <td colSpan={colonnesAffichees.length + 3} style={{ ...td, textAlign: "center", color: "var(--text-muted)", padding: "20px 8px" }}>
                  Aucune demande. Ajoutez-en une avec « + Créer une nouvelle caisse ».
                </td>
              </tr>
            ) : demandesTriees.length === 0 ? (
              <tr>
                <td colSpan={colonnesAffichees.length + 3} style={{ ...td, textAlign: "center", color: "var(--text-muted)", padding: "20px 8px" }}>
                  {yATrouFiltre
                    ? "Aucune demande ne correspond aux filtres actifs."
                    : masquerValidees
                      ? "Aucune demande non validée."
                      : "Aucune demande."}
                </td>
              </tr>
            ) : (
              demandesAffichees.map((d) => {
                const estValidee = estDemandeValidee(d);
                const sousLignes = demandeCaisses.filter((c) => c.demande_id === d.id);
                const etendue = lignesEtendues.has(d.id);
                return (
                  <Fragment key={d.id}>
                    <tr
                      className="article-row"
                      style={{
                        background: selectedIds.has(d.id)
                          ? "var(--accent-soft-strong)"
                          : estValidee
                            ? "var(--success-bg, #d4f4dd)"
                            : d.ok_pour_passer_cde
                              ? "#f5eee0"
                              : undefined,
                      }}
                    >
                      <td style={{ ...td, textAlign: "center", whiteSpace: "nowrap" }}>
                        {estACommanderUrgent(d) && <PastilleAlerte titre={MESSAGE_ALERTE_COMMANDE} />}
                        {sousLignes.length > 0 && (
                          <button
                            onClick={() => onToggleEtendue(d.id)}
                            title={etendue ? "Replier les caisses détaillées" : "Déplier les caisses détaillées"}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: 4,
                              fontSize: 18,
                              lineHeight: 1,
                              color: "var(--text-muted)",
                            }}
                          >
                            {etendue ? "▾" : "▸"}
                          </button>
                        )}
                      </td>
                      <td style={td}>
                        <input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => toggleSelect(d.id)} />
                      </td>
                      {colonnesAffichees.map((c) =>
                        c.champ === "taux_remplissage" ? (
                          <td key={c.champ} style={{ ...td, textAlign: "center", width: largeurColonne(c.champ), maxWidth: largeurColonne(c.champ) }}>
                            {(() => {
                              const t = tauxRemplissage?.mere(d);
                              return t ? <TauxRemplissage caisses={t.caisses} seuil={t.seuil} pastille /> : null;
                            })()}
                          </td>
                        ) : (
                          <Fragment key={c.champ}>{cell(d, c.champ, c.align, td)}</Fragment>
                        ),
                      )}
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        <div style={actionsLigneStyle}>
                          <button className="btn btn-sm btn-pastel-green" onClick={() => onValider(d.id, !estValidee)} disabled={readOnly}>
                            {estValidee ? "Non livré" : "Livré"}
                          </button>
                          <button className="btn btn-sm btn-pastel-orange" onClick={() => onSimulerAffaire(d)}>
                            Simuler
                          </button>
                          <button className="btn btn-sm btn-pastel-blue" onClick={() => onCreerDemandeCaisse(d)} disabled={readOnly || estValidee}>
                            + Caisse
                          </button>
                          <button className="btn btn-sm btn-danger" onClick={() => onDelete(d.id, d.affaire)} disabled={readOnly || estValidee}>
                            Suppr.
                          </button>
                        </div>
                      </td>
                    </tr>
                    {etendue &&
                      sousLignes.map((sc, index) => (
                        <SousLigneCaisse
                          key={sc.id}
                          caisse={sc}
                          colonnesAffichees={colonnesAvecLargeur}
                          caissesStock={caissesStock}
                          optionsParChamp={optionsParChampSousLigne}
                          td={td}
                          readOnly={readOnly || estValidee || estDemandeCaisseValidee(sc, d)}
                          coloredBackground={
                            estDemandeCaisseValidee(sc, d)
                              ? "var(--success-bg, #d4f4dd)"
                              : PALETTE_CAISSES[index % PALETTE_CAISSES.length]
                          }
                          onEdit={(patch) => onEditDemandeCaisse(sc.id, patch)}
                          onDelete={() => onDeleteDemandeCaisse(sc.id)}
                          onSelectStock={(id) => onSelectStockSousLigne(sc.id, id)}
                          taux={tauxRemplissage?.sous(sc, d) ?? null}
                        />
                      ))}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ScrollToTopButton cible={conteneurScrollRef} />
    </div>
  );
}

// Correspondance entre les colonnes de la demande parente et le champ équivalent porté par une
// sous-caisse — permet d'aligner chaque valeur sous la colonne du tableau qui lui correspond,
// pour que la sous-ligne se lise visuellement comme une vraie ligne du même tableau plutôt qu'un
// mini-formulaire séparé. `null` = pas d'équivalent, la cellule reste vide sous cette colonne.
const CHAMP_SOUS_LIGNE: Partial<Record<Colonne, keyof DemandeCaisse>> = {
  affaire: "nom",
  type_envoi_caisse: "type_envoi_caisse",
  type_ouverture: "type_ouverture",
  stock: "stock",
  date_picking: "date_picking",
  date_demandee_s2c: "date_demandee_s2c",
  traitement: "traitement",
  quantite: "quantite",
  moteurs: "moteurs",
  module_lineaire: "module_lineaire",
  terminaux: "terminaux",
  informations_supp: "informations_supp",
  observations: "observations",
  longueur_mm: "longueur_mm",
  largeur_mm: "largeur_mm",
  hauteur_mm: "hauteur_mm",
  cde_passee_affaire: "cde_passee_affaire",
  cde_passee_achat_stock: "cde_passee_achat_stock",
};

const CHAMPS_DIM_SOUS_LIGNE: ReadonlySet<keyof DemandeCaisse> = new Set(["longueur_mm", "largeur_mm", "hauteur_mm"]);
const CHAMPS_NOMBRE_SOUS_LIGNE: ReadonlySet<keyof DemandeCaisse> = new Set(["quantite"]);
const CHAMPS_BOOL_SOUS_LIGNE: ReadonlySet<keyof DemandeCaisse> = new Set(["cde_passee_affaire", "cde_passee_achat_stock"]);
const CHAMPS_DATE_SOUS_LIGNE: ReadonlySet<keyof DemandeCaisse> = new Set(["date_picking", "date_demandee_s2c"]);
// Champs copiés depuis la demande mère à la création et jamais modifiables sur la sous-ligne —
// seule la mère fait foi pour ces informations, la sous-ligne ne détaille que dims/traitement/cde.
const CHAMPS_VERROUILLES_SOUS_LIGNE: ReadonlySet<keyof DemandeCaisse> = new Set(["nom", "type_envoi_caisse", "date_picking"]);

function SousLigneCaisse({
  caisse,
  colonnesAffichees,
  caissesStock,
  optionsParChamp,
  td,
  readOnly,
  coloredBackground,
  onEdit,
  onDelete,
  onSelectStock,
  taux,
}: {
  caisse: DemandeCaisse;
  colonnesAffichees: { champ: Colonne; label: string; align?: "left" | "center"; largeur: number }[];
  caissesStock: CaisseStock[];
  optionsParChamp: Partial<Record<keyof DemandeCaisse, string[]>>;
  td: React.CSSProperties;
  readOnly?: boolean;
  coloredBackground?: string;
  onEdit: (patch: Partial<DemandeCaisse>) => void;
  onDelete: () => void;
  onSelectStock: (caisseStockId: number | null) => void;
  taux: TauxLigne | null;
}) {
  const [champEnEdition, setChampEnEdition] = useState<keyof DemandeCaisse | null>(null);

  // Même logique de parcours Tab que la ligne mère (cell()) : uniquement les colonnes visibles
  // qui passent par EditableCellInput, en respectant l'ordre d'affichage des colonnes.
  const champsSousLigneEditablesOrdre = colonnesAffichees
    .map((c) => CHAMP_SOUS_LIGNE[c.champ])
    .filter((champ): champ is keyof DemandeCaisse => {
      if (!champ) return false;
      if (CHAMPS_BOOL_SOUS_LIGNE.has(champ)) return false;
      if (champ === "stock") return false;
      if (CHAMPS_VERROUILLES_SOUS_LIGNE.has(champ)) return false;
      return true;
    });

  function champSousLigneEditableSuivant(champActuel: keyof DemandeCaisse, backward: boolean): keyof DemandeCaisse | null {
    const index = champsSousLigneEditablesOrdre.indexOf(champActuel);
    if (index === -1) return null;
    const prochainIndex = backward ? index - 1 : index + 1;
    return champsSousLigneEditablesOrdre[prochainIndex] ?? null;
  }

  function toggleCdePassee(champ: "cde_passee_affaire" | "cde_passee_achat_stock") {
    const nouvelle = !caisse[champ];
    if (champ === "cde_passee_affaire" && nouvelle) {
      onEdit({ cde_passee_affaire: true, cde_passee_achat_stock: false });
    } else if (champ === "cde_passee_achat_stock" && nouvelle) {
      onEdit({ cde_passee_achat_stock: true, cde_passee_affaire: false });
    } else {
      onEdit({ [champ]: nouvelle });
    }
  }

  function cellulePourColonne(colonne: { champ: Colonne; align?: "left" | "center"; largeur: number }) {
    const champSousLigne = CHAMP_SOUS_LIGNE[colonne.champ];
    const style: React.CSSProperties = {
      ...td,
      textAlign: colonne.align,
      width: colonne.largeur,
      maxWidth: colonne.largeur,
      whiteSpace: "normal",
      wordBreak: "break-word",
    };
    if (colonne.champ === "taux_remplissage") {
      return (
        <td style={{ ...style, textAlign: "center" }}>
          {taux && <TauxRemplissage caisses={taux.caisses} seuil={taux.seuil} pastille />}
        </td>
      );
    }

    if (!champSousLigne) return <td style={style} />;

    if (champSousLigne === "stock") {
      const options = caissesStock.filter((c) => !c.validee || c.id === caisse.caisse_stock_id);
      return (
        <td style={style}>
          <select
            value={caisse.caisse_stock_id ?? ""}
            disabled={readOnly || (!stockAutorisePourEnvoi(caisse.type_envoi_caisse) && caisse.caisse_stock_id == null)}
            title={stockAutorisePourEnvoi(caisse.type_envoi_caisse) ? undefined : "Pas de caisse en stock pour un envoi 4B / 4C"}
            onChange={(e) => onSelectStock(e.target.value === "" ? null : Number(e.target.value))}
            style={{ width: "100%", border: "none", background: "transparent", font: "inherit", color: "inherit" }}
          >
            <option value="">—</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {libelleCaisseStock(c)}
              </option>
            ))}
          </select>
        </td>
      );
    }

    if (CHAMPS_BOOL_SOUS_LIGNE.has(champSousLigne)) {
      return (
        <td style={{ ...style, textAlign: "center" }}>
          <input
            type="checkbox"
            checked={caisse[champSousLigne] as boolean}
            disabled={readOnly}
            onChange={() => toggleCdePassee(champSousLigne as "cde_passee_affaire" | "cde_passee_achat_stock")}
          />
        </td>
      );
    }

    const enEdition = champEnEdition === champSousLigne;
    const estDim = CHAMPS_DIM_SOUS_LIGNE.has(champSousLigne);
    const estNombre = estDim || CHAMPS_NOMBRE_SOUS_LIGNE.has(champSousLigne);
    const estDate = CHAMPS_DATE_SOUS_LIGNE.has(champSousLigne);
    const verrouille = CHAMPS_VERROUILLES_SOUS_LIGNE.has(champSousLigne);
    const ouvertureVerrouillee = champSousLigne === "type_ouverture" && ouvertureImposee(caisse) !== null;
    const editable = !readOnly && !verrouille && !ouvertureVerrouillee;
    const valeurBrute = caisse[champSousLigne] as string | number;
    const valeurAffichee = estDim
      ? ((valeurBrute as number) / 1000).toFixed(2)
      : estDate
        ? dateIsoVersAffichage(String(valeurBrute))
        : valeurBrute;
    const avertissementMesures4C = CHAMPS_DIM_SOUS_LIGNE.has(champSousLigne)
      ? depassementMesuresMax4C(caisse.type_envoi_caisse, caisse.longueur_mm, caisse.largeur_mm, caisse.hauteur_mm)
      : undefined;

    return (
      <td
        style={{
          ...style,
          cursor: editable ? "text" : "default",
          padding: enEdition ? 2 : style.padding,
        }}
        className={estNombre ? "mono" : undefined}
        title={
          verrouille
            ? "Repris de la demande — non modifiable ici"
            : ouvertureVerrouillee
              ? motifOuvertureImposee(caisse)
              : avertissementMesures4C
        }
        onClick={() => editable && !enEdition && setChampEnEdition(champSousLigne)}
      >
        {enEdition && champSousLigne === "type_ouverture" ? (
          <EditableCellSelect
            defaultValue={String(valeurBrute)}
            options={ouverturesAutorisees(caisse)}
            onCommit={(v) => {
              setChampEnEdition(null);
              if (v !== valeurBrute) onEdit({ type_ouverture: v });
            }}
            onCancel={() => setChampEnEdition(null)}
          />
        ) : enEdition && optionsParChamp[champSousLigne] !== undefined ? (
          <EditableCellSelect
            defaultValue={String(valeurBrute)}
            options={optionsParChamp[champSousLigne]!}
            onCommit={(v) => {
              setChampEnEdition(null);
              if (v !== valeurBrute) onEdit({ [champSousLigne]: v });
            }}
            onCancel={() => setChampEnEdition(null)}
          />
        ) : enEdition ? (
          <EditableCellInput
            type={estDate ? "date" : estNombre ? "number" : "text"}
            defaultValue={estDim ? String((valeurBrute as number) / 1000) : String(valeurBrute)}
            align={colonne.align ?? "left"}
            onCommit={async (v) => {
              setChampEnEdition(null);
              if (estDim) {
                const metres = Number(v.replace(",", ".")) || 0;
                onEdit({ [champSousLigne]: Math.round(metres * 1000) });
              } else if (CHAMPS_NOMBRE_SOUS_LIGNE.has(champSousLigne)) {
                onEdit({ [champSousLigne]: Math.round(Number(v.replace(",", "."))) || 0 });
              } else if (v !== valeurBrute) {
                if (champSousLigne === "date_demandee_s2c" && dateEstDansLePasse(v)) {
                  const confirme = await confirmerAction(
                    "La date demandée à S2C est dans le passé. Confirmer cette date ?",
                    "Date passée",
                  );
                  if (!confirme) return;
                }
                onEdit({ [champSousLigne]: v });
              }
            }}
            onCancel={() => setChampEnEdition(null)}
            onTabNext={(backward) => {
              const suivant = champSousLigneEditableSuivant(champSousLigne, backward);
              setChampEnEdition(suivant);
            }}
          />
        ) : (
          <>
            {valeurAffichee || "—"}
            {avertissementMesures4C && <AvertissementBadge texte={avertissementMesures4C} rouge />}
          </>
        )}
      </td>
    );
  }

  return (
    <tr style={{ background: coloredBackground ?? "var(--bg-panel-alt)" }}>
      <td style={td} />
      <td style={td} />
      {colonnesAffichees.map((c) => (
        <Fragment key={c.champ}>{cellulePourColonne(c)}</Fragment>
      ))}
      <td style={td}>
        <button className="btn btn-sm btn-danger" onClick={onDelete} disabled={readOnly}>
          Suppr.
        </button>
      </td>
    </tr>
  );
}

function EditableCellInput({
  type,
  defaultValue,
  align,
  onCommit,
  onCancel,
  onTabNext,
}: {
  type: "text" | "number" | "date";
  defaultValue: string;
  align: "left" | "center";
  onCommit: (value: string) => void;
  onCancel: () => void;
  onTabNext?: (backward: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const committed = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    // select() n'est pas supporté sur <input type="date"> dans certains navigateurs.
    if (ref.current?.type !== "date") ref.current?.select();
  }, []);

  function commitOnce() {
    if (committed.current) return;
    committed.current = true;
    onCommit(ref.current?.value ?? defaultValue);
  }

  return (
    <input
      ref={ref}
      type={type}
      defaultValue={defaultValue}
      onBlur={commitOnce}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitOnce();
        } else if (e.key === "Escape") {
          e.preventDefault();
          committed.current = true;
          onCancel();
        } else if (e.key === "Tab" && onTabNext) {
          e.preventDefault();
          commitOnce();
          onTabNext(e.shiftKey);
        }
      }}
      style={{
        width: "100%",
        textAlign: align,
        padding: "3px 6px",
        border: "1px solid var(--accent)",
        borderRadius: 4,
        font: "inherit",
      }}
    />
  );
}

// Édition inline d'un champ à valeurs prédéfinies : liste déroulante ouverte immédiatement,
// avec l'option "Autre…" qui bascule vers un champ texte libre. La valeur courante est toujours
// proposée même si elle n'est pas dans la liste (donnée historique / saisie manuelle).
const OPTION_AUTRE = "__autre__";

function EditableCellSelect({
  defaultValue,
  options,
  onCommit,
  onCancel,
}: {
  defaultValue: string;
  options: string[];
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const done = useRef(false);
  const [modeLibre, setModeLibre] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (modeLibre) inputRef.current?.focus();
    else selectRef.current?.focus();
  }, [modeLibre]);

  function commit(v: string) {
    if (done.current) return;
    done.current = true;
    onCommit(v);
  }
  function cancel() {
    if (done.current) return;
    done.current = true;
    onCancel();
  }

  if (modeLibre) {
    return (
      <input
        ref={inputRef}
        defaultValue={defaultValue}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit((e.target as HTMLInputElement).value);
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        style={{ width: "100%", padding: "3px 6px", border: "1px solid var(--accent)", borderRadius: 4, font: "inherit" }}
      />
    );
  }

  // Option pour la valeur courante hors-liste, pour ne pas la perdre à l'ouverture.
  const valeurHorsListe = defaultValue !== "" && !options.includes(defaultValue) ? defaultValue : null;

  return (
    <select
      ref={selectRef}
      defaultValue={defaultValue}
      onChange={(e) => {
        if (e.target.value === OPTION_AUTRE) setModeLibre(true);
        else commit(e.target.value);
      }}
      onBlur={(e) => {
        if (e.target.value !== OPTION_AUTRE) commit(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
      style={{ width: "100%", padding: "3px 6px", border: "1px solid var(--accent)", borderRadius: 4, font: "inherit" }}
    >
      <option value="">—</option>
      {valeurHorsListe && <option value={valeurHorsListe}>{valeurHorsListe}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value={OPTION_AUTRE}>Autre…</option>
    </select>
  );
}

// Le ⚠ historique. `rouge` (dépassement des mesures max 4C) le colore en rouge pour le
// distinguer de l'avertissement mousse 4C, qui reste orange.
function AvertissementBadge({ texte, rouge }: { texte: string; rouge?: boolean }) {
  return (
    <span
      title={texte}
      style={{ color: rouge ? "var(--danger-text)" : "var(--warn-text)", marginLeft: 4, fontSize: "1.15em" }}
    >
      ⚠
    </span>
  );
}

// Refonte visuelle 2026-10-02 : bandeau d'en-tête teinté, séparateurs verticaux très légers dans
// le corps (lecture en colonnes conservée, sans effet « grille de tableur »).
const thStyle: React.CSSProperties = {
  padding: "10px 8px",
  borderBottom: "1px solid var(--border-strong)",
  borderRight: "1px solid var(--border)",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-muted)",
  position: "sticky",
  top: 0,
  background: "var(--bg-panel-alt)",
  zIndex: 1,
  // Les titres peuvent passer sur plusieurs lignes pour que tous les caractères restent
  // visibles, mais un mot n'est jamais coupé au milieu (retour à la ligne aux espaces seulement).
  whiteSpace: "normal",
  overflowWrap: "normal",
  wordBreak: "keep-all",
  hyphens: "none",
  lineHeight: 1.25,
  verticalAlign: "middle",
};
const tdStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid var(--row-border-color)",
  borderRight: "1px solid rgba(32, 30, 26, 0.05)",
  verticalAlign: "middle",
  // Toutes les valeurs texte alignées à gauche avec une petite marge (les colonnes dates / Qté
  // passent textAlign:"center" via leur `align`).
  textAlign: "left",
};

// Boutons d'action d'une ligne : grille 2 × 2 de largeur égale (Livré / Simuler, + Caisse / Suppr.).
const actionsLigneStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 5,
};

const thStyleCompact: React.CSSProperties = {
  ...thStyle,
  padding: "6px 6px",
  fontSize: 11,
};
const tdStyleCompact: React.CSSProperties = {
  ...tdStyle,
  padding: "6px 6px",
};
