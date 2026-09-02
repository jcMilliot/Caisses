import { useCallback, useRef, useState } from "react";
import Accueil from "./routes/Accueil";
import AffairesList from "./routes/AffairesList";
import AffaireDetail from "./routes/AffaireDetail";
import DemandesList from "./routes/DemandesList";
import CaissesStockList from "./routes/CaissesStockList";
import DemandesAchatsList from "./routes/DemandesAchatsList";
import Journal from "./routes/Journal";
import CreerAffaireDialog from "./components/CreerAffaireDialog";
import FirstLaunchSetup from "./components/FirstLaunchSetup";
import TrigrammeSetup from "./components/TrigrammeSetup";
import UpdateAvailableDialog from "./components/UpdateAvailableDialog";
import ConfirmDialogHost from "./components/ConfirmDialogHost";
import { confirmerAction } from "./data/confirm";
import { affairesApi } from "./data/affaires";
import { caissesApi } from "./data/caisses";
import { demandeCaisseApi } from "./data/demandeCaisse";
import { useDbSetup } from "./hooks/useDbSetup";
import { useUserSetup } from "./hooks/useUserSetup";
import { useUpdateCheck } from "./hooks/useUpdateCheck";
import type { Demande, DemandeCaisse } from "./domain/types";

type Section = "accueil" | "demandes" | "simulations" | "stock" | "achats" | "journal";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "demandes", label: "Gestion des caisses" },
  { id: "simulations", label: "Simulations" },
  { id: "stock", label: "Caisses en stock" },
  { id: "achats", label: "Demandes d'achats" },
];

// Journal d'audit : accessible au seul trigramme AJC (garde aussi appliquée côté backend).
const TRIGRAMME_JOURNAL = "AJC";

