import { useState } from "react";
import { confirmerAction } from "../data/confirm";
import type { NewDemande, CaisseStock, OptionListe } from "../domain/types";
import {
  TYPES_ENVOI_CAISSE,
  TRAITEMENTS,
  optionsListe,
  estCaisse4C,
  AVERTISSEMENT_MOUSSE_4C,
  ouverturesAutorisees,
  appliquerReglesCaisse,
} from "../domain/demandeOptions";
import SelectOuAutre from "./SelectOuAutre";

interface Props {
  caissesStock: CaisseStock[];
  optionsPersonnalisees: OptionListe[];
  // Retourne false pour garder le dialogue ouvert (ex. l'utilisateur a annulé un avertissement
  // « affaire déjà présente ») ; true / void = les lignes ont été prises en compte.
  onAjouter: (demandes: NewDemande[]) => boolean | void | Promise<boolean | void>;
  onClose: () => void;
}

function ligneVide(): NewDemande {
  return {
    ok_pour_passer_cde: false,
    affaire: "",
    type_envoi_caisse: "",
    type_ouverture: "",
    stock: "",
    longueur_mm: 0,
    largeur_mm: 0,
    hauteur_mm: 0,
    quantite: 1,
    date_picking: "",
    date_demandee_s2c: "",
    moteurs: "",
    module_lineaire: "",
    terminaux: "",
    traitement: "",
    informations_supp: "",
    cde_passee_affaire: false,
    cde_passee_achat_stock: false,
    observations: "",
    // STANDARD par défaut → contre-plaqué requis.
    contre_plaque: true,
    caisse_stock_id: null,
  };
}

