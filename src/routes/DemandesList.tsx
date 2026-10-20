import { useEffect, useRef, useState } from "react";
import { tauxPourDemande, tauxPourSousCaisse, type RemplissageCaisse } from "../domain/remplissage";
import { demandesApi } from "../data/demandes";
import { demandeCaisseApi } from "../data/demandeCaisse";
import { caisseStockApi } from "../data/caisseStock";
import { affairesApi } from "../data/affaires";
import { caissesApi } from "../data/caisses";
import { optionsListeApi } from "../data/optionsListe";
import { demandeAlertesApi } from "../data/demandeAlertes";
import { datesAnticipees } from "../domain/caissesACommander";
import DemandesTable from "../components/DemandesTable";
import DimensionsDemandeDialog, { type Dimensions } from "../components/DimensionsDemandeDialog";
import AjouterDemandesDialog from "../components/AjouterDemandesDialog";
import GererReferencesDialog from "../components/GererReferencesDialog";
import LockBanner from "../components/LockBanner";
import { useSectionLock } from "../hooks/useSectionLock";
import { confirmerSuppression, confirmerAction } from "../data/confirm";
import { estArCaiss } from "../domain/caisseStock";
import {
  contrePlaqueParDefaut,
  demandesActivesPourAffaire,
  memeNomAffaire,
  appliquerReglesCaisse,
  detacherStockSiDimsModifiees,
  synchroCdeSelonStock,
  stockAutorisePourEnvoi,
  champsManquantsPourCommande,
  estDemandeValidee,
  estDemandeCaisseValidee,
} from "../domain/demandeOptions";
import type {
  Caisse,
  DemandeAlerte,
  Affaire,
  Demande,
  NewDemande,
  DemandeCaisse,
  NewDemandeCaisse,
  CaisseStock,
  OptionListe,
  ListeOption,
  TableLigne,
} from "../domain/types";

let prochainIdTemporaire = -1;

function versDemande(n: NewDemande, id: number): Demande {
  return { ...n, id, validee: false, ordre: 0 };
}

// Sous-caisse brouillon (créée sur une demande pas encore enregistrée) : id temporaire négatif,
// `demande_id` = l'id temporaire de sa mère. Résolue en base au moment de l'enregistrement, une
// fois la mère créée et son vrai id connu.
function nouvelleSousCaisseBrouillon(demande: Demande, id: number): DemandeCaisse {
  return {
    id,
    demande_id: demande.id,
    nom: demande.affaire,
    type_envoi_caisse: demande.type_envoi_caisse,
    type_ouverture: "",
    stock: "",
    date_picking: demande.date_picking,
    date_demandee_s2c: demande.date_demandee_s2c,
    traitement: demande.traitement,
    quantite: 1,
    moteurs: "",
    module_lineaire: "",
    terminaux: "",
    informations_supp: "",
    observations: "",
    cde_passee_affaire: demande.cde_passee_affaire,
    cde_passee_achat_stock: demande.cde_passee_achat_stock,
    longueur_mm: 0,
    largeur_mm: 0,
    hauteur_mm: 0,
    poids_kg: 0,
    contre_plaque: contrePlaqueParDefaut(demande.type_envoi_caisse),
    ordre: 0,
    caisse_stock_id: null,
  };
}

function sousCaisseSansId(c: DemandeCaisse, demandeIdReel: number): NewDemandeCaisse {
  const { id: _id, ordre: _ordre, ...base } = c;
  return { ...base, demande_id: demandeIdReel };
}


interface Props {
  onSimulerAffaire: (demande: Demande) => void;
  trigramme: string;
  // Remonte l'état "modifications non enregistrées" à App, qui s'en sert pour demander
  // confirmation avant de quitter la section (menu, bouton Accueil, « Simuler l'affaire »).
  onDirtyChange?: (dirty: boolean) => void;
}

