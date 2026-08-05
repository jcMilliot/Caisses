import { useState } from "react";
import type { NewDemande } from "../domain/types";
import { dateExcelVersIso, dateIsoVersAffichage } from "../domain/dates";
import { necessiteNimp15 } from "../domain/demandeOptions";

interface Props {
  onImport: (demandes: NewDemande[]) => Promise<void>;
  onClose: () => void;
}

// Ordre attendu des colonnes lors du collage depuis Excel.
const COLONNES = [
  "Ok pour passer cde",
  "AFFAIRE",
  "Type ENVOI caisse",
  "Type d'ouverture",
  "STOCK",
  "Longueur (L)",
  "Largeur (l)",
  "Hauteur (H)",
  "qté",
  "date sur le picking",
  "date demandée à S2C",
  "Moteurs",
  "Module Linéaire",
  "Terminaux",
  "Traitement",
  "Informations supplémentaires",
  "cde passée sur affaire",
  "cde passée sur ACHAT STOCK",
  "observations",
];

const NB_COLONNES = COLONNES.length;

function parseBool(s: string): boolean {
  const v = s.trim().toLowerCase();
  return v === "oui" || v === "1" || v === "true" || v === "x" || v === "vrai";
}

function parseNombre(s: string): number {
  const n = Number(s.trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// Les dimensions du fichier Excel sont saisies en mètres ; le modèle de données les stocke en mm.
function parseMetresEnMm(s: string): number {
  return parseNombre(s) * 1000;
}

// Valeurs connues de la colonne "Type ENVOI caisse" — sert à détecter le cas où la tabulation
// de la 1ère colonne ("Ok pour passer cde") manque parce que la cellule était vide en tête de
// la sélection copiée depuis Excel (Excel n'émet alors pas de tabulation initiale).
const TYPES_ENVOI_CONNUS = /^(STANDARD|MER)(\s*\(?\d?[A-Z]?\)?)?$/i;

function parseColle(texte: string): { demandes: NewDemande[]; erreurs: string[] } {
  // Ne pas utiliser .trim() ici : une case "Ok pour passer cde" vide en tête de ligne produit
  // une tabulation de début significative qu'un trim() supprimerait à tort, décalant toutes
  // les colonnes suivantes.
  const lignes = texte
    .split(/\r?\n/)
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.length > 0);

  const demandes: NewDemande[] = [];
  const erreurs: string[] = [];

  lignes.forEach((ligne, i) => {
    const colsBrutes = ligne.split("\t");
    if (colsBrutes.length > NB_COLONNES) {
      erreurs.push(
        `Ligne ${i + 1} : ${colsBrutes.length} colonne(s) trouvée(s), ${NB_COLONNES} attendues au maximum — ignorée`
      );
      return;
    }
    // Si la case "Ok pour passer cde" est vide et se trouve en tête de la sélection copiée,
    // Excel n'émet pas sa tabulation : la ligne arrive avec une colonne de moins et tout est
    // décalé (le nom d'affaire atterrit en position 1, le type d'envoi en position 2). On le
    // détecte via le contenu de la 2e valeur brute, qui ressemble alors à un type d'envoi
    // connu plutôt qu'au nom d'affaire attendu en position 1.
    const decalageDetecte = colsBrutes.length === NB_COLONNES - 1 && TYPES_ENVOI_CONNUS.test((colsBrutes[1] ?? "").trim());
    const colsAlignees = decalageDetecte ? ["", ...colsBrutes] : colsBrutes;
    // Excel omet aussi les tabulations des cellules vides en fin de ligne : on complète
    // les colonnes manquantes avec des valeurs vides plutôt que de rejeter la ligne.
    const cols = [...colsAlignees, ...Array(NB_COLONNES - colsAlignees.length).fill("")];
    const [
      ok,
      affaire,
      typeEnvoi,
      typeOuverture,
      stock,
      l,
      largeur,
      h,
      qte,
      datePicking,
      dateS2c,
      moteurs,
      moduleLineaire,
      terminaux,
      traitement,
      infosSupp,
      cdeAffaire,
      cdeAchatStock,
      observations,
    ] = cols;

    if (!affaire.trim()) {
      erreurs.push(`Ligne ${i + 1} : AFFAIRE manquante — ignorée`);
      return;
    }

    const typeEnvoiTrim = typeEnvoi.trim();
    const traitementTrim = traitement.trim();

    demandes.push({
      ok_pour_passer_cde: parseBool(ok),
      affaire: affaire.trim(),
      type_envoi_caisse: typeEnvoiTrim,
      type_ouverture: typeOuverture.trim(),
      stock: stock.trim(),
      longueur_mm: parseMetresEnMm(l),
      largeur_mm: parseMetresEnMm(largeur),
      hauteur_mm: parseMetresEnMm(h),
      quantite: Math.round(parseNombre(qte)) || 1,
      date_picking: dateExcelVersIso(datePicking),
      date_demandee_s2c: dateExcelVersIso(dateS2c),
      moteurs: moteurs.trim(),
      module_lineaire: moduleLineaire.trim(),
      terminaux: terminaux.trim(),
      traitement: !traitementTrim && necessiteNimp15(typeEnvoiTrim) ? "NIMP15" : traitementTrim,
      informations_supp: infosSupp.trim(),
      cde_passee_affaire: parseBool(cdeAffaire),
      cde_passee_achat_stock: parseBool(cdeAchatStock),
      observations: observations.trim(),
      caisse_stock_id: null,
    });
  });

  return { demandes, erreurs };
}

export default function PasteImportZoneDemandes({ onImport, onClose }: Props) {
  const [texte, setTexte] = useState("");
  const [importing, setImporting] = useState(false);

  const { demandes, erreurs } = parseColle(texte);

  async function handleImport() {
    if (demandes.length === 0) return;
    setImporting(true);
    try {
      await onImport(demandes);
      onClose();
    } finally {
      setImporting(false);
    }
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
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-panel)",
          borderRadius: "var(--radius-lg)",
          width: 1000,
          maxWidth: "94vw",
          maxHeight: "86vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Coller des demandes depuis Excel</h2>
          <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--text-muted)" }}>
            Colonnes attendues, dans l'ordre : {COLONNES.join(" · ")}
          </p>
        </div>

        <div style={{ padding: 20, overflow: "auto", flex: 1 }}>
          <textarea
            autoFocus
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            placeholder="Sélectionnez vos lignes dans Excel, copiez (Ctrl+C), puis collez ici (Ctrl+V)…"
            style={{
              width: "100%",
              height: 160,
              padding: 10,
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius)",
              fontFamily: "var(--font-mono)",
              fontSize: 12.5,
              resize: "vertical",
            }}
          />

          {texte.trim() && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 8 }}>
                {demandes.length} demande(s) détectée(s){erreurs.length > 0 && `, ${erreurs.length} ligne(s) ignorée(s)`}
              </div>

              {erreurs.length > 0 && (
                <ul style={{ margin: "0 0 12px", padding: 0, listStyle: "none" }}>
                  {erreurs.map((e, i) => (
                    <li
                      key={i}
                      style={{
                        fontSize: 12,
                        color: "var(--danger-text)",
                        background: "var(--danger-bg)",
                        border: "1px solid var(--danger-border)",
                        borderRadius: 4,
                        padding: "4px 8px",
                        marginBottom: 4,
                      }}
                    >
                      {e}
                    </li>
                  ))}
                </ul>
              )}

              {demandes.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", fontSize: 12.5, whiteSpace: "nowrap" }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
                        {COLONNES.map((c) => (
                          <th key={c} style={{ padding: "4px 8px", borderBottom: "1px solid var(--border)" }}>
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {demandes.slice(0, 20).map((d, i) => (
                        <tr key={i}>
                          <td style={tdStyle}>{d.ok_pour_passer_cde ? "Oui" : ""}</td>
                          <td style={tdStyle}>{d.affaire}</td>
                          <td style={tdStyle}>{d.type_envoi_caisse}</td>
                          <td style={tdStyle}>{d.type_ouverture}</td>
                          <td style={tdStyle}>{d.stock}</td>
                          <td className="mono" style={tdStyle}>{(d.longueur_mm / 1000).toFixed(2)}</td>
                          <td className="mono" style={tdStyle}>{(d.largeur_mm / 1000).toFixed(2)}</td>
                          <td className="mono" style={tdStyle}>{(d.hauteur_mm / 1000).toFixed(2)}</td>
                          <td className="mono" style={tdStyle}>{d.quantite}</td>
                          <td style={tdStyle}>{dateIsoVersAffichage(d.date_picking)}</td>
                          <td style={tdStyle}>{dateIsoVersAffichage(d.date_demandee_s2c)}</td>
                          <td style={tdStyle}>{d.moteurs}</td>
                          <td style={tdStyle}>{d.module_lineaire}</td>
                          <td style={tdStyle}>{d.terminaux}</td>
                          <td style={tdStyle}>{d.traitement}</td>
                          <td style={tdStyle}>{d.informations_supp}</td>
                          <td style={tdStyle}>{d.cde_passee_affaire ? "Oui" : ""}</td>
                          <td style={tdStyle}>{d.cde_passee_achat_stock ? "Oui" : ""}</td>
                          <td style={tdStyle}>{d.observations}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {demandes.length > 20 && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                  … et {demandes.length - 20} de plus
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" disabled={demandes.length === 0 || importing} onClick={handleImport}>
            {importing ? "Import…" : `Importer ${demandes.length} demande(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}

const tdStyle: React.CSSProperties = {
  padding: "4px 8px",
  borderBottom: "1px solid var(--border)",
};
