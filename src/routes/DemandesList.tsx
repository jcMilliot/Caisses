import { useEffect, useRef, useState } from "react";
import { demandesApi } from "../data/demandes";
import { demandeCaisseApi } from "../data/demandeCaisse";
import { caisseStockApi } from "../data/caisseStock";
import { affairesApi } from "../data/affaires";
import { caissesApi } from "../data/caisses";
import DemandesTable from "../components/DemandesTable";
import PasteImportZoneDemandes from "../components/PasteImportZoneDemandes";
import AjouterDemandesDialog from "../components/AjouterDemandesDialog";
import LockBanner from "../components/LockBanner";
import { useSectionLock } from "../hooks/useSectionLock";
import { confirmerSuppression, confirmerAction } from "../data/confirm";
import { estArCaiss } from "../domain/caisseStock";
import { contrePlaqueParDefaut } from "../domain/demandeOptions";
import type { Demande, NewDemande, DemandeCaisse, NewDemandeCaisse, CaisseStock } from "../domain/types";

let prochainIdTemporaire = -1;

function versDemande(n: NewDemande, id: number): Demande {
  return { ...n, id, validee: false, ordre: 0 };
}

function sansId(d: Demande, patch: Partial<Demande>): NewDemande {
  const { id: _id, ordre: _ordre, validee: _validee, ...base } = { ...d, ...patch };
  return base;
}

interface Props {
  onSimulerAffaire: (demande: Demande) => void;
  trigramme: string;
}

export default function DemandesList({ onSimulerAffaire, trigramme }: Props) {
  const lock = useSectionLock("demandes", trigramme);
  const readOnly = lock.status !== "held";
  const [demandes, setDemandes] = useState<Demande[]>([]);
  // Copie éditable localement : les modifications de champs/cases à cocher et les nouvelles
  // lignes n'atteignent le serveur qu'au clic sur "Enregistrer" (pas de sauvegarde auto par
  // édition, pour éviter les allers-retours réseau à chaque frappe/coche).
  const [brouillon, setBrouillon] = useState<Demande[]>([]);
  const [demandeCaisses, setDemandeCaisses] = useState<DemandeCaisse[]>([]);
  const [caissesStock, setCaissesStock] = useState<CaisseStock[]>([]);
  const [lignesEtendues, setLignesEtendues] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [importOuvert, setImportOuvert] = useState(false);
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const brouillonRef = useRef(brouillon);
  brouillonRef.current = brouillon;
  const demandesRef = useRef(demandes);
  demandesRef.current = demandes;

  const modifie = JSON.stringify(brouillon) !== JSON.stringify(demandes);

  async function reload() {
    setLoading(true);
    try {
      const [d, dc, cs] = await Promise.all([demandesApi.list(), demandeCaisseApi.listAll(), caisseStockApi.list()]);
      setDemandes(d);
      setBrouillon(d);
      setDemandeCaisses(dc);
      setCaissesStock(cs);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (JSON.stringify(brouillonRef.current) !== JSON.stringify(demandesRef.current)) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  async function handleImport(nouvelles: NewDemande[]) {
    // Le collage Excel reste un import immédiat (gros volume, distinct des éditions manuelles).
    await demandesApi.bulkCreate(nouvelles, trigramme);
    await reload();
  }

  function handleAjouterLignes(nouvelles: NewDemande[]) {
    setBrouillon((prev) => [...prev, ...nouvelles.map((n) => versDemande(n, prochainIdTemporaire--))]);
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
      // Ligne ajoutée localement, pas encore en base : la retirer suffit.
      setBrouillon((prev) => prev.filter((d) => d.id !== id));
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
  }

  async function handleCreerDemandeCaisse(demande: Demande) {
    const nouvelle: NewDemandeCaisse = {
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
      caisse_stock_id: null,
    };
    const creee = await demandeCaisseApi.create(nouvelle, trigramme);
    setDemandeCaisses((prev) => [...prev, creee]);
    setLignesEtendues((prev) => new Set(prev).add(demande.id));
  }

  async function handleEditDemandeCaisse(id: number, patch: Partial<DemandeCaisse>) {
    const existante = demandeCaisses.find((c) => c.id === id);
    if (!existante) return;
    const { id: _id, ordre: _ordre, ...base } = existante;
    await demandeCaisseApi.update(id, { ...base, ...patch }, trigramme);
    setDemandeCaisses((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function handleDeleteDemandeCaisse(id: number) {
    if (!(await confirmerSuppression("Supprimer cette caisse détaillée ?"))) return;
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
        await demandesApi.bulkCreate(
          aCreer.map(({ id: _id, ordre: _ordre, validee: _validee, ...n }) => n),
          trigramme,
        );
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
            readOnly={readOnly}
          />
        </div>
      )}

      {importOuvert && <PasteImportZoneDemandes onImport={handleImport} onClose={() => setImportOuvert(false)} />}
      {ajoutOuvert && (
        <AjouterDemandesDialog caissesStock={caissesStock} onAjouter={handleAjouterLignes} onClose={() => setAjoutOuvert(false)} />
      )}
    </div>
  );
}
