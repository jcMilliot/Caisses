import { useEffect, useState } from "react";
import { cartonConsoApi } from "../data/cartonConso";
import GererCartonsConsoDialog from "../components/GererCartonsConsoDialog";
import { cm } from "../domain/cartonConso";
import type { CartonConso } from "../domain/types";

interface Props {
  trigramme: string;
  readOnly: boolean;
  // Incrémenté par Consommable après une prise de main : recharge les données.
  rechargement: number;
}

// Onglet « Cartons conso » de Consommable (2026-10-14) : liste de référence des cartons, sans
// affectation — serviront à la future simulation avec colis. Tableau en lecture seule, édition
// dans « Gérer les cartons ».
export default function CartonsConsoList({ trigramme, readOnly, rechargement }: Props) {
  const [cartons, setCartons] = useState<CartonConso[]>([]);
  const [loading, setLoading] = useState(true);
  const [gestionOuverte, setGestionOuverte] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      setCartons(await cartonConsoApi.list());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, [rechargement]);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 16 }}>
        <p className="page-subtitle" style={{ margin: 0 }}>
          Création, modification et suppression des cartons consommables.
        </p>
        <button className="btn btn-primary" onClick={() => setGestionOuverte(true)} disabled={readOnly}>
          Gérer les cartons
        </button>
      </div>

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Chargement…</p>
      ) : cartons.length === 0 ? (
        <div className="panel" style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
          <p style={{ margin: 0 }}>Aucun carton pour l'instant.</p>
        </div>
      ) : (
        <div className="panel" style={{ padding: 0, overflowX: "auto" }}>
          <table className="table-donnees">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Dimensions intérieures (cm)</th>
                <th>Dimensions extérieures (cm)</th>
                <th>Poids (kg)</th>
              </tr>
            </thead>
            <tbody>
              {cartons.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.nom}</td>
                  <td className="mono">
                    {cm(c.longueur_mm)} × {cm(c.largeur_mm)} × {cm(c.hauteur_mm)}
                  </td>
                  <td className="mono">
                    {cm(c.ext_longueur_mm)} × {cm(c.ext_largeur_mm)} × {cm(c.ext_hauteur_mm)}
                  </td>
                  <td className="mono">{c.poids_kg > 0 ? c.poids_kg : <span style={{ color: "var(--text-faint)" }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {gestionOuverte && !readOnly && (
        <GererCartonsConsoDialog
          cartons={cartons}
          onCreer={async (carton) => {
            await cartonConsoApi.create(carton, trigramme);
            await reload();
          }}
          onModifier={async (id, carton) => {
            await cartonConsoApi.update(id, carton, trigramme);
            await reload();
          }}
          onSupprimer={async (id) => {
            await cartonConsoApi.delete(id, trigramme);
            await reload();
          }}
          onClose={() => setGestionOuverte(false)}
        />
      )}
    </>
  );
}
