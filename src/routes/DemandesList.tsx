import { useEffect, useRef, useState } from "react";
import { demandesApi } from "../data/demandes";
import DemandesTable from "../components/DemandesTable";
import PasteImportZoneDemandes from "../components/PasteImportZoneDemandes";
import AjouterDemandesDialog from "../components/AjouterDemandesDialog";
import type { Demande, NewDemande } from "../domain/types";

let prochainIdTemporaire = -1;

function versDemande(n: NewDemande, id: number): Demande {
  return { ...n, id, validee: false, ordre: 0 };
}

interface Props {
  onSimulerAffaire: (demande: Demande) => void;
}

export default function DemandesList({ onSimulerAffaire }: Props) {
  const [demandes, setDemandes] = useState<Demande[]>([]);
  // Copie éditable localement : les modifications de champs/cases à cocher et les nouvelles
  // lignes n'atteignent le serveur qu'au clic sur "Enregistrer" (pas de sauvegarde auto par
  // édition, pour éviter les allers-retours réseau à chaque frappe/coche).
  const [brouillon, setBrouillon] = useState<Demande[]>([]);
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
      const d = await demandesApi.list();
      setDemandes(d);
      setBrouillon(d);
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
    await demandesApi.bulkCreate(nouvelles);
    await reload();
  }

  function handleAjouterLignes(nouvelles: NewDemande[]) {
    setBrouillon((prev) => [...prev, ...nouvelles.map((n) => versDemande(n, prochainIdTemporaire--))]);
  }

  function handleEditLocal(id: number, patch: Partial<Demande>) {
    setBrouillon((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  async function handleDelete(id: number, affaire: string) {
    if (!window.confirm(`Supprimer la demande « ${affaire} » ?`)) return;
    if (id < 0) {
      // Ligne ajoutée localement, pas encore en base : la retirer suffit.
      setBrouillon((prev) => prev.filter((d) => d.id !== id));
      return;
    }
    await demandesApi.delete(id);
    await reload();
  }

  function handleValider(id: number, validee: boolean) {
    handleEditLocal(id, { validee });
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
        await demandesApi.bulkCreate(aCreer.map(({ id: _id, ordre: _ordre, validee: _validee, ...n }) => n));
      }
      for (const d of aModifier) {
        const { id, ordre: _ordre, validee, ...n } = d;
        const original = demandes.find((o) => o.id === id);
        await demandesApi.update(id, n);
        if (!original || original.validee !== validee) {
          await demandesApi.setValidee(id, validee);
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
          <button className="btn" onClick={() => setAjoutOuvert(true)}>
            + Ajouter des demandes
          </button>
          <button className="btn" onClick={() => setImportOuvert(true)}>
            Coller depuis Excel
          </button>
          <button className="btn btn-primary" disabled={!modifie || enregistrement} onClick={handleEnregistrer}>
            {enregistrement ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Chargement…</p>
      ) : (
        <div className="panel" style={{ padding: 4 }}>
          <DemandesTable
            demandes={brouillon}
            onEdit={handleEditLocal}
            onDelete={handleDelete}
            onValider={handleValider}
            onSimulerAffaire={onSimulerAffaire}
          />
        </div>
      )}

      {importOuvert && <PasteImportZoneDemandes onImport={handleImport} onClose={() => setImportOuvert(false)} />}
      {ajoutOuvert && <AjouterDemandesDialog onAjouter={handleAjouterLignes} onClose={() => setAjoutOuvert(false)} />}
    </div>
  );
}
