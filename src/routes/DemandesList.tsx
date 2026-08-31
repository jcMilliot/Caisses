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
import AjouterOptionDialog from "../components/AjouterOptionDialog";
import LockBanner from "../components/LockBanner";
import { useSectionLock } from "../hooks/useSectionLock";
import { confirmerSuppression, confirmerAction } from "../data/confirm";
import { estArCaiss } from "../domain/caisseStock";
import { contrePlaqueParDefaut, demandesActivesPourAffaire } from "../domain/demandeOptions";
import type { Demande, NewDemande, DemandeCaisse, NewDemandeCaisse, CaisseStock, OptionListe, ListeOption } from "../domain/types";

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

function sansId(d: Demande, patch: Partial<Demande>): NewDemande {
  const { id: _id, ordre: _ordre, validee: _validee, ...base } = { ...d, ...patch };
  return base;
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
  const [optionsPersonnalisees, setOptionsPersonnalisees] = useState<OptionListe[]>([]);
  const [lignesEtendues, setLignesEtendues] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [importOuvert, setImportOuvert] = useState(false);
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [ajoutOptionOuvert, setAjoutOptionOuvert] = useState(false);
  const brouillonRef = useRef(brouillon);
  brouillonRef.current = brouillon;
  const demandesRef = useRef(demandes);
  demandesRef.current = demandes;

  const sousCaissesBrouillon = demandeCaisses.some((c) => c.id < 0);
  const modifie = JSON.stringify(brouillon) !== JSON.stringify(demandes) || sousCaissesBrouillon;
  const modifieRef = useRef(modifie);
  modifieRef.current = modifie;

  useEffect(() => {
    onDirtyChange?.(modifie);
    return () => onDirtyChange?.(false);
  }, [modifie, onDirtyChange]);

  async function reload() {
    setLoading(true);
    try {
      const [d, dc, cs, opts] = await Promise.all([
        demandesApi.list(),
        demandeCaisseApi.listAll(),
        caisseStockApi.list(),
        optionsListeApi.list(),
      ]);
      setDemandes(d);
      setBrouillon(d);
      setDemandeCaisses(dc);
      setDemandeCaissesServeur(dc);
      setCaissesStock(cs);
      setOptionsPersonnalisees(opts);
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

  function handleValider(id: number, validee: boolean) {
    if (!validee) {
      handleEditLocal(id, { validee });
      return;
    }
    const demande = brouillonRef.current.find((d) => d.id === id);
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

  async function handleCreerDemandeCaisse(demande: Demande) {
    // Demande pas encore enregistrée (id temporaire) : la sous-caisse est créée en brouillon
    // local, elle sera persistée au moment de l'enregistrement (handleEnregistrer).
    if (demande.id < 0) {
      setDemandeCaisses((prev) => [...prev, nouvelleSousCaisseBrouillon(demande, prochainIdTemporaire--)]);
      setLignesEtendues((prev) => new Set(prev).add(demande.id));
      return;
    }
    const nouvelle = sousCaisseSansId(nouvelleSousCaisseBrouillon(demande, 0), demande.id);
    const creee = await demandeCaisseApi.create(nouvelle, trigramme);
    setDemandeCaisses((prev) => [...prev, creee]);
    setLignesEtendues((prev) => new Set(prev).add(demande.id));
  }

  async function handleEditDemandeCaisse(id: number, patch: Partial<DemandeCaisse>) {
    const existante = demandeCaisses.find((c) => c.id === id);
    if (!existante) return;
    // Sous-caisse brouillon (id négatif) : édition purement locale jusqu'à l'enregistrement.
    if (id < 0) {
      setDemandeCaisses((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
      return;
    }
    const { id: _id, ordre: _ordre, ...base } = existante;
    await demandeCaisseApi.update(id, { ...base, ...patch }, trigramme);
    setDemandeCaisses((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function handleDeleteDemandeCaisse(id: number) {
    if (!(await confirmerSuppression("Supprimer cette caisse détaillée ?"))) return;
    if (id < 0) {
      setDemandeCaisses((prev) => prev.filter((c) => c.id !== id));
      return;
    }
    const sousLigne = demandeCaisses.find((c) => c.id === id);
    const demandeParente = sousLigne ? demandes.find((d) => d.id === sousLigne.demande_id) : undefined;
    if (demandeParente) await supprimerCaisseLieeSiConfirmee(demandeParente.affaire, id);
    await demandeCaisseApi.delete(id, trigramme);
    setDemandeCaisses((prev) => prev.filter((c) => c.id !== id));
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
    if (caisseStockId === null) {
      handleEditLocal(demandeId, { caisse_stock_id: null });
      await demandesApi.update(demandeId, sansId(demandesRef.current.find((d) => d.id === demandeId)!, { caisse_stock_id: null }), trigramme);
      setDemandes((prev) => prev.map((d) => (d.id === demandeId ? { ...d, caisse_stock_id: null } : d)));
      return;
    }
    const cs = caissesStock.find((c) => c.id === caisseStockId);
    if (!cs) return;
    if (!(await confirmerEtDemanderReassignment(cs, demandeId))) return;
    const patch: Partial<Demande> = {
      caisse_stock_id: caisseStockId,
      longueur_mm: cs.longueur_mm,
      largeur_mm: cs.largeur_mm,
      hauteur_mm: cs.hauteur_mm,
    };
    const demandeActuelle = demandesRef.current.find((d) => d.id === demandeId);
    if (!demandeActuelle) return;
    await demandesApi.update(demandeId, sansId(demandeActuelle, patch), trigramme);
    setDemandes((prev) => prev.map((d) => (d.id === demandeId ? { ...d, ...patch } : d)));
    handleEditLocal(demandeId, patch);
  }

  async function handleSelectStockSousLigne(id: number, caisseStockId: number | null) {
    if (caisseStockId === null) {
      await handleEditDemandeCaisse(id, { caisse_stock_id: null });
      return;
    }
    const cs = caissesStock.find((c) => c.id === caisseStockId);
    if (!cs) return;
    const sousLigne = demandeCaisses.find((c) => c.id === id);
    if (!sousLigne) return;
    if (!(await confirmerEtDemanderReassignment(cs, sousLigne.demande_id))) return;
    await handleEditDemandeCaisse(id, {
      caisse_stock_id: caisseStockId,
      longueur_mm: cs.longueur_mm,
      largeur_mm: cs.largeur_mm,
      hauteur_mm: cs.hauteur_mm,
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
      await reload();
    } finally {
      setEnregistrement(false);
    }
  }

  function handleAnnuler() {
    setBrouillon(demandes);
    setDemandeCaisses(demandeCaissesServeur);
  }

  async function handleAjouterOption(liste: ListeOption, valeur: string) {
    const creee = await optionsListeApi.create(liste, valeur, trigramme);
    setOptionsPersonnalisees((prev) => (prev.some((o) => o.id === creee.id) ? prev : [...prev, creee]));
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
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>Demandes</h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {modifie && <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Modifications non enregistrées</span>}
          {modifie && (
            <button className="btn" onClick={handleAnnuler}>
              Annuler
            </button>
          )}
          <button className="btn" onClick={() => setAjoutOuvert(true)} disabled={readOnly}>
            + Ajouter des demandes
          </button>
          <button className="btn" onClick={() => setImportOuvert(true)} disabled={readOnly}>
            Coller depuis Excel
          </button>
          <button className="btn" onClick={() => setAjoutOptionOuvert(true)} disabled={readOnly}>
            Ajouter une référence
          </button>
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
            readOnly={readOnly}
          />
        </div>
      )}

      {importOuvert && <PasteImportZoneDemandes onImport={handleImport} onClose={() => setImportOuvert(false)} />}
      {ajoutOuvert && (
        <AjouterDemandesDialog caissesStock={caissesStock} onAjouter={handleAjouterLignes} onClose={() => setAjoutOuvert(false)} />
      )}
      {ajoutOptionOuvert && (
        <AjouterOptionDialog
          optionsPersonnalisees={optionsPersonnalisees}
          onAjouter={handleAjouterOption}
          onSupprimer={handleSupprimerOption}
          onClose={() => setAjoutOptionOuvert(false)}
        />
      )}
    </div>
  );
}