export default function AjouterDemandesDialog({ caissesStock, optionsPersonnalisees, onAjouter, onClose }: Props) {
  const [lignes, setLignes] = useState<NewDemande[]>([ligneVide()]);
  const [erreurValidation, setErreurValidation] = useState<string | null>(null);
  const moteurs = optionsListe("moteurs", optionsPersonnalisees);
  const modulesLineaires = optionsListe("module_lineaire", optionsPersonnalisees);
  const terminaux = optionsListe("terminaux", optionsPersonnalisees);

  function majLigne(index: number, patch: Partial<NewDemande>) {
    setLignes((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
    setErreurValidation(null);
  }

  // Règles dynamiques (ouverture autorisée, NIMP15, contre-plaqué) — cf. appliquerReglesCaisse.
  function changerTypeEnvoi(index: number, valeur: string) {
    setErreurValidation(null);
    setLignes((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l;
        const regles = appliquerReglesCaisse({
          type_envoi_caisse: valeur,
          type_ouverture: l.type_ouverture,
          traitement: l.traitement,
          caisse_stock_id: l.caisse_stock_id,
        });
        return { ...l, type_envoi_caisse: valeur, ...regles };
      }),
    );
  }

  function ajouterLigne() {
    setLignes((prev) => [...prev, ligneVide()]);
  }

  function retirerLigne(index: number) {
    setLignes((prev) => prev.filter((_, i) => i !== index));
  }

  // Une ligne a été touchée si elle diffère d'une ligne vide (affaire, dims, dates, listes…).
  const aDeLaSaisie = lignes.some((l) => JSON.stringify(l) !== JSON.stringify(ligneVide()));

  // Champs obligatoires manquants, par ligne (Affaire ; Qté >= 1).
  function champsManquants(l: NewDemande): string[] {
    const m: string[] = [];
    if (l.affaire.trim() === "") m.push("Affaire");
    if (!Number.isFinite(l.quantite) || l.quantite < 1) m.push("Qté");
    return m;
  }

  async function handleAjouter() {
    const lignesRemplies = lignes.filter((l) => JSON.stringify(l) !== JSON.stringify(ligneVide()));
    const aCreer = lignesRemplies.length > 0 ? lignesRemplies : lignes;
    const incompletes = aCreer.filter((l) => champsManquants(l).length > 0);
    if (incompletes.length > 0) {
      const champs = [...new Set(incompletes.flatMap(champsManquants))].join(" et ");
      setErreurValidation(
        aCreer.length === 1
          ? `Champ obligatoire non renseigné : ${champs}.`
          : `${incompletes.length} caisse(s) incomplète(s) — champ(s) obligatoire(s) manquant(s) : ${champs}.`,
      );
      return;
    }
    setErreurValidation(null);
    const resultat = await onAjouter(aCreer);
    if (resultat === false) return; // avertissement annulé — on garde la saisie à l'écran
    onClose();
  }

  async function handleFermer() {
    if (aDeLaSaisie && !(await confirmerAction("Abandonner la saisie en cours ?", "Fermer sans enregistrer"))) return;
    onClose();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={handleFermer}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-panel)",
          borderRadius: "var(--radius-lg)",
          width: 1100,
          maxWidth: "96vw",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Créer une nouvelle caisse</h2>
        </div>

        <div style={{ padding: 20, overflow: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          {lignes.map((ligne, index) => (
            <div
              key={index}
              className="panel"
              style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, position: "relative" }}
            >
              {lignes.length > 1 && (
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => retirerLigne(index)}
                  style={{ position: "absolute", top: 8, right: 8 }}
                >
                  Retirer
                </button>
              )}

              <Champ label="Affaire">
                <input
                  autoFocus={index === 0}
                  value={ligne.affaire}
                  onChange={(e) => majLigne(index, { affaire: e.target.value })}
                  style={champObligatoireStyle}
                />
              </Champ>

              <Champ label="Type envoi caisse">
                <SelectOuAutre
                  valeur={ligne.type_envoi_caisse}
                  options={TYPES_ENVOI_CAISSE}
                  onChange={(v) => changerTypeEnvoi(index, v)}
                />
                {estCaisse4C(ligne.type_envoi_caisse) && (
                  <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--warn-text)" }}>{AVERTISSEMENT_MOUSSE_4C}</p>
                )}
              </Champ>

              <Champ label="Type ouverture">
                <SelectOuAutre
                  valeur={ligne.type_ouverture}
                  options={ouverturesAutorisees(ligne)}
                  onChange={(v) => majLigne(index, { type_ouverture: v })}
                />
              </Champ>

              <Champ label="Stock">
                <select
                  value={ligne.caisse_stock_id ?? ""}
                  onChange={(e) => {
                    if (e.target.value === "") {
                      majLigne(index, { caisse_stock_id: null });
                      return;
                    }
                    const cs = caissesStock.find((c) => c.id === Number(e.target.value));
                    if (!cs) return;
                    majLigne(index, {
                      caisse_stock_id: cs.id,
                      longueur_mm: cs.longueur_mm,
                      largeur_mm: cs.largeur_mm,
                      hauteur_mm: cs.hauteur_mm,
                      // Caisse en stock → type d'ouverture forcé « Par dessus ».
                      type_ouverture: ouverturesAutorisees({ ...ligne, caisse_stock_id: cs.id })[0],
                    });
                  }}
                  style={inputStyle}
                >
                  <option value="">— Choisir —</option>
                  {caissesStock
                    .filter((c) => !c.validee || c.id === ligne.caisse_stock_id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                      </option>
                    ))}
                </select>
              </Champ>

              <Champ label="Longueur (m)">
                <DimInput valeurMm={ligne.longueur_mm} onChangeMm={(mm) => majLigne(index, { longueur_mm: mm })} />
              </Champ>

              <Champ label="Largeur (m)">
                <DimInput valeurMm={ligne.largeur_mm} onChangeMm={(mm) => majLigne(index, { largeur_mm: mm })} />
              </Champ>

              <Champ label="Hauteur (m)">
                <DimInput valeurMm={ligne.hauteur_mm} onChangeMm={(mm) => majLigne(index, { hauteur_mm: mm })} />
              </Champ>

              <Champ label="Qté">
                <input
                  type="number"
                  min={1}
                  value={ligne.quantite}
                  onChange={(e) => majLigne(index, { quantite: Math.round(Number(e.target.value)) || 1 })}
                  style={champObligatoireStyle}
                />
              </Champ>

              <Champ label="Date picking">
                <input
                  type="date"
                  value={ligne.date_picking}
                  onChange={(e) => majLigne(index, { date_picking: e.target.value })}
                  style={inputStyle}
                />
              </Champ>

              <Champ label="Date demandée à S2C">
                <input
                  type="date"
                  value={ligne.date_demandee_s2c}
                  onChange={(e) => majLigne(index, { date_demandee_s2c: e.target.value })}
                  style={inputStyle}
                />
              </Champ>

              <Champ label="Moteurs">
                <SelectOuAutre valeur={ligne.moteurs} options={moteurs} onChange={(v) => majLigne(index, { moteurs: v })} />
              </Champ>

              <Champ label="Module linéaire">
                <SelectOuAutre
                  valeur={ligne.module_lineaire}
                  options={modulesLineaires}
                  onChange={(v) => majLigne(index, { module_lineaire: v })}
                />
              </Champ>

              <Champ label="Terminaux">
                <SelectOuAutre valeur={ligne.terminaux} options={terminaux} onChange={(v) => majLigne(index, { terminaux: v })} />
              </Champ>

              <Champ label="Traitement">
                <SelectOuAutre
                  valeur={ligne.traitement}
                  options={TRAITEMENTS}
                  onChange={(v) => majLigne(index, { traitement: v })}
                />
              </Champ>

              <Champ label="Informations supplémentaires" span={2}>
                <input
                  value={ligne.informations_supp}
                  onChange={(e) => majLigne(index, { informations_supp: e.target.value })}
                  style={inputStyle}
                />
              </Champ>

              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                <input
                  type="checkbox"
                  checked={ligne.cde_passee_affaire}
                  onChange={(e) =>
                    majLigne(index, e.target.checked ? { cde_passee_affaire: true, cde_passee_achat_stock: false } : { cde_passee_affaire: false })
                  }
                />
                Cde passée sur affaire
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                <input
                  type="checkbox"
                  checked={ligne.cde_passee_achat_stock}
                  onChange={(e) =>
                    majLigne(index, e.target.checked ? { cde_passee_achat_stock: true, cde_passee_affaire: false } : { cde_passee_achat_stock: false })
                  }
                />
                Cde passée sur achat stock
              </label>
            </div>
          ))}

          <button className="btn" onClick={ajouterLigne} style={{ alignSelf: "flex-start" }}>
            + Ajouter une ligne
          </button>
        </div>

        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: erreurValidation ? "space-between" : "flex-end",
            alignItems: "center",
            gap: 12,
          }}
        >
          {erreurValidation && (
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--danger-text)" }}>⚠ {erreurValidation}</span>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={handleFermer}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={handleAjouter}>
              Créer {lignes.filter((l) => l.affaire.trim()).length || ""} caisse(s)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Champ({ label, span, children }: { label: string; span?: number; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: span ? `span ${span}` : undefined }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

// Saisie d'une dimension en mètres : state texte local pour ne pas être gêné par un input
// numérique contrôlé (« 0.5 » restait bloqué à « 0 » avec value = n/1000 || "").
function DimInput({ valeurMm, onChangeMm }: { valeurMm: number; onChangeMm: (mm: number) => void }) {
  const [texte, setTexte] = useState(valeurMm === 0 ? "" : String(valeurMm / 1000));
  return (
    <input
      type="text"
      inputMode="decimal"
      value={texte}
      placeholder="m"
      style={inputStyle}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        setTexte(e.target.value);
        const n = Number(e.target.value.replace(",", "."));
        onChangeMm(Number.isFinite(n) ? Math.round(n * 1000) : 0);
      }}
    />
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11.5,
  color: "var(--text-muted)",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 8px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius)",
  background: "var(--bg-panel)",
  color: "var(--text)",
  font: "inherit",
};

// Champs obligatoires (Affaire, Qté) : fond légèrement orangé pour signaler qu'ils doivent
// être renseignés.
const champObligatoireStyle: React.CSSProperties = {
  ...inputStyle,
  background: "var(--warn-bg)",
  borderColor: "var(--warn-border)",
};
