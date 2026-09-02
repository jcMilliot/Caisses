import { useEffect, useRef, useState } from "react";
import { demandesApi } from "../data/demandes";
import { demandeCaisseApi } from "../data/demandeCaisse";
import { caisseStockApi } from "../data/caisseStock";
import { affairesApi } from "../data/affaires";
import { caissesApi } from "../data/caisses";
import { optionsListeApi } from "../data/optionsListe";
import DemandesTable from "../components/DemandesTable";
import PasteImportZoneDemandes from "../components/PasteImportZoneDemandes";
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
  OUVERTURE_PAR_DESSUS,
} from "../domain/demandeOptions";
import type { Affaire, Demande, NewDemande, DemandeCaisse, NewDemandeCaisse, CaisseStock, OptionListe, ListeOption } from "../domain/types";

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
  // Copie éditable localement : les modifications de champs/cases à cocher et les nouvelles
  // lignes n'atteignent le serveur qu'au clic sur "Enregistrer" (pas de sauvegarde auto par
  // édition, pour éviter les allers-retours réseau à chaque frappe/coche).
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
  const [importOuvert, setImportOuvert] = useState(false);
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

  async function reload() {
    setLoading(true);
    try {
      const [d, dc, cs, opts, aff] = await Promise.all([
        demandesApi.list(),
        demandeCaisseApi.listAll(),
        caisseStockApi.list(),
        optionsListeApi.list(),
        affairesApi.list(),
      ]);
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

  async function handleImport(nouvelles: NewDemande[]): Promise<boolean> {
    if (!(await confirmerAffairesDejaPresentes(nouvelles))) return false;
    // Le collage Excel reste un import immédiat (gros volume, distinct des éditions manuelles).
    await demandesApi.bulkCreate(nouvelles, trigramme);
    await reload();
    return true;
  }

  async function handleAjouterLignes(nouvelles: NewDemande[]): Promise<boolean> {
    if (!(await confirmerAffairesDejaPresentes(nouvelles))) return false;
    setBrouillon((prev) => [...prev, ...nouvelles.map((n) => versDemande(n, prochainIdTemporaire--))]);
    return true;
  }

  function handleEditLocal(id: number, patch: Partial<Demande>) {
    setBrouillon((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));

    // Cascade vers les sous-caisses : la date de picking et le type d'envoi de la mère font
    // foi — on les répercute, et pour le type d'envoi on ré-applique les règles (ouverture
    // autorisée, NIMP15, contre-plaqué) sur chaque sous-caisse.
    const cascade: Partial<DemandeCaisse> = {};
    if ("date_picking" in patch) cascade.date_picking = patch.date_picking;
    if ("type_envoi_caisse" in patch) cascade.type_envoi_caisse = patch.type_envoi_caisse;
    if (Object.keys(cascade).length === 0) return;

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
        return { ...c, ...cascade, ...regles };
      }),
    );
  }

  // Après enregistrement : si une demande dont les dimensions ont changé (ou qui vient d'être
  // créée) correspond à une affaire Simulations existante, propose de mettre à jour la caisse
  // interne du même nom. Une confirmation par affaire concernée.
  async function repercuterDimsVersSimulation(modifiees: Demande[], creees: Demande[]) {
    const affaires = await affairesApi.list();
    const dejaProposees = new Set<string>();

    async function traiter(d: Demande, dimsOntChange: boolean) {
      if (!dimsOntChange) return;
      const affaire = affaires.find((a) => memeNomAffaire(a.nom, d.affaire));
      if (!affaire || dejaProposees.has(affaire.nom)) return;
      dejaProposees.add(affaire.nom);
      const caisses = await caissesApi.list(affaire.id);
      // Priorité au lien explicite (caisse.demande_id) ; à défaut, la caisse "mère" = celle qui
      // porte le nom de l'affaire et n'est pas liée à une sous-caisse de demande.
      const memeNom = caisses.filter((c) => c.nom.trim().toLowerCase() === d.affaire.trim().toLowerCase());
      const caisse =
        caisses.find((c) => c.demande_id === d.id) ?? memeNom.find((c) => c.demande_caisse_id === null) ?? memeNom[0];
      if (!caisse) return;
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
      try {
        await caissesApi.update(
          caisse.id,
          caisse.nom,
          d.longueur_mm,
          d.largeur_mm,
          d.hauteur_mm,
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
    await reload();
  }

  // Une observation qui vaut marqueur de validation (Livré / Rapatriée / livrée / rapatriée…).
  function estObservationValidation(obs: string): boolean {
    const o = obs.trim().toLowerCase();
    return ["livré", "livre", "livrée", "livree", "rapatriée", "rapatriee"].includes(o);
  }

  function handleValider(id: number, validee: boolean) {
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
    // Toujours en brouillon (id temporaire négatif) — persistée à l'enregistrement.
    setDemandeCaisses((prev) => [...prev, nouvelleSousCaisseBrouillon(demande, prochainIdTemporaire--)]);
    setLignesEtendues((prev) => new Set(prev).add(demande.id));
  }

  // Édition d'une sous-caisse : purement locale (brouillon) — persistée dans handleEnregistrer,
  // comme les lignes mères. « Annuler » restaure l'état serveur.
  function handleEditDemandeCaisse(id: number, patch: Partial<DemandeCaisse>) {
    setDemandeCaisses((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
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
    // Retire le lien côté état local, en miroir du UPDATE fait côté serveur.
    setDemandes((prev) => prev.map((d) => (d.id !== demandeId && d.caisse_stock_id === cs.id ? { ...d, caisse_stock_id: null } : d)));
    setBrouillon((prev) => prev.map((d) => (d.id !== demandeId && d.caisse_stock_id === cs.id ? { ...d, caisse_stock_id: null } : d)));
    setDemandeCaisses((prev) => prev.map((c) => (c.demande_id !== demandeId && c.caisse_stock_id === cs.id ? { ...c, caisse_stock_id: null } : c)));
    return true;
  }

  async function handleSelectStock(demandeId: number, caisseStockId: number | null) {
    // Édition brouillon comme le reste du tableau — rien n'est persisté avant « Enregistrer »,
    // et « Annuler » restaure les dimensions d'origine.
    if (caisseStockId === null) {
      handleEditLocal(demandeId, { caisse_stock_id: null });
      return;
    }
    const cs = caissesStock.find((c) => c.id === caisseStockId);
    if (!cs) return;
    if (!(await confirmerEtDemanderReassignment(cs, demandeId))) return;

    const demande = brouillonRef.current.find((d) => d.id === demandeId);
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
        handleEditLocal(demandeId, { caisse_stock_id: null });
        return;
      }
      handleEditLocal(demandeId, {
        caisse_stock_id: caisseStockId,
        longueur_mm: cs.longueur_mm,
        largeur_mm: cs.largeur_mm,
        hauteur_mm: cs.hauteur_mm,
        type_ouverture: OUVERTURE_PAR_DESSUS,
      });
      // Si l'affaire est déjà simulée, proposer de répercuter les mesures sur la caisse interne.
      await proposerSyncCaisseSimu(demande!.affaire, cs);
      return;
    }

    handleEditLocal(demandeId, {
      caisse_stock_id: caisseStockId,
      longueur_mm: cs.longueur_mm,
      largeur_mm: cs.largeur_mm,
      hauteur_mm: cs.hauteur_mm,
      // Caisse en stock → type d'ouverture forcé « Par dessus ».
      type_ouverture: OUVERTURE_PAR_DESSUS,
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
      handleEditDemandeCaisse(id, { caisse_stock_id: null });
      return;
    }
    const cs = caissesStock.find((c) => c.id === caisseStockId);
    if (!cs) return;
    const sousLigne = demandeCaisses.find((c) => c.id === id);
    if (!sousLigne) return;
    if (!(await confirmerEtDemanderReassignment(cs, sousLigne.demande_id))) return;
    handleEditDemandeCaisse(id, {
      caisse_stock_id: caisseStockId,
      longueur_mm: cs.longueur_mm,
      largeur_mm: cs.largeur_mm,
      hauteur_mm: cs.hauteur_mm,
      type_ouverture: OUVERTURE_PAR_DESSUS,
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

  async function handleEnregistrer() {
    setEnregistrement(true);
    try {
      const aCreer = brouillon.filter((d) => d.id < 0);
      const aModifier = brouillon.filter((d) => {
        if (d.id < 0) return false;
        const original = demandes.find((o) => o.id === d.id);
        return original && JSON.stringify(original) !== JSON.stringify(d);
      });

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
          const sousCaisses = demandeCaisses.filter((c) => c.demande_id === aCreer[i].id);
          for (const sc of sousCaisses) {
            await demandeCaisseApi.create(sousCaisseSansId(sc, idReel), trigramme);
          }
        }
      }
      for (const d of aModifier) {
        const { id, ordre: _ordre, validee, ...n } = d;
        const original = demandes.find((o) => o.id === id);
        await demandesApi.update(id, n, trigramme);
        if (!original || original.validee !== validee) {
          await demandesApi.setValidee(id, validee, trigramme);
          if (validee && (!original || !original.validee)) {
            if (d.caisse_stock_id !== null) {
              await caisseStockApi.setValidee(d.caisse_stock_id, true, trigramme);
            }
            for (const sc of demandeCaisses.filter((c) => c.demande_id === id)) {
              if (sc.caisse_stock_id !== null) {
                await caisseStockApi.setValidee(sc.caisse_stock_id, true, trigramme);
              }
            }
          }
        }
      }

      // Sous-caisses sur demandes déjà enregistrées : créations (id < 0 rattachées à une mère
      // id > 0), modifications et suppressions.
      for (const sc of demandeCaisses.filter((c) => c.id < 0 && c.demande_id > 0)) {
        await demandeCaisseApi.create(sousCaisseSansId(sc, sc.demande_id), trigramme);
      }
      for (const sc of demandeCaisses.filter((c) => c.id > 0)) {
        const original = demandeCaissesServeur.find((o) => o.id === sc.id);
        if (original && JSON.stringify(original) !== JSON.stringify(sc)) {
          const { id: _id, ordre: _ordre, ...base } = sc;
          await demandeCaisseApi.update(sc.id, base, trigramme);
        }
      }
      for (const sc of sousCaissesSupprimees) {
        const demandeParente = demandes.find((d) => d.id === sc.demande_id);
        if (demandeParente) await supprimerCaisseLieeSiConfirmee(demandeParente.affaire, sc.id);
        await demandeCaisseApi.delete(sc.id, trigramme);
      }
      setSousCaissesSupprimees([]);

      // Répercussion des modifs de dimensions sur la simulation, si l'affaire existe.
      await repercuterDimsVersSimulation(aModifier, aCreer);

      await reload();
    } finally {
      setEnregistrement(false);
    }
  }

  function handleAnnuler() {
    setBrouillon(demandes);
    setDemandeCaisses(demandeCaissesServeur);
    setSousCaissesSupprimees([]);
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
    <div style={{ padding: "32px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 4 }}>
            Caisses
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>
            Tableau de gestion des caisses
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {modifie && <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Modifications non enregistrées</span>}
          {modifie && (
            <button className="btn" onClick={handleAnnuler}>
              Annuler
            </button>
          )}
          <button className="btn" onClick={() => setAjoutOuvert(true)} disabled={readOnly}>
            + Créer une nouvelle caisse
          </button>
          <button className="btn" onClick={() => setImportOuvert(true)} disabled={readOnly}>
            Coller depuis Excel
          </button>
          <button className="btn" onClick={() => setGestionRefsOuvert(true)} disabled={readOnly}>
            Gérer les références
          </button>
          <div ref={setSlotOptions} style={{ display: "inline-flex" }} />
          <button className="btn btn-primary" disabled={!modifie || enregistrement || readOnly} onClick={handleEnregistrer}>
            {enregistrement ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>

      {(readOnly || lock.incomingRequest) && (
        <LockBanner
          holderTrigramme={lock.holderTrigramme}
          incomingRequest={lock.incomingRequest}
          outgoingRequestStatus={lock.outgoingRequestStatus}
          onRequestPen={lock.requestPen}
          onApprove={lock.approveRequest}
          onDeny={lock.denyRequest}
        />
      )}

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Chargement…</p>
      ) : (
        <div className="panel" style={{ padding: 4 }}>
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
            onSelectStockSousLigne={handleSelectStockSousLigne}
            onEdit={handleEditLocal}
            onDelete={handleDelete}
            onValider={handleValider}
            onSimulerAffaire={onSimulerAffaire}
            optionsPersonnalisees={optionsPersonnalisees}
            slotOptions={slotOptions}
            readOnly={readOnly}
          />
        </div>
      )}

      {importOuvert && <PasteImportZoneDemandes onImport={handleImport} onClose={() => setImportOuvert(false)} />}
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