export default function App() {
  const { status: dbStatus, chooseFolder } = useDbSetup();
  const { status: userStatus, trigramme, setTrigramme } = useUserSetup();
  const { update, installing, confirmInstall, dismiss } = useUpdateCheck(dbStatus === "ready");
  const [section, setSection] = useState<Section>("accueil");
  const [affaireId, setAffaireId] = useState<number | null>(null);
  const [creationAffaire, setCreationAffaire] = useState<Demande | null>(null);
  const [creationSousCaisses, setCreationSousCaisses] = useState<DemandeCaisse[]>([]);
  // Vrai quand la section Demandes a des modifications non enregistrées (remonté par DemandesList).
  const demandesModifieRef = useRef(false);
  const marquerDemandesModifie = useCallback((dirty: boolean) => {
    demandesModifieRef.current = dirty;
  }, []);

  // À appeler avant toute navigation hors de la section Demandes. Renvoie false si l'utilisateur
  // annule la sortie (il veut d'abord enregistrer).
  async function confirmerSortieDemandes(): Promise<boolean> {
    if (section !== "demandes" || !demandesModifieRef.current) return true;
    return confirmerAction(
      "Des modifications de la section Demandes ne sont pas enregistrées. Quitter sans enregistrer ?",
      "Modifications non enregistrées",
    );
  }

  async function handleSelectSection(next: Section) {
    if (next === section) return;
    if (!(await confirmerSortieDemandes())) return;
    demandesModifieRef.current = false;
    setSection(next);
    if (next !== "simulations") setAffaireId(null);
  }

  // Crée, dans une affaire déjà existante, une Caisse pour chaque sous-ligne de la demande pas
  // encore liée (demande_caisse_id absent des caisses existantes), PLUS une caisse pour la ligne
  // mère elle-même (peu importe ses dimensions) si elle n'a pas déjà été créée — identifiée par
  // son nom (celui de la demande) parmi les caisses non liées à une sous-ligne.
  async function creerCaissesManquantes(affaireIdCible: number, demande: Demande, sousCaisses: DemandeCaisse[]) {
    if (!trigramme) return;
    const caissesExistantes = await caissesApi.list(affaireIdCible);
    const dejaLiees = new Set(caissesExistantes.map((c) => c.demande_caisse_id).filter((id): id is number => id !== null));
    for (const sc of sousCaisses) {
      if (dejaLiees.has(sc.id)) continue;
      await caissesApi.create(
        affaireIdCible,
        sc.nom,
        sc.longueur_mm,
        sc.largeur_mm,
        sc.hauteur_mm,
        null,
        sc.caisse_stock_id,
        sc.type_envoi_caisse,
        sc.id,
        trigramme,
      );
    }
    const caisseMereExistante = caissesExistantes.find(
      (c) => c.demande_caisse_id === null && c.nom.trim().toLowerCase() === demande.affaire.trim().toLowerCase(),
    );
    if (!caisseMereExistante) {
      const creee = await caissesApi.create(
        affaireIdCible,
        demande.affaire,
        demande.longueur_mm,
        demande.largeur_mm,
        demande.hauteur_mm,
        null,
        demande.caisse_stock_id,
        demande.type_envoi_caisse,
        null,
        trigramme,
      );
      // Lien explicite caisse mère ↔ ligne de demande, pour une synchro fiable des dimensions
      // même si la caisse est renommée dans Simulations.
      if (demande.id > 0) await caissesApi.linkDemande(creee.id, demande.id, trigramme);
    } else if (caisseMereExistante.demande_id === null && demande.id > 0) {
      // Caisse mère créée avant l'ajout de la colonne demande_id : on pose le lien maintenant.
      await caissesApi.linkDemande(caisseMereExistante.id, demande.id, trigramme);
    }
  }

  async function handleSimulerAffaire(demande: Demande) {
    if (!(await confirmerSortieDemandes())) return;
    demandesModifieRef.current = false;
    const affaires = await affairesApi.list();
    const existante = affaires.find((a) => a.nom.trim().toLowerCase() === demande.affaire.trim().toLowerCase());
    const toutes = await demandeCaisseApi.listAll();
    const sousCaisses = toutes.filter((c) => c.demande_id === demande.id);
    if (existante) {
      await creerCaissesManquantes(existante.id, demande, sousCaisses);
      setSection("simulations");
      setAffaireId(existante.id);
      return;
    }
    setCreationSousCaisses(sousCaisses);
    setSection("simulations");
    setAffaireId(null);
    setCreationAffaire(demande);
  }

  async function handleConfirmerCreationAffaire() {
    if (!creationAffaire || !trigramme) return;
    const affaire = await affairesApi.create(creationAffaire.affaire, 70);
    for (const sc of creationSousCaisses) {
      await caissesApi.create(
        affaire.id,
        sc.nom,
        sc.longueur_mm,
        sc.largeur_mm,
        sc.hauteur_mm,
        null,
        sc.caisse_stock_id,
        sc.type_envoi_caisse,
        sc.id,
        trigramme,
      );
    }
    // Caisse mère créée systématiquement, en plus des sous-caisses éventuelles.
    await caissesApi.create(
      affaire.id,
      creationAffaire.affaire,
      creationAffaire.longueur_mm,
      creationAffaire.largeur_mm,
      creationAffaire.hauteur_mm,
      null,
      creationAffaire.caisse_stock_id,
      creationAffaire.type_envoi_caisse,
      null,
      trigramme,
    );
    setCreationAffaire(null);
    setCreationSousCaisses([]);
    setAffaireId(affaire.id);
  }

  if (dbStatus === "needs-setup") {
    return <FirstLaunchSetup onChooseFolder={chooseFolder} />;
  }

  if (dbStatus !== "ready") {
    return null;
  }

  if (userStatus === "needs-setup") {
    return <TrigrammeSetup onSubmit={setTrigramme} />;
  }

  if (userStatus !== "ready" || !trigramme) {
    return null;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {section !== "accueil" && (
        <nav
          style={{
            display: "flex",
            gap: 4,
            padding: "10px 24px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-panel)",
            position: "sticky",
            top: 0,
            zIndex: 50,
          }}
        >
          <button className="btn btn-sm" onClick={() => handleSelectSection("accueil")}>
            ← Accueil
          </button>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={section === s.id ? "btn btn-primary btn-sm" : "btn btn-sm"}
              onClick={() => handleSelectSection(s.id)}
            >
              {s.label}
            </button>
          ))}
          {trigramme === TRIGRAMME_JOURNAL && (
            <button
              className={section === "journal" ? "btn btn-primary btn-sm" : "btn btn-sm"}
              onClick={() => handleSelectSection("journal")}
              style={{ marginLeft: "auto" }}
            >
              Journal
            </button>
          )}
        </nav>
      )}

      <div style={{ flex: 1 }}>
        {section === "accueil" && <Accueil onSelect={handleSelectSection} />}
        {section === "demandes" && (
          <DemandesList
            onSimulerAffaire={handleSimulerAffaire}
            trigramme={trigramme}
            onDirtyChange={marquerDemandesModifie}
          />
        )}
        {section === "simulations" &&
          (affaireId === null ? (
            <AffairesList onOpen={setAffaireId} trigramme={trigramme} />
          ) : (
            <AffaireDetail affaireId={affaireId} onBack={() => setAffaireId(null)} trigramme={trigramme} />
          ))}
        {section === "stock" && <CaissesStockList trigramme={trigramme} />}
        {section === "achats" && <DemandesAchatsList trigramme={trigramme} />}
        {section === "journal" && trigramme === TRIGRAMME_JOURNAL && <Journal trigramme={trigramme} />}
      </div>

      {creationAffaire && (
        <CreerAffaireDialog
          nomAffaire={creationAffaire.affaire}
          caisses={[
            {
              nom: creationAffaire.affaire,
              longueur_mm: creationAffaire.longueur_mm,
              largeur_mm: creationAffaire.largeur_mm,
              hauteur_mm: creationAffaire.hauteur_mm,
            },
            ...creationSousCaisses.map((sc) => ({ nom: sc.nom, longueur_mm: sc.longueur_mm, largeur_mm: sc.largeur_mm, hauteur_mm: sc.hauteur_mm })),
          ]}
          onConfirmer={handleConfirmerCreationAffaire}
          onClose={() => {
            setCreationAffaire(null);
            setCreationSousCaisses([]);
          }}
        />
      )}

      {update && (
        <UpdateAvailableDialog
          version={update.info.version}
          body={update.info.body}
          installing={installing}
          onConfirm={confirmInstall}
          onDismiss={dismiss}
        />
      )}

      <ConfirmDialogHost />
    </div>
  );
}