export default function DemandesList({ onSimulerAffaire, trigramme, onDirtyChange }: Props) {
  const lock = useSectionLock("demandes", trigramme);
  const readOnly = lock.status !== "held";
  const [demandes, setDemandes] = useState<Demande[]>([]);
  // Copie éditable localement. Depuis le 2026-10-20, plus de bouton « Enregistrer » : chaque action
  // modifie le brouillon, puis `enregistrer()` est lancé automatiquement (léger délai pour grouper
  // les modifications d'une même action, ex. « Livré » sur la mère et ses sous-caisses) et envoie
  // l'écart entre le brouillon et l'état serveur (`demandes`).
  const [brouillon, setBrouillon] = useState<Demande[]>([]);
  const [demandeCaisses, setDemandeCaisses] = useState<DemandeCaisse[]>([]);
  // Référence serveur des sous-caisses, pour détecter les sous-caisses brouillon (id < 0) créées
  // sur une demande pas encore enregistrée — les seules à persister dans handleEnregistrer.
  const [demandeCaissesServeur, setDemandeCaissesServeur] = useState<DemandeCaisse[]>([]);
  const [caissesStock, setCaissesStock] = useState<CaisseStock[]>([]);
  const [affaires, setAffaires] = useState<Affaire[]>([]);
  const affairesRef = useRef(affaires);
  affairesRef.current = affaires;
  const [optionsPersonnalisees, setOptionsPersonnalisees] = useState<OptionListe[]>([]);
  const [lignesEtendues, setLignesEtendues] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreurEnregistrement, setErreurEnregistrement] = useState<string | null>(null);
  // Fenêtre des dimensions d'une ligne mère (caisseSimu : undefined = recherche en cours).
  const [dimsEnEdition, setDimsEnEdition] = useState<{ demande: Demande; caisseSimu: Caisse | null | undefined } | null>(null);
  // Lignes dont le report des dimensions vers Simulations a déjà été décidé dans cette fenêtre :
  // repercuterDimsVersSimulation ne repose pas la question.
  const dimsDejaTraitees = useRef(new Set<number>());
  const enregistrementRef = useRef(false);
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [gestionRefsOuvert, setGestionRefsOuvert] = useState(false);
  const [slotOptions, setSlotOptions] = useState<HTMLDivElement | null>(null);
  const brouillonRef = useRef(brouillon);
  brouillonRef.current = brouillon;
  const demandesRef = useRef(demandes);
  demandesRef.current = demandes;

  // Sous-caisses supprimées localement (id > 0), à effacer en base au moment de l'enregistrement.
  const [sousCaissesSupprimees, setSousCaissesSupprimees] = useState<DemandeCaisse[]>([]);

  const modifie =
    JSON.stringify(brouillon) !== JSON.stringify(demandes) ||
    JSON.stringify(demandeCaisses) !== JSON.stringify(demandeCaissesServeur) ||
    sousCaissesSupprimees.length > 0;
  const modifieRef = useRef(modifie);
  modifieRef.current = modifie;

  useEffect(() => {
    onDirtyChange?.(modifie);
    return () => onDirtyChange?.(false);
  }, [modifie, onDirtyChange]);

  // Taux de remplissage des affaires simulées (colonne « Taux de remplissage », 2026-10-02).
  const [remplissage, setRemplissage] = useState<RemplissageCaisse[]>([]);
  // Dates d'expédition anticipées de la page Alertes (lecture seule ici).
  const [anticipees, setAnticipees] = useState<Map<number, string>>(new Map());
  // Taux par ligne : caisse(s) de Simulations liées à la ligne mère ou à la sous-caisse.
  function seuilAffaire(nomAffaire: string): number {
    return affaires.find((a) => memeNomAffaire(a.nom, nomAffaire))?.seuil_defaut ?? 70;
  }
  const tauxRemplissage = {
    mere: (d: Demande) => {
      const caisses = tauxPourDemande(remplissage, d);
      return caisses.length > 0 ? { caisses, seuil: seuilAffaire(d.affaire) } : null;
    },
    sous: (sc: DemandeCaisse, mere: Demande) => {
      const caisses = tauxPourSousCaisse(remplissage, sc);
      return caisses.length > 0 ? { caisses, seuil: seuilAffaire(mere.affaire) } : null;
    },
  };


  async function reload() {
    setLoading(true);
    try {
      const [d, dc, cs, opts, aff, remp, alertes] = await Promise.all([
        demandesApi.list(),
        demandeCaisseApi.listAll(),
        caisseStockApi.list(),
        optionsListeApi.list(),
        affairesApi.list(),
        affairesApi.remplissage().catch(() => [] as RemplissageCaisse[]),
        demandeAlertesApi.list().catch(() => [] as DemandeAlerte[]),
      ]);
      setRemplissage(remp);
      setAnticipees(datesAnticipees(alertes));
      setDemandes(d);
      setBrouillon(d);
      setDemandeCaisses(dc);
      setDemandeCaissesServeur(dc);
      setCaissesStock(cs);
      setOptionsPersonnalisees(opts);
      setAffaires(aff);
      // Les caisses filles sont dépliées par défaut (visibles d'emblée).
      setLignesEtendues(new Set(dc.map((c) => c.demande_id)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (modifieRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Vérifie si l'une des nouvelles lignes porte un nom d'affaire déjà présent (non validé) dans
  // le tableau. Si oui, demande confirmation. Compare aussi contre le brouillon en cours pour
  // les ajouts multiples successifs. Retourne false si l'utilisateur annule.
  async function confirmerAffairesDejaPresentes(nouvelles: NewDemande[]): Promise<boolean> {
    const existantes = [...demandes, ...brouillonRef.current];
    const doublons = [
      ...new Set(
        nouvelles
          .map((n) => n.affaire.trim())
          .filter((nom) => nom !== "" && demandesActivesPourAffaire(nom, existantes).length > 0),
      ),
    ];
    if (doublons.length === 0) return true;
    const liste = doublons.map((n) => `« ${n} »`).join(", ");
    return confirmerAction(
      doublons.length === 1
        ? `Une demande non validée existe déjà pour l'affaire ${liste}. L'ajouter quand même comme ligne distincte ?`
        : `Des demandes non validées existent déjà pour les affaires : ${liste}. Les ajouter quand même comme lignes distinctes ?`,
      "Affaire déjà présente",
    );
  }

  async function handleAjouterLignes(nouvelles: NewDemande[]): Promise<boolean> {
    if (!(await confirmerAffairesDejaPresentes(nouvelles))) return false;
    setBrouillon((prev) => [...prev, ...nouvelles.map((n) => versDemande(n, prochainIdTemporaire--))]);
    return true;
  }

  // Champs dont la modification peut invalider "Ok cde" — cf. demandePreteACommander.
  const CHAMPS_CONDITIONNANT_OK_CDE: (keyof Demande)[] = [
    "affaire",
    "longueur_mm",
    "largeur_mm",
    "hauteur_mm",
    "quantite",
    "date_demandee_s2c",
    "type_ouverture",
  ];

  // Renvoie false si l'utilisateur a refusé une confirmation (rien n'est modifié).
  async function handleEditLocal(id: number, patch: Partial<Demande>): Promise<boolean> {
    const demandeActuelle = brouillonRef.current.find((d) => d.id === id);
    if (demandeActuelle) patch = synchroCdeSelonStock(demandeActuelle, detacherStockSiDimsModifiees(demandeActuelle, patch));
    // Passage en 4B / 4C : les caisses en stock de la ligne et de ses sous-caisses seront retirées
    // (appliquerReglesCaisse) — on prévient avant.
    if (patch.type_envoi_caisse !== undefined && !stockAutorisePourEnvoi(patch.type_envoi_caisse)) {
      const nbStock =
        (demandeActuelle?.caisse_stock_id != null ? 1 : 0) +
        demandeCaisses.filter((c) => c.demande_id === id && c.caisse_stock_id != null).length;
      if (nbStock > 0) {
        const confirme = await confirmerAction(
          `Pas de caisse en stock pour un envoi 4B / 4C : ${nbStock} caisse(s) en stock sélectionnée(s) sur cette ligne et ses sous-caisses seront retirées. Continuer ?`,
          "Caisse en stock",
        );
        if (!confirme) return false;
      }
    }
    const toucheChampConditionnant = CHAMPS_CONDITIONNANT_OK_CDE.some((champ) => champ in patch);
    if (demandeActuelle?.ok_pour_passer_cde && toucheChampConditionnant) {
      const projection = { ...demandeActuelle, ...patch };
      const manquants = champsManquantsPourCommande(projection);
      if (manquants.length > 0) {
        const confirme = await confirmerAction(
          `Cette modification videra le(s) champ(s) suivant(s), nécessaire(s) à la commande : ${manquants.join(", ")}. La caisse ne sera plus « OK pour être commandée ». Confirmer ce changement ?`,
          "Modification bloquante pour la commande",
        );
        if (!confirme) return false;
        patch = { ...patch, ok_pour_passer_cde: false };
      }
    }
    // Qui a coché « OK pour être commandée » (affiché sur l'affiche de Demandes d'achats) ;
    // effacé quand la case est décochée, à la main ou automatiquement ci-dessus.
    if (patch.ok_pour_passer_cde !== undefined && patch.ok_pour_passer_cde !== demandeActuelle?.ok_pour_passer_cde) {
      patch = { ...patch, ok_cde_par: patch.ok_pour_passer_cde ? trigramme : "" };
    }
    setBrouillon((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));

    // Cascade vers les sous-caisses : la date de picking et le type d'envoi de la mère font
    // foi — on les répercute, et pour le type d'envoi on ré-applique les règles (ouverture
    // autorisée, NIMP15, contre-plaqué) sur chaque sous-caisse.
    const cascade: Partial<DemandeCaisse> = {};
    if ("date_picking" in patch) cascade.date_picking = patch.date_picking;
    if ("type_envoi_caisse" in patch) cascade.type_envoi_caisse = patch.type_envoi_caisse;
    if (Object.keys(cascade).length === 0) return true;

    setDemandeCaisses((prev) =>
      prev.map((c) => {
        if (c.demande_id !== id) return c;
        const majEnvoi = cascade.type_envoi_caisse ?? c.type_envoi_caisse;
        const regles =
          "type_envoi_caisse" in cascade
            ? appliquerReglesCaisse({
                type_envoi_caisse: majEnvoi,
                type_ouverture: c.type_ouverture,
                traitement: c.traitement,
                caisse_stock_id: c.caisse_stock_id,
              })
            : {};
        return { ...c, ...cascade, ...synchroCdeSelonStock(c, regles) };
      }),
    );
    return true;
  }

  // Caisse de Simulations liée à une ligne mère : lien explicite (caisse.demande_id), à défaut la
  // caisse qui porte le nom de l'affaire et n'est pas liée à une sous-caisse de demande.
  async function caisseSimuLiee(d: Demande): Promise<{ affaire: Affaire; caisse: Caisse } | null> {
    const affaire = (await affairesApi.list()).find((a) => memeNomAffaire(a.nom, d.affaire));
    if (!affaire) return null;
    const caisses = await caissesApi.list(affaire.id);
    const memeNom = caisses.filter((c) => c.nom.trim().toLowerCase() === d.affaire.trim().toLowerCase());
    const caisse =
      caisses.find((c) => c.demande_id === d.id) ?? memeNom.find((c) => c.demande_caisse_id === null) ?? memeNom[0];
    return caisse ? { affaire, caisse } : null;
  }

  async function reporterDimsSurSimu(caisse: Caisse, dims: Dimensions) {
    try {
      await caissesApi.update(
        caisse.id,
        caisse.nom,
        dims.longueur_mm,
        dims.largeur_mm,
        dims.hauteur_mm,
        caisse.seuil_pct,
        caisse.couleur,
        caisse.type_envoi_caisse,
        trigramme,
      );
    } catch (e) {
      await confirmerAction(
        `Impossible de mettre à jour la caisse « ${caisse.nom} » dans Simulations : ${e}. ` +
          `L'affaire est peut-être ouverte sur un autre poste. La demande, elle, a bien été enregistrée.`,
        "Synchronisation Simulations échouée",
      );
    }
  }

  function handleEditerDimensions(demande: Demande) {
    setDimsEnEdition({ demande, caisseSimu: undefined });
    caisseSimuLiee(demande)
      .then((r) => r?.caisse ?? null)
      .catch(() => null)
      .then((caisseSimu) => setDimsEnEdition((e) => (e && e.demande.id === demande.id ? { ...e, caisseSimu } : e)));
  }

  async function handleEnregistrerDimensions(demande: Demande, dims: Dimensions, reporter: boolean) {
    const caisseSimu = dimsEnEdition?.caisseSimu ?? null;
    setDimsEnEdition(null);
    const change =
      dims.longueur_mm !== demande.longueur_mm || dims.largeur_mm !== demande.largeur_mm || dims.hauteur_mm !== demande.hauteur_mm;
    if (change) {
      if (!(await handleEditLocal(demande.id, dims))) return;
      dimsDejaTraitees.current.add(demande.id);
    }
    if (reporter && caisseSimu) await reporterDimsSurSimu(caisseSimu, dims);
  }

  // Après enregistrement : si une demande dont les dimensions ont changé (ou qui vient d'être
  // créée) correspond à une affaire Simulations existante, propose de mettre à jour la caisse
  // interne du même nom. Une confirmation par affaire concernée.
  async function repercuterDimsVersSimulation(modifiees: Demande[], creees: Demande[]) {
    const dejaProposees = new Set<string>();

    async function traiter(d: Demande, dimsOntChange: boolean) {
      if (!dimsOntChange) return;
      // Report déjà décidé dans la fenêtre des dimensions : pas de seconde question.
      if (dimsDejaTraitees.current.delete(d.id)) return;
      const lien = await caisseSimuLiee(d);
      if (!lien || dejaProposees.has(lien.affaire.nom)) return;
      const { affaire, caisse } = lien;
      dejaProposees.add(affaire.nom);
      const identique =
        Math.abs(caisse.longueur_mm - d.longueur_mm) < 0.5 &&
        Math.abs(caisse.largeur_mm - d.largeur_mm) < 0.5 &&
        Math.abs(caisse.hauteur_mm - d.hauteur_mm) < 0.5;
      if (identique) return;
      const ok = await confirmerAction(
        `L'affaire « ${affaire.nom} » est simulée. Répercuter les nouvelles dimensions sur la caisse « ${caisse.nom} » ?`,
        "Synchroniser avec Simulations",
      );
      if (!ok) return;
      await reporterDimsSurSimu(caisse, d);
    }

    for (const d of creees) await traiter(d, true);
    for (const d of modifiees) {
      const original = demandes.find((o) => o.id === d.id);
      const change =
        !original ||
        original.longueur_mm !== d.longueur_mm ||
        original.largeur_mm !== d.largeur_mm ||
        original.hauteur_mm !== d.hauteur_mm;
      await traiter(d, change);
    }
  }

  // Cherche, dans l'affaire Simulations correspondant au nom de la demande (si elle existe), la
  // Caisse liée — soit à cette sous-ligne précise (demande_caisse_id), soit à la ligne mère
  // elle-même (demande_caisse_id null, identifiée par son nom, comme creerCaissesManquantes côté
  // App.tsx). Propose sa suppression en miroir, avec confirmation.
  async function supprimerCaisseLieeSiConfirmee(nomAffaire: string, demandeCaisseId: number | null) {
    const affaires = await affairesApi.list();
    const affaire = affaires.find((a) => a.nom.trim().toLowerCase() === nomAffaire.trim().toLowerCase());
    if (!affaire) return;
    const caisses = await caissesApi.list(affaire.id);
    const caisseLiee =
      demandeCaisseId !== null
        ? caisses.find((c) => c.demande_caisse_id === demandeCaisseId)
        : caisses.find((c) => c.demande_caisse_id === null && c.nom.trim().toLowerCase() === nomAffaire.trim().toLowerCase());
    if (!caisseLiee) return;
    const confirme = await confirmerAction(
      `Supprimer aussi la caisse correspondante « ${caisseLiee.nom} » dans Simulations ?`,
      "Synchroniser avec Simulations",
    );
    if (confirme) await caissesApi.delete(caisseLiee.id, trigramme);
  }

  async function handleDelete(id: number, affaire: string) {
    if (!(await confirmerSuppression(`Supprimer la demande « ${affaire} » ?`))) return;
    if (id < 0) {
      // Ligne ajoutée localement, pas encore en base : la retirer suffit, avec ses éventuelles
      // sous-caisses brouillon.
      setBrouillon((prev) => prev.filter((d) => d.id !== id));
      setDemandeCaisses((prev) => prev.filter((c) => c.demande_id !== id));
      return;
    }
    await supprimerCaisseLieeSiConfirmee(affaire, null);
    await demandesApi.delete(id, trigramme);
    // Retrait local plutôt qu'un reload() complet (5 appels réseau) — on connaît déjà la ligne
    // supprimée et ses sous-caisses, pas besoin de tout recharger depuis le serveur.
    setDemandes((prev) => prev.filter((d) => d.id !== id));
    setBrouillon((prev) => prev.filter((d) => d.id !== id));
    setDemandeCaisses((prev) => prev.filter((c) => c.demande_id !== id));
    setDemandeCaissesServeur((prev) => prev.filter((c) => c.demande_id !== id));
  }

  // Une observation qui vaut marqueur de validation (Livré / Rapatriée / livrée / rapatriée…).
  function estObservationValidation(obs: string): boolean {
    const o = obs.trim().toLowerCase();
    return ["livré", "livre", "livrée", "livree", "rapatriée", "rapatriee"].includes(o);
  }

  async function handleValider(id: number, validee: boolean) {
    const demande = brouillonRef.current.find((d) => d.id === id);
    if (!validee) {
      // Dévalider : retirer aussi l'observation « Livré/Rapatriée » (sinon estDemandeValidee la
      // considère toujours validée via l'observation historique).
      const patch: Partial<Demande> = { validee: false };
      if (demande && estObservationValidation(demande.observations)) patch.observations = "";
      handleEditLocal(id, patch);
      // Cascade : dévalider aussi les sous-caisses (leur observation de validation).
      for (const sc of demandeCaisses.filter((c) => c.demande_id === id)) {
        if (estObservationValidation(sc.observations)) handleEditDemandeCaisse(sc.id, { observations: "" });
      }
      return;
    }
    // Plus d'« Annuler » depuis l'enregistrement automatique : petite sécurité avant de livrer
    // (le stock des AR_CAISS_ est mis à jour tout de suite). Décision du 2026-10-20.
    const nomCaisse = caissesStock.find((c) => c.id === demande?.caisse_stock_id)?.nom;
    const ok = await confirmerAction(
      `Marquer « ${demande?.affaire ?? ""} » comme livrée ?` +
        (nomCaisse && estArCaiss(nomCaisse) ? ` Le stock de ${nomCaisse} sera mis à jour.` : ""),
      "Livré",
    );
    if (!ok) return;
    if (demande?.cde_passee_affaire) {
      handleEditLocal(id, { validee, observations: "Livré" });
    } else if (demande?.cde_passee_achat_stock) {
      handleEditLocal(id, { validee, observations: "Rapatriée" });
    } else {
      handleEditLocal(id, { validee });
    }
    // Valider la caisse mère vide aussi les affiches des caisses filles associées — même
    // observation "Livré"/"Rapatriée" que la mère, pour qu'elles disparaissent de la section
    // Demandes d'achats et s'affichent en vert pastel dans le tableau.
    const observationCascade = demande?.cde_passee_achat_stock ? "Rapatriée" : "Livré";
    for (const sc of demandeCaisses.filter((c) => c.demande_id === id)) {
      handleEditDemandeCaisse(sc.id, { observations: observationCascade });
    }
  }

  function handleCreerDemandeCaisse(demande: Demande) {
    // Id temporaire négatif, créée en base par l'enregistrement automatique qui suit.
    setDemandeCaisses((prev) => [...prev, nouvelleSousCaisseBrouillon(demande, prochainIdTemporaire--)]);
    setLignesEtendues((prev) => new Set(prev).add(demande.id));
  }

  // Édition d'une sous-caisse : brouillon, envoyé par l'enregistrement automatique comme les
  // lignes mères.
  function handleEditDemandeCaisse(id: number, patch: Partial<DemandeCaisse>) {
    setDemandeCaisses((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...synchroCdeSelonStock(c, detacherStockSiDimsModifiees(c, patch)) } : c)),
    );
  }

  async function handleDeleteDemandeCaisse(id: number) {
    if (!(await confirmerSuppression("Supprimer cette caisse détaillée ?"))) return;
    const sousLigne = demandeCaisses.find((c) => c.id === id);
    setDemandeCaisses((prev) => prev.filter((c) => c.id !== id));
    // Sous-caisse déjà en base : on mémorise la suppression pour l'appliquer à l'enregistrement.
    if (id > 0 && sousLigne) setSousCaissesSupprimees((prev) => [...prev, sousLigne]);
  }

  // Trouve la demande qui possède déjà cette caisse (autre que demandeId), si conflit — sert à
  // la fois à décider s'il faut confirmer et à composer le message de confirmation.
  function trouverProprietaireConflit(cs: CaisseStock, demandeId: number): Demande | null {
    if (estArCaiss(cs.nom)) return null;
    const parDemande = demandesRef.current.find((d) => d.id !== demandeId && d.caisse_stock_id === cs.id);
    if (parDemande) return parDemande;
    const sousLigneConflit = demandeCaisses.find((c) => c.demande_id !== demandeId && c.caisse_stock_id === cs.id);
    if (sousLigneConflit) return demandesRef.current.find((d) => d.id === sousLigneConflit.demande_id) ?? null;
    return null;
  }

  // Retourne true si l'affectation doit se poursuivre (libre, ou conflit confirmé par
  // l'utilisateur — dans ce cas le transfert est immédiat, pas d'étape d'approbation séparée).
  async function confirmerEtDemanderReassignment(cs: CaisseStock, demandeId: number): Promise<boolean> {
    const proprietaire = trouverProprietaireConflit(cs, demandeId);
    if (!proprietaire) return true;
    const confirme = await confirmerAction(
      `La caisse « ${cs.nom} » est déjà affectée à la demande « ${proprietaire.affaire} ». Retirer cette affectation pour la donner à cette demande ?`,
      "Changer l'affectation",
    );
    if (!confirme) return false;
    await caisseStockApi.transfer(cs.id, demandeId, trigramme);
    // Retire le lien côté état local, en miroir du UPDATE fait côté serveur. La ligne qui perd la
    // caisse repasse en « Cde passée sur affaire » (synchroCdeSelonStock) : modification du
    // brouillon, envoyée par l'enregistrement automatique.
    setDemandes((prev) => prev.map((d) => (d.id !== demandeId && d.caisse_stock_id === cs.id ? { ...d, caisse_stock_id: null } : d)));
    setBrouillon((prev) =>
      prev.map((d) =>
        d.id !== demandeId && d.caisse_stock_id === cs.id ? { ...d, ...synchroCdeSelonStock(d, { caisse_stock_id: null }) } : d,
      ),
    );
    setDemandeCaisses((prev) =>
      prev.map((c) =>
        c.demande_id !== demandeId && c.caisse_stock_id === cs.id ? { ...c, ...synchroCdeSelonStock(c, { caisse_stock_id: null }) } : c,
      ),
    );
    return true;
  }

  // Lignes (« d:id » mère, « c:id » sous-caisse) dont la caisse en stock choisie a un autre type
  // d'ouverture que la caisse sélectionnée avant : alerte dans la cellule (retour du 2026-10-07).
  const [ouverturesChangees, setOuverturesChangees] = useState<Set<string>>(new Set());
  function noterOuverture(cle: string, avant: string | null, apres: string | null) {
    setOuverturesChangees((prev) => {
      const next = new Set(prev);
      if (avant !== null && apres !== null && avant.trim() !== "" && avant !== apres) next.add(cle);
      else next.delete(cle);
      return next;
    });
  }

  async function handleSelectStock(demandeId: number, caisseStockId: number | null) {
    // Édition brouillon comme le reste du tableau, envoyée par l'enregistrement automatique.
    if (caisseStockId === null) {
      noterOuverture(`d:${demandeId}`, null, null);
      handleEditLocal(demandeId, { caisse_stock_id: null });
      return;
    }
    const cs = caissesStock.find((c) => c.id === caisseStockId);
    if (!cs) return;
    if (!(await confirmerEtDemanderReassignment(cs, demandeId))) return;

    const demande = brouillonRef.current.find((d) => d.id === demandeId);
    const ouvertureAvant = demande?.type_ouverture ?? null;
    // Cas ACHSTOCK (AR_CAISS_...) sur une demande dont l'affaire existe déjà en Simulations :
    // on demande s'il faut reprendre les mesures de la caisse en stock. Refus → on n'affecte
    // pas la caisse (retour à vide), la coche « commandé sur affaire » est laissée telle quelle.
    const affaireExiste =
      demande && demande.affaire.trim() !== "" && affairesRef.current.some((a) => memeNomAffaire(a.nom, demande.affaire));
    if (estArCaiss(cs.nom) && affaireExiste) {
      const reprendre = await confirmerAction(
        `Reprendre les mesures de la caisse en stock « ${cs.nom} » (${(cs.longueur_mm / 1000).toFixed(2)} × ${(cs.largeur_mm / 1000).toFixed(2)} × ${(cs.hauteur_mm / 1000).toFixed(2)} m) pour cette demande ?`,
        "Mesures de la caisse en stock",
      );
      if (!reprendre) {
        noterOuverture(`d:${demandeId}`, null, null);
        handleEditLocal(demandeId, { caisse_stock_id: null });
        return;
      }
      noterOuverture(`d:${demandeId}`, ouvertureAvant, cs.type_ouverture);
      handleEditLocal(demandeId, {
        caisse_stock_id: caisseStockId,
        longueur_mm: cs.longueur_mm,
        largeur_mm: cs.largeur_mm,
        hauteur_mm: cs.hauteur_mm,
        type_ouverture: cs.type_ouverture,
      });
      // Si l'affaire est déjà simulée, proposer de répercuter les mesures sur la caisse interne.
      await proposerSyncCaisseSimu(demande!.affaire, cs);
      return;
    }

    noterOuverture(`d:${demandeId}`, ouvertureAvant, cs.type_ouverture);
    handleEditLocal(demandeId, {
      caisse_stock_id: caisseStockId,
      longueur_mm: cs.longueur_mm,
      largeur_mm: cs.largeur_mm,
      hauteur_mm: cs.hauteur_mm,
      // Type d'ouverture de la caisse en stock, verrouillé tant qu'elle est sélectionnée.
      type_ouverture: cs.type_ouverture,
    });
  }

  // Propose de répercuter les mesures d'une caisse en stock sur la Caisse correspondante d'une
  // affaire Simulations déjà créée (identifiée par le nom de l'affaire). Sans effet si l'affaire
  // n'existe pas ou n'a pas de caisse portant son nom.
  async function proposerSyncCaisseSimu(nomAffaire: string, cs: CaisseStock) {
    const affaires = await affairesApi.list();
    const affaire = affaires.find((a) => memeNomAffaire(a.nom, nomAffaire));
    if (!affaire) return;
    const caisses = await caissesApi.list(affaire.id);
    const caisse = caisses.find((c) => c.nom.trim().toLowerCase() === nomAffaire.trim().toLowerCase());
    if (!caisse) return;
    const confirme = await confirmerAction(
      `L'affaire « ${affaire.nom} » est déjà simulée. Mettre à jour les dimensions de la caisse « ${caisse.nom} » avec celles de « ${cs.nom} » ?`,
      "Synchroniser avec Simulations",
    );
    if (!confirme) return;
    await caissesApi.update(
      caisse.id,
      caisse.nom,
      cs.longueur_mm,
      cs.largeur_mm,
      cs.hauteur_mm,
      caisse.seuil_pct,
      caisse.couleur,
      caisse.type_envoi_caisse,
      trigramme,
    );
  }

  async function handleSelectStockSousLigne(id: number, caisseStockId: number | null) {
    if (caisseStockId === null) {
      noterOuverture(`c:${id}`, null, null);
      handleEditDemandeCaisse(id, { caisse_stock_id: null });
      return;
    }
    const cs = caissesStock.find((c) => c.id === caisseStockId);
    if (!cs) return;
    const sousLigne = demandeCaisses.find((c) => c.id === id);
    if (!sousLigne) return;
    if (!(await confirmerEtDemanderReassignment(cs, sousLigne.demande_id))) return;
    noterOuverture(`c:${id}`, sousLigne.type_ouverture, cs.type_ouverture);
    handleEditDemandeCaisse(id, {
      caisse_stock_id: caisseStockId,
      longueur_mm: cs.longueur_mm,
      largeur_mm: cs.largeur_mm,
      hauteur_mm: cs.hauteur_mm,
      type_ouverture: cs.type_ouverture,
    });
  }

  function handleToggleEtendue(demandeId: number) {
    setLignesEtendues((prev) => {
      const next = new Set(prev);
      if (next.has(demandeId)) next.delete(demandeId);
      else next.add(demandeId);
      return next;
    });
  }

  // Enregistrement automatique (2026-10-20) : un seul à la fois (`enregistrementRef`). Relancé
  // après chaque modification du brouillon (effet ci-dessous) ; une modification faite pendant
  // un enregistrement (confirmations…) est envoyée par le suivant. En cas d'erreur (main perdue,
  // base injoignable…) : message + rechargement depuis la base — l'état local pourrait sinon
  // contenir une création à moitié envoyée, refaite en double au prochain enregistrement.
  async function enregistrer() {
    if (enregistrementRef.current) return;
    enregistrementRef.current = true;
    setEnregistrement(true);
    try {
      await envoyerModifications();
      setErreurEnregistrement(null);
    } catch (e) {
      setErreurEnregistrement(`La dernière modification n'a pas pu être enregistrée : ${e}`);
      dimsDejaTraitees.current.clear();
      await reload().catch(() => {});
    } finally {
      enregistrementRef.current = false;
      setEnregistrement(false);
    }
  }

  useEffect(() => {
    if (!modifie || readOnly || loading) return;
    const t = window.setTimeout(() => {
      if (!enregistrementRef.current) enregistrer();
    }, 300);
    return () => window.clearTimeout(t);
    // enregistrer() relit l'état du rendu courant ; relancé à chaque changement du brouillon.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brouillon, demandeCaisses, sousCaissesSupprimees, demandes, readOnly, loading]);

  async function envoyerModifications() {
    const aCreer = brouillon.filter((d) => d.id < 0);
    const aModifier = brouillon.filter((d) => {
      if (d.id < 0) return false;
      const original = demandes.find((o) => o.id === d.id);
      return original && JSON.stringify(original) !== JSON.stringify(d);
    });
    // Mapping id temporaire (brouillon, < 0) → id réel une fois la demande créée en base —
    // sert à reconstruire le state local sans reload() complet.
    const idsReelsParIdTemporaire = new Map<number, number>();
    // Sous-caisses brouillon créées en base, avec leur id réel (id temporaire → objet créé).
    const sousCaissesCreeesParIdTemporaire = new Map<number, DemandeCaisse>();
    const caissesStockValidation = new Map<number, boolean>();

    if (aCreer.length > 0) {
      // bulkCreate renvoie les demandes créées dans l'ordre d'entrée : on relie chaque id
      // temporaire à son id réel pour persister ensuite les sous-caisses brouillon.
      const creees = await demandesApi.bulkCreate(
        aCreer.map(({ id: _id, ordre: _ordre, validee: _validee, ...n }) => n),
        trigramme,
      );
      for (let i = 0; i < aCreer.length; i++) {
        const idReel = creees[i]?.id;
        if (idReel === undefined) continue;
        idsReelsParIdTemporaire.set(aCreer[i].id, idReel);
        const sousCaisses = demandeCaisses.filter((c) => c.demande_id === aCreer[i].id);
        for (const sc of sousCaisses) {
          const creee = await demandeCaisseApi.create(sousCaisseSansId(sc, idReel), trigramme);
          sousCaissesCreeesParIdTemporaire.set(sc.id, creee);
        }
      }
    }
    // Stock AR_CAISS_ (décisions 2026-10-01) : lignes qui passent de livrée à non livrée →
    // proposer de remettre en stock ce qui avait été décompté, AVANT d'enregistrer (la remise
    // vise la caisse en stock encore liée en base).
    const { devalidees, livrees } = transitionsLivraison();
    await proposerRemisesEnStock(devalidees);

    for (const d of aModifier) {
      const { id, ordre: _ordre, validee, ...n } = d;
      const original = demandes.find((o) => o.id === id);
      await demandesApi.update(id, n, trigramme);
      if (!original || original.validee !== validee) {
        await demandesApi.setValidee(id, validee, trigramme);
        // Validation → caisses de stock utilisées marquées livrées ; dévalidation → remises
        // disponibles (sinon elles restaient masquées de Caisses en stock et des menus Stock).
        const changement = validee && (!original || !original.validee) ? true : !validee && original?.validee ? false : null;
        if (changement !== null) {
          const ids = [d.caisse_stock_id, ...demandeCaisses.filter((c) => c.demande_id === id).map((c) => c.caisse_stock_id)];
          for (const csId of ids) {
            if (csId === null) continue;
            await caisseStockApi.setValidee(csId, changement, trigramme);
            caissesStockValidation.set(csId, changement);
          }
        }
      }
    }

    // Sous-caisses sur demandes déjà enregistrées : créations (id < 0 rattachées à une mère
    // id > 0), modifications et suppressions.
    for (const sc of demandeCaisses.filter((c) => c.id < 0 && c.demande_id > 0)) {
      const creee = await demandeCaisseApi.create(sousCaisseSansId(sc, sc.demande_id), trigramme);
      sousCaissesCreeesParIdTemporaire.set(sc.id, creee);
    }
    for (const sc of demandeCaisses.filter((c) => c.id > 0)) {
      const original = demandeCaissesServeur.find((o) => o.id === sc.id);
      if (original && JSON.stringify(original) !== JSON.stringify(sc)) {
        const { id: _id, ordre: _ordre, ...base } = sc;
        await demandeCaisseApi.update(sc.id, base, trigramme);
      }
    }
    const idsSousCaissesSupprimees = new Set<number>();
    for (const sc of sousCaissesSupprimees) {
      const demandeParente = demandes.find((d) => d.id === sc.demande_id);
      if (demandeParente) await supprimerCaisseLieeSiConfirmee(demandeParente.affaire, sc.id);
      await demandeCaisseApi.delete(sc.id, trigramme);
      idsSousCaissesSupprimees.add(sc.id);
    }
    setSousCaissesSupprimees((prev) => prev.filter((sc) => !idsSousCaissesSupprimees.has(sc.id)));

    // Lignes qui viennent d'être livrées : leur quantité est retirée du stock de leur AR_CAISS_
    // gérée (ou ajoutée pour une ligne ACHSTOCK = réception), une fois les lignes enregistrées
    // (le backend relit caisse et quantité en base).
    let stockModifie = devalidees.length > 0;
    for (const l of livrees) {
      if (await caisseStockApi.decompterLivraison(l.table, l.id, trigramme)) stockModifie = true;
    }
    if (stockModifie) setCaissesStock(await caisseStockApi.list());

    // Répercussion des modifs de dimensions sur la simulation, si l'affaire existe.
    await repercuterDimsVersSimulation(aModifier, aCreer);

    // Reconstruction du state local à partir de ce qu'on vient d'envoyer — pas de reload()
    // complet (5 appels réseau), qui provoquait un "flash" visuel du tableau à chaque
    // enregistrement. L'état serveur = l'instantané envoyé (ids temporaires remplacés) ; le
    // brouillon, lui, peut avoir changé pendant l'envoi (confirmations…) : on n'y remplace que
    // les ids, ses autres changements partiront au prochain enregistrement.
    const idReel = (id: number) => idsReelsParIdTemporaire.get(id) ?? id;
    setDemandes(brouillon.map((d) => ({ ...d, id: idReel(d.id) })));
    setBrouillon((prev) => prev.map((d) => (idsReelsParIdTemporaire.has(d.id) ? { ...d, id: idReel(d.id) } : d)));

    const versServeur = (c: DemandeCaisse): DemandeCaisse => {
      const creee = sousCaissesCreeesParIdTemporaire.get(c.id);
      return creee
        ? { ...c, id: creee.id, ordre: creee.ordre, demande_id: creee.demande_id }
        : { ...c, demande_id: idReel(c.demande_id) };
    };
    setDemandeCaissesServeur(
      demandeCaisses
        .filter((c) => !idsSousCaissesSupprimees.has(c.id) && (c.id > 0 || sousCaissesCreeesParIdTemporaire.has(c.id)))
        .map(versServeur),
    );
    setDemandeCaisses((prev) =>
      prev
        .filter((c) => !idsSousCaissesSupprimees.has(c.id))
        .map((c) => (sousCaissesCreeesParIdTemporaire.has(c.id) || idsReelsParIdTemporaire.has(c.demande_id) ? versServeur(c) : c)),
    );

    if (caissesStockValidation.size > 0) {
      setCaissesStock((prev) =>
        prev.map((cs) => (caissesStockValidation.has(cs.id) ? { ...cs, validee: caissesStockValidation.get(cs.id)! } : cs)),
      );
    }
  }

  // Lignes enregistrées (id > 0) dont l'état livré change entre le serveur et le brouillon. Une
  // sous-caisse est livrée si elle l'est elle-même ou si sa mère l'est (validation en cascade).
  function transitionsLivraison(): { devalidees: { table: TableLigne; id: number }[]; livrees: { table: TableLigne; id: number }[] } {
    const devalidees: { table: TableLigne; id: number }[] = [];
    const livrees: { table: TableLigne; id: number }[] = [];
    const noter = (table: TableLigne, id: number, avant: boolean, apres: boolean) => {
      if (avant && !apres) devalidees.push({ table, id });
      if (!avant && apres) livrees.push({ table, id });
    };
    for (const d of brouillon) {
      const original = demandes.find((o) => o.id === d.id);
      if (d.id < 0 || !original) continue;
      noter("demande", d.id, estDemandeValidee(original), estDemandeValidee(d));
    }
    for (const sc of demandeCaisses) {
      const original = demandeCaissesServeur.find((o) => o.id === sc.id);
      if (sc.id < 0 || !original) continue;
      const mereAvant = demandes.find((d) => d.id === sc.demande_id);
      const mereApres = brouillon.find((d) => d.id === sc.demande_id);
      const avant = estDemandeCaisseValidee(original) || (mereAvant !== undefined && estDemandeValidee(mereAvant));
      const apres = estDemandeCaisseValidee(sc) || (mereApres !== undefined && estDemandeValidee(mereApres));
      noter("demande_caisse", sc.id, avant, apres);
    }
    return { devalidees, livrees };
  }

  // Dévalidation : une seule confirmation listant les mouvements faits à la livraison — caisses
  // sorties du stock (à remettre) et réceptions ACHSTOCK (à retirer). Refus → rien ne bouge (la
  // ligne reste marquée : pas de second mouvement si on la revalide). Un mouvement de 0 (stock
  // déjà à 0) est simplement effacé sans question.
  async function proposerRemisesEnStock(lignes: { table: TableLigne; id: number }[]) {
    const aAnnuler: { table: TableLigne; id: number; nom: string; quantite: number }[] = [];
    for (const l of lignes) {
      const m = await caisseStockApi.stockDecompteLigne(l.table, l.id);
      if (!m) continue;
      if (m.quantite === 0) await caisseStockApi.remettreStockLigne(l.table, l.id, trigramme);
      else aAnnuler.push({ ...l, nom: m.nom, quantite: m.quantite });
    }
    if (aAnnuler.length === 0) return;
    const liste = (q: (n: number) => boolean) =>
      aAnnuler
        .filter((l) => q(l.quantite))
        .map((l) => `${l.nom} : ${Math.abs(l.quantite)}`)
        .join(", ");
    const sorties = liste((n) => n > 0);
    const recues = liste((n) => n < 0);
    const phrases = [
      sorties && `Ces caisses avaient été sorties du stock à la livraison (${sorties}) : elles seront remises en stock.`,
      recues && `Ces caisses avaient été ajoutées au stock à la réception (${recues}) : elles seront retirées du stock.`,
    ].filter(Boolean);
    const ok = await confirmerAction(`${phrases.join(" ")} Mettre le stock à jour ?`, "Stock des caisses");
    if (!ok) return;
    for (const l of aAnnuler) await caisseStockApi.remettreStockLigne(l.table, l.id, trigramme);
  }

  // Verrou libéré : on reprend la main puis on recharge (l'autre poste a pu enregistrer entre-temps).
  async function handlePrendreLaMain() {
    if (
      modifieRef.current &&
      !(await confirmerAction(
        "Les modifications non enregistrées seront perdues : le tableau va être rechargé. Continuer ?",
        "Prendre la main",
      ))
    ) {
      return;
    }
    if (!(await lock.prendreLaMain())) return;
    setSousCaissesSupprimees([]);
    await reload();
  }

  async function handleAjouterOption(liste: ListeOption, valeur: string) {
    const creee = await optionsListeApi.create(liste, valeur, trigramme);
    setOptionsPersonnalisees((prev) => (prev.some((o) => o.id === creee.id) ? prev : [...prev, creee]));
  }

  async function handleRenommerOption(id: number, valeur: string) {
    const modifiee = await optionsListeApi.rename(id, valeur, trigramme);
    setOptionsPersonnalisees((prev) => prev.map((o) => (o.id === id ? modifiee : o)));
    // Le renommage répercute la valeur sur les lignes en base : recharger pour refléter.
    await reload();
  }

  async function handleSupprimerOption(id: number) {
    await optionsListeApi.delete(id, trigramme);
    setOptionsPersonnalisees((prev) => prev.filter((o) => o.id !== id));
  }

  return (
    <div style={{ padding: "28px 24px" }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tableau de gestion des caisses</h1>
        </div>
        <div className="page-actions" style={{ justifyContent: "flex-end" }}>
          {enregistrement && <span className="badge badge-warn">Enregistrement…</span>}
          <button className="btn btn-info" onClick={() => setAjoutOuvert(true)} disabled={readOnly}>
            + Créer une nouvelle caisse
          </button>
          <button className="btn" onClick={() => setGestionRefsOuvert(true)} disabled={readOnly}>
            Gérer les références
          </button>
          <div ref={setSlotOptions} style={{ display: "inline-flex" }} />
        </div>
      </div>

      {(readOnly || lock.incomingRequest) && (
        <LockBanner
          lectureSeule={lock.lectureSeule}
          holderTrigramme={lock.holderTrigramme}
          incomingRequest={lock.incomingRequest}
          outgoingRequestStatus={lock.outgoingRequestStatus}
          onRequestPen={lock.requestPen}
          onApprove={lock.approveRequest}
          onDeny={lock.denyRequest}
          verrouLibre={lock.verrouLibre}
          onPrendreLaMain={handlePrendreLaMain}
        />
      )}

      {erreurEnregistrement && (
        <div className="panel" style={{ padding: "10px 14px", marginBottom: 12, background: "var(--danger-bg)", color: "var(--danger-text)" }}>
          {erreurEnregistrement} Le tableau a été rechargé depuis la base.
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Chargement…</p>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <DemandesTable
            demandes={brouillon}
            demandeCaisses={demandeCaisses}
            caissesStock={caissesStock}
            lignesEtendues={lignesEtendues}
            onToggleEtendue={handleToggleEtendue}
            onCreerDemandeCaisse={handleCreerDemandeCaisse}
            onEditDemandeCaisse={handleEditDemandeCaisse}
            onDeleteDemandeCaisse={handleDeleteDemandeCaisse}
            onSelectStock={handleSelectStock}
            ouverturesChangees={ouverturesChangees}
            onSelectStockSousLigne={handleSelectStockSousLigne}
            onEdit={handleEditLocal}
            onDelete={handleDelete}
            onValider={handleValider}
            onSimulerAffaire={onSimulerAffaire}
            optionsPersonnalisees={optionsPersonnalisees}
            slotOptions={slotOptions}
            tauxRemplissage={tauxRemplissage}
            datesAnticipees={anticipees}
            onEditerDimensions={handleEditerDimensions}
            readOnly={readOnly}
          />
        </div>
      )}

      {dimsEnEdition && !readOnly && (
        <DimensionsDemandeDialog
          demande={dimsEnEdition.demande}
          caisseSimu={dimsEnEdition.caisseSimu}
          nomCaisseStock={caissesStock.find((c) => c.id === dimsEnEdition.demande.caisse_stock_id)?.nom ?? null}
          onEnregistrer={(dims, reporter) => handleEnregistrerDimensions(dimsEnEdition.demande, dims, reporter)}
          onClose={() => setDimsEnEdition(null)}
        />
      )}
      {ajoutOuvert && (
        <AjouterDemandesDialog
          caissesStock={caissesStock}
          optionsPersonnalisees={optionsPersonnalisees}
          onAjouter={handleAjouterLignes}
          onClose={() => setAjoutOuvert(false)}
        />
      )}
      {gestionRefsOuvert && (
        <GererReferencesDialog
          optionsPersonnalisees={optionsPersonnalisees}
          onAjouter={handleAjouterOption}
          onRenommer={handleRenommerOption}
          onSupprimer={handleSupprimerOption}
          compterUsage={optionsListeApi.countUsage}
          onClose={() => setGestionRefsOuvert(false)}
        />
      )}
    </div>
  );
}
