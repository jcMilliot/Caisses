import { useEffect, useState } from "react";
import { affairesApi } from "../data/affaires";
import { locksApi } from "../data/locks";
import { confirmerSuppression } from "../data/confirm";
import type { Affaire, SectionLock } from "../domain/types";

interface Props {
  onOpen: (id: number) => void;
}

export default function AffairesList({ onOpen }: Props) {
  const [affaires, setAffaires] = useState<Affaire[]>([]);
  const [verrous, setVerrous] = useState<Map<number, SectionLock>>(new Map());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [nom, setNom] = useState("");
  const [seuilDefaut, setSeuilDefaut] = useState(90);
  const [recherche, setRecherche] = useState("");

  async function reload() {
    setLoading(true);
    try {
      const [a, locks] = await Promise.all([affairesApi.list(), locksApi.list()]);
      setAffaires(a);
      const map = new Map<number, SectionLock>();
      for (const lock of locks) {
        if (lock.expire) continue;
        const match = lock.section_key.match(/^affaire:(\d+)$/);
        if (match) map.set(Number(match[1]), lock);
      }
      setVerrous(map);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim()) return;
    const affaire = await affairesApi.create(nom.trim(), seuilDefaut);
    setNom("");
    setSeuilDefaut(90);
    setCreating(false);
    await reload();
    onOpen(affaire.id);
  }

  async function handleDelete(id: number, nom: string) {
    if (!(await confirmerSuppression(`Supprimer l'affaire « ${nom} » et tous ses articles/caisses ?`))) return;
    await affairesApi.delete(id);
    await reload();
  }

  const affairesFiltrees = affaires.filter((a) => a.nom.toLowerCase().includes(recherche.trim().toLowerCase()));

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "48px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 4 }}>
            Caisses
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>Affaires</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating((v) => !v)}>
          + Nouvelle affaire
        </button>
      </div>

      {affaires.length > 0 && (
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher une affaire par nom…"
          style={{ ...inputStyle, marginBottom: 20 }}
        />
      )}

      {creating && (
        <form
          onSubmit={handleCreate}
          className="panel"
          style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-end",
            padding: 18,
            marginBottom: 24,
          }}
        >
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Nom de l'affaire</label>
            <input
              autoFocus
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Ex : Client XYZ — commande n°123"
              style={inputStyle}
            />
          </div>
          <div style={{ width: 160 }}>
            <label style={labelStyle}>Seuil de remplissage par défaut (%)</label>
            <input
              type="number"
              min={1}
              max={100}
              value={seuilDefaut}
              onChange={(e) => setSeuilDefaut(Number(e.target.value))}
              style={inputStyle}
            />
          </div>
          <button type="submit" className="btn btn-primary">
            Créer
          </button>
          <button type="button" className="btn" onClick={() => setCreating(false)}>
            Annuler
          </button>
        </form>
      )}

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Chargement…</p>
      ) : affaires.length === 0 ? (
        <div
          className="panel"
          style={{
            padding: "48px 24px",
            textAlign: "center",
            color: "var(--text-muted)",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
          <p style={{ margin: 0 }}>Aucune affaire pour l'instant.</p>
          <p style={{ margin: "4px 0 0" }}>Créez-en une pour commencer à organiser vos caisses.</p>
        </div>
      ) : affairesFiltrees.length === 0 ? (
        <div
          className="panel"
          style={{
            padding: "48px 24px",
            textAlign: "center",
            color: "var(--text-muted)",
          }}
        >
          <p style={{ margin: 0 }}>Aucune affaire ne correspond à « {recherche} ».</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {affairesFiltrees.map((a) => (
            <div
              key={a.id}
              onClick={() => onOpen(a.id)}
              className="panel affaire-row"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 18px",
                cursor: "pointer",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{a.nom}</span>
                  {verrous.has(a.id) && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        background: "var(--bg-panel-alt)",
                        border: "1px solid var(--border)",
                        borderRadius: 999,
                        padding: "1px 8px",
                      }}
                    >
                      verrouillée par {verrous.get(a.id)!.titulaire}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>
                  Créée le {new Date(a.date_creation).toLocaleDateString("fr-FR")} · seuil par défaut {a.seuil_defaut}%
                </div>
              </div>
              <button
                className="btn btn-sm btn-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(a.id, a.nom);
                }}
              >
                Supprimer
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "var(--text-muted)",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius)",
  background: "var(--bg-panel)",
  color: "var(--text)",
};
