import { useState } from "react";
import Accueil from "./routes/Accueil";
import AffairesList from "./routes/AffairesList";
import AffaireDetail from "./routes/AffaireDetail";
import DemandesList from "./routes/DemandesList";
import CaissesStockList from "./routes/CaissesStockList";
import CreerAffaireDialog from "./components/CreerAffaireDialog";
import FirstLaunchSetup from "./components/FirstLaunchSetup";
import TrigrammeSetup from "./components/TrigrammeSetup";
import UpdateAvailableDialog from "./components/UpdateAvailableDialog";
import { affairesApi } from "./data/affaires";
import { caissesApi } from "./data/caisses";
import { useDbSetup } from "./hooks/useDbSetup";
import { useUserSetup } from "./hooks/useUserSetup";
import { useUpdateCheck } from "./hooks/useUpdateCheck";
import type { Demande } from "./domain/types";

type Section = "accueil" | "demandes" | "simulations" | "stock" | "achats";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "demandes", label: "Demandes" },
  { id: "simulations", label: "Simulations" },
  { id: "stock", label: "Caisses en stock" },
  { id: "achats", label: "Demandes d'achats" },
];

export default function App() {
  const { status: dbStatus, chooseFolder } = useDbSetup();
  const { status: userStatus, trigramme, setTrigramme } = useUserSetup();
  const { update, installing, confirmInstall, dismiss } = useUpdateCheck(dbStatus === "ready");
  const [section, setSection] = useState<Section>("accueil");
  const [affaireId, setAffaireId] = useState<number | null>(null);
  const [creationAffaire, setCreationAffaire] = useState<Demande | null>(null);

  function handleSelectSection(next: Section) {
    setSection(next);
    if (next !== "simulations") setAffaireId(null);
  }

  async function handleSimulerAffaire(demande: Demande) {
    const affaires = await affairesApi.list();
    const existante = affaires.find((a) => a.nom.trim().toLowerCase() === demande.affaire.trim().toLowerCase());
    if (existante) {
      setSection("simulations");
      setAffaireId(existante.id);
      return;
    }
    setSection("simulations");
    setAffaireId(null);
    setCreationAffaire(demande);
  }

  async function handleConfirmerCreationAffaire() {
    if (!creationAffaire || !trigramme) return;
    const affaire = await affairesApi.create(creationAffaire.affaire, 90);
    const aDesDimensions = creationAffaire.longueur_mm > 0 || creationAffaire.largeur_mm > 0 || creationAffaire.hauteur_mm > 0;
    await caissesApi.create(
      affaire.id,
      creationAffaire.affaire,
      aDesDimensions ? creationAffaire.longueur_mm : 0,
      aDesDimensions ? creationAffaire.largeur_mm : 0,
      aDesDimensions ? creationAffaire.hauteur_mm : 0,
      null,
      trigramme,
    );
    setCreationAffaire(null);
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
        </nav>
      )}

      <div style={{ flex: 1 }}>
        {section === "accueil" && <Accueil onSelect={handleSelectSection} />}
        {section === "demandes" && <DemandesList onSimulerAffaire={handleSimulerAffaire} trigramme={trigramme} />}
        {section === "simulations" &&
          (affaireId === null ? (
            <AffairesList onOpen={setAffaireId} trigramme={trigramme} />
          ) : (
            <AffaireDetail affaireId={affaireId} onBack={() => setAffaireId(null)} trigramme={trigramme} />
          ))}
        {section === "stock" && <CaissesStockList trigramme={trigramme} />}
        {section === "achats" && <SectionAVenir titre="Demandes d'achats" />}
      </div>

      {creationAffaire && (
        <CreerAffaireDialog
          nomAffaire={creationAffaire.affaire}
          longueur_mm={creationAffaire.longueur_mm}
          largeur_mm={creationAffaire.largeur_mm}
          hauteur_mm={creationAffaire.hauteur_mm}
          onConfirmer={handleConfirmerCreationAffaire}
          onClose={() => setCreationAffaire(null)}
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
    </div>
  );
}

function SectionAVenir({ titre }: { titre: string }) {
  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 16px", letterSpacing: "-0.01em" }}>{titre}</h1>
      <div className="panel" style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-muted)" }}>
        <p style={{ margin: 0 }}>À venir.</p>
      </div>
    </div>
  );
}
