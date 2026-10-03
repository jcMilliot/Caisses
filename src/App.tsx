import { useCallback, useEffect, useRef, useState } from "react";
import Accueil from "./routes/Accueil";
import AffairesList from "./routes/AffairesList";
import AffaireDetail from "./routes/AffaireDetail";
import DemandesList from "./routes/DemandesList";
import CaissesStockList from "./routes/CaissesStockList";
import DemandesAchatsList from "./routes/DemandesAchatsList";
import Admin from "./routes/Admin";
import Documentation from "./routes/Documentation";
import CreerAffaireDialog from "./components/CreerAffaireDialog";
import FirstLaunchSetup from "./components/FirstLaunchSetup";
import TrigrammeSetup from "./components/TrigrammeSetup";
import BandeauMiseAJour from "./components/BandeauMiseAJour";
import ConfirmDialogHost from "./components/ConfirmDialogHost";
import DemandeFermetureDialog from "./components/DemandeFermetureDialog";
import IconeNav from "./components/IconeNav";
import { confirmerAction } from "./data/confirm";
import { adminApi, type Role } from "./data/admin";
import { definirLectureSeuleRole } from "./hooks/useSectionLock";
import { affairesApi } from "./data/affaires";
import { caissesApi } from "./data/caisses";
import { demandeCaisseApi } from "./data/demandeCaisse";
import { useDbSetup } from "./hooks/useDbSetup";
import { useUserSetup } from "./hooks/useUserSetup";
import { useUpdateCheck } from "./hooks/useUpdateCheck";
import { useBackupAuto } from "./hooks/useBackupAuto";
import { usePresence } from "./hooks/usePresence";
import { useAlerteCommande } from "./hooks/useAlerteCommande";
import type { Demande, DemandeCaisse } from "./domain/types";

type Section = "accueil" | "demandes" | "simulations" | "stock" | "achats" | "admin" | "documentation";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "demandes", label: "Gestion des caisses" },
  { id: "simulations", label: "Simulations" },
  { id: "stock", label: "Caisses en stock" },
  { id: "achats", label: "Demandes d'achats" },
];

export default function App() {
  const { status: dbStatus, chooseFolder } = useDbSetup();
  const { status: userStatus, trigramme, setTrigramme, confirmerTrigramme } = useUserSetup();
  const { update, afficherBandeau, progression, erreur: erreurMaj, confirmInstall, dismiss } =
    useUpdateCheck(dbStatus === "ready");
  const utilisateurPret = dbStatus === "ready" && userStatus === "ready" ? trigramme : null;
  useBackupAuto(utilisateurPret);
  const demandeFermeture = usePresence(utilisateurPret);
  // Alimente la liste des utilisateurs de la page Admin (dernière connexion).
  useEffect(() => {
    if (utilisateurPret) adminApi.enregistrerConnexion(utilisateurPret).catch(() => {});
  }, [utilisateurPret]);
  const [section, setSection] = useState<Section>("accueil");
  // Rôle du trigramme, relu à chaque changement d'écran (un admin peut le changer depuis un autre
  // poste). Les écrans ne s'affichent qu'une fois connu : un Lecteur ne doit jamais prendre de
  // verrou, même brièvement.
  const [role, setRole] = useState<Role | null>(null);
  useEffect(() => {
    if (!utilisateurPret) return;
    adminApi
      .getRole(utilisateurPret)
      .then((r) => {
        definirLectureSeuleRole(r === "lecteur");
        setRole(r);
      })
      .catch(() => setRole((prev) => prev ?? "utilisateur"));
  }, [utilisateurPret, section]);
  const estAdmin = role === "admin";
  useAlerteCommande(utilisateurPret !== null, section);
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
    const affaire = await affairesApi.create(creationAffaire.affaire, trigramme);
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
    return <TrigrammeSetup onSubmit={setTrigramme} onTermine={confirmerTrigramme} />;
  }

  if (userStatus !== "ready" || !trigramme || role === null) {
    return null;
  }

  return (
    // Barre de mise à jour tout en haut de la fenêtre (2026-10-02), le reste de l'app défile en
    // dessous : la navbar et les bandeaux collants (calés sur `top: 0` / `top: 46`…) restent
    // relatifs à cette zone et ne passent jamais sous la barre.
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {update && afficherBandeau && (
        <BandeauMiseAJour
          version={update.info.version}
          progression={progression}
          erreur={erreurMaj}
          onInstaller={confirmInstall}
          onPlusTard={dismiss}
        />
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column" }}>
      {section !== "accueil" && (
        // Barre de navigation en onglets (refonte visuelle 2026-10-02) : logo + nom à gauche,
        // entrées inchangées (Accueil, 4 sections), Documentation / Admin en liens discrets à droite.
        // Hauteur = --nav-h (index.css), repère des bandeaux collants des écrans.
        <nav className="app-nav">
          <div className="app-nav-brand">Caisses</div>
          <button className="nav-tab" onClick={() => handleSelectSection("accueil")}>
            <IconeNav nom="accueil" taille={15} />
            Accueil
          </button>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={section === s.id ? "nav-tab actif" : "nav-tab"}
              onClick={() => handleSelectSection(s.id)}
            >
              {s.label}
            </button>
          ))}
          <span style={{ marginLeft: "auto" }} />
          <button
            className={section === "documentation" ? "nav-lien actif" : "nav-lien"}
            onClick={() => handleSelectSection("documentation")}
          >
            <IconeNav nom="documentation" taille={15} />
            Documentation
          </button>
          {estAdmin && (
            <button
              className={section === "admin" ? "nav-lien actif" : "nav-lien"}
              onClick={() => handleSelectSection("admin")}
            >
              <IconeNav nom="admin" taille={15} />
              Admin
            </button>
          )}
        </nav>
      )}

      <div style={{ flex: 1 }}>
        {section === "accueil" && (
          <Accueil onSelect={handleSelectSection} estAdmin={estAdmin} />
        )}
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
            <AffaireDetail affaireId={affaireId} onBack={() => setAffaireId(null)} trigramme={trigramme} estAdmin={estAdmin} />
          ))}
        {section === "stock" && <CaissesStockList trigramme={trigramme} />}
        {section === "achats" && <DemandesAchatsList trigramme={trigramme} />}
        {section === "admin" && estAdmin && <Admin trigramme={trigramme} />}
        {section === "documentation" && <Documentation trigramme={trigramme} estAdmin={estAdmin} />}
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

      </div>

      <ConfirmDialogHost />
      {demandeFermeture && <DemandeFermetureDialog demandeur={demandeFermeture} />}
    </div>
  );
}
