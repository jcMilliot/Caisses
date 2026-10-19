import { useState } from "react";
import { useSectionLock } from "../hooks/useSectionLock";
import LockBanner from "../components/LockBanner";
import CaissesStockList from "./CaissesStockList";
import CartonsConsoList from "./CartonsConsoList";
import { CaissesPesees } from "../components/PoidsCaisses";

interface Props {
  trigramme: string;
}

type Onglet = "caisses" | "cartons" | "poids";

const ONGLETS: { id: Onglet; label: string }[] = [
  { id: "caisses", label: "Caisses en stock" },
  { id: "cartons", label: "Cartons conso" },
  { id: "poids", label: "Poids" },
];

const CLE_ONGLET = "caisses:onglet:conso";

function ongletMemorise(): Onglet {
  try {
    const o = localStorage.getItem(CLE_ONGLET);
    return o === "cartons" || o === "poids" ? o : "caisses";
  } catch {
    return "caisses";
  }
}

// Section « Consommable » (ex-« Caisses en stock », puis « Consommable » ; renommée le
// 2026-10-16) : onglets Caisses en stock, Cartons conso et Poids (caisses pesées, déplacées
// d'Admin › Caisses le 2026-10-16). Un seul verrou (« stock ») pour toute la page.
export default function ConsoStockList({ trigramme }: Props) {
  const lock = useSectionLock("stock", trigramme);
  const readOnly = lock.status !== "held";
  const [onglet, setOnglet] = useState<Onglet>(ongletMemorise);
  const [rechargement, setRechargement] = useState(0);

  function choisirOnglet(o: Onglet) {
    setOnglet(o);
    try {
      localStorage.setItem(CLE_ONGLET, o);
    } catch {
      // préférence non mémorisée, sans conséquence
    }
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px 48px" }}>
      <div className="page-header">
        <h1 className="page-title">Consommable</h1>
      </div>

      <div className="tabs">
        {ONGLETS.map((o) => (
          <button key={o.id} className={onglet === o.id ? "tab actif" : "tab"} onClick={() => choisirOnglet(o.id)}>
            {o.label}
          </button>
        ))}
      </div>

      {(readOnly || lock.incomingRequest) && (
        <LockBanner
          lectureSeule={lock.lectureSeule}
          holderTrigramme={lock.holderTrigramme}
          incomingRequest={lock.incomingRequest}
          outgoingRequestStatus={lock.outgoingRequestStatus}
          onRequestPen={lock.requestPen}
          onApprove={lock.approveRequest}
          onDeny={lock.denyRequest}
          verrouLibre={lock.verrouLibre}
          onPrendreLaMain={async () => {
            if (await lock.prendreLaMain()) setRechargement((n) => n + 1);
          }}
        />
      )}

      {onglet === "caisses" ? (
        <CaissesStockList trigramme={trigramme} readOnly={readOnly} rechargement={rechargement} />
      ) : onglet === "cartons" ? (
        <CartonsConsoList trigramme={trigramme} readOnly={readOnly} rechargement={rechargement} />
      ) : (
        <CaissesPesees trigramme={trigramme} readOnly={readOnly} rechargement={rechargement} />
      )}
    </div>
  );
}
