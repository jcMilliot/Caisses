import { useMemo, useState } from "react";
import type { ListeOption, OptionListe } from "../domain/types";
import { LIBELLE_LISTE, comparerOption, optionsListe } from "../domain/demandeOptions";
import { confirmerAction, confirmerSuppression } from "../data/confirm";

interface Props {
  optionsPersonnalisees: OptionListe[];
  onAjouter: (liste: ListeOption, valeur: string) => Promise<void>;
  onRenommer: (id: number, valeur: string) => Promise<void>;
  onSupprimer: (id: number) => Promise<void>;
  compterUsage: (id: number) => Promise<number>;
  onClose: () => void;
}

const LISTES: ListeOption[] = ["moteurs", "module_lineaire", "terminaux"];

// Gestion des valeurs personnalisées des listes déroulantes de la section Demandes (colonnes
// Moteurs / Module linéaire / Terminaux, table `option_liste`). Ajout, renommage (répercuté
// sur les lignes existantes côté backend), suppression simple ou multiple. Les valeurs de base
// codées en dur ne sont pas listées ici.
export default function GererReferencesDialog({
  optionsPersonnalisees,
  onAjouter,
  onRenommer,
  onSupprimer,
  compterUsage,
  onClose,
}: Props) {
  const [liste, setListe] = useState<ListeOption>("moteurs");
  const [nouvelleValeur, setNouvelleValeur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [editionId, setEditionId] = useState<number | null>(null);
  const [editionTexte, setEditionTexte] = useState("");

  const persoDeLaListe = useMemo(
    () =>
      optionsPersonnalisees
        .filter((o) => o.liste === liste)
        .sort((a, b) => comparerOption(a.valeur, b.valeur)),
    [optionsPersonnalisees, liste],
  );

  const dejaPresent = useMemo(
    () =>
      optionsListe(liste, optionsPersonnalisees).some((v) => v.toLowerCase() === nouvelleValeur.trim().toLowerCase()),
    [liste, nouvelleValeur, optionsPersonnalisees],
  );

  function changerListe(l: ListeOption) {
    setListe(l);
    setSelection(new Set());
    setEditionId(null);
  }

  function toggleSelection(id: number) {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function ajouter() {
    const v = nouvelleValeur.trim();
    if (!v || dejaPresent || enCours) return;
    setEnCours(true);
    try {
      await onAjouter(liste, v);
      setNouvelleValeur("");
    } finally {
      setEnCours(false);
    }
  }

  function commencerEdition(o: OptionListe) {
    setEditionId(o.id);
    setEditionTexte(o.valeur);
  }

  async function validerEdition(o: OptionListe) {
    const v = editionTexte.trim();
    setEditionId(null);
    if (v === "" || v === o.valeur) return;
    const usage = await compterUsage(o.id);
    if (usage > 0) {
      const ok = await confirmerAction(
        `${usage} ligne(s) utilisent « ${o.valeur} ». Le renommage en « ${v} » sera répercuté sur ces lignes. Continuer ?`,
        "Renommer la référence",
      );
      if (!ok) return;
    }
    setEnCours(true);
    try {
      await onRenommer(o.id, v);
    } finally {
      setEnCours(false);
    }
  }

  async function supprimerUne(o: OptionListe) {
    const usage = await compterUsage(o.id);
    const message =
      usage > 0
        ? `${usage} ligne(s) utilisent « ${o.valeur} » : elles garderont ce texte, mais la valeur ne sera plus proposée dans la liste. Supprimer quand même ?`
        : `Supprimer la référence « ${o.valeur} » ?`;
    if (!(await confirmerSuppression(message))) return;
    setEnCours(true);
    try {
      await onSupprimer(o.id);
      setSelection((prev) => {
        const next = new Set(prev);
        next.delete(o.id);
        return next;
      });
    } finally {
      setEnCours(false);
    }
  }

  async function supprimerSelection() {
    const ids = [...selection];
    if (ids.length === 0) return;
    const usages = await Promise.all(ids.map((id) => compterUsage(id)));
    const totalUtilisees = usages.filter((n) => n > 0).length;
    const message =
      totalUtilisees > 0
        ? `${ids.length} référence(s) sélectionnée(s), dont ${totalUtilisees} encore utilisée(s) par des lignes (qui garderont le texte). Supprimer ?`
        : `Supprimer les ${ids.length} référence(s) sélectionnée(s) ?`;
    if (!(await confirmerSuppression(message))) return;
    setEnCours(true);
    try {
      for (const id of ids) await onSupprimer(id);
      setSelection(new Set());
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-panel)",
          borderRadius: "var(--radius-lg)",
          width: 520,
          maxWidth: "94vw",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Gérer les références connues</h2>
        </div>

        <div style={{ padding: 20, overflow: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {LISTES.map((l) => (
              <button
                key={l}
                className={l === liste ? "btn btn-sm btn-primary" : "btn btn-sm"}
                onClick={() => changerListe(l)}
              >
                {LIBELLE_LISTE[l]}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
              Nouvelle valeur pour « {LIBELLE_LISTE[liste]} »
              <input
                value={nouvelleValeur}
                onChange={(e) => setNouvelleValeur(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    ajouter();
                  }
                }}
                placeholder="ex. 4 MOTEURS"
                style={champStyle}
              />
            </label>
            <button className="btn btn-primary" disabled={nouvelleValeur.trim() === "" || dejaPresent || enCours} onClick={ajouter}>
              Ajouter
            </button>
          </div>
          {dejaPresent && nouvelleValeur.trim() !== "" && (
            <span style={{ fontSize: 12, color: "var(--warn-text)", marginTop: -8 }}>Cette valeur existe déjà.</span>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
                Références « {LIBELLE_LISTE[liste]} » ({persoDeLaListe.length})
              </span>
              {selection.size > 0 && (
                <button className="btn btn-sm btn-danger" disabled={enCours} onClick={supprimerSelection}>
                  Supprimer la sélection ({selection.size})
                </button>
              )}
            </div>

            {persoDeLaListe.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "6px 0" }}>
                Aucune valeur pour cette colonne — ajoutez-en une ci-dessus.
              </p>
            ) : (
              persoDeLaListe.map((o) => (
                <div
                  key={o.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 4px",
                    borderBottom: "1px solid var(--border)",
                    fontSize: 13,
                  }}
                >
                  <input type="checkbox" checked={selection.has(o.id)} onChange={() => toggleSelection(o.id)} />
                  {editionId === o.id ? (
                    <>
                      <input
                        autoFocus
                        value={editionTexte}
                        onChange={(e) => setEditionTexte(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            validerEdition(o);
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            setEditionId(null);
                          }
                        }}
                        style={{ ...champStyle, flex: 1 }}
                      />
                      <button className="btn btn-sm btn-primary" disabled={enCours} onClick={() => validerEdition(o)}>
                        OK
                      </button>
                      <button className="btn btn-sm" onClick={() => setEditionId(null)}>
                        Annuler
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1 }}>{o.valeur}</span>
                      <button className="btn btn-sm" disabled={enCours} onClick={() => commencerEdition(o)}>
                        Renommer
                      </button>
                      <button className="btn btn-sm btn-danger" disabled={enCours} onClick={() => supprimerUne(o)}>
                        Supprimer
                      </button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

const champStyle: React.CSSProperties = {
  padding: "7px 8px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius)",
  background: "var(--bg-panel)",
  color: "var(--text)",
  font: "inherit",
};
