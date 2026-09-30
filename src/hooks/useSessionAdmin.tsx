import { useState } from "react";
import { adminApi } from "../data/admin";
import MotDePasseAdminDialog from "../components/MotDePasseAdminDialog";

// Actions réservées aux administrateurs hors de la page Admin (lignes non collées, édition de la
// documentation…) : la garde réelle est la session admin côté Rust (`require_admin`). Si elle
// n'est pas encore ouverte sur ce poste, on demande le mot de passe avant de continuer.
export function useSessionAdmin(trigramme: string) {
  const [enAttente, setEnAttente] = useState<((ok: boolean) => void) | null>(null);

  async function assurerSession(): Promise<boolean> {
    if (await adminApi.sessionActive()) return true;
    return new Promise<boolean>((resolve) => setEnAttente(() => resolve));
  }

  function terminer(ok: boolean) {
    enAttente?.(ok);
    setEnAttente(null);
  }

  const dialogue = enAttente ? (
    <MotDePasseAdminDialog trigramme={trigramme} onOk={() => terminer(true)} onAnnuler={() => terminer(false)} />
  ) : null;

  return { assurerSession, dialogue };
}
