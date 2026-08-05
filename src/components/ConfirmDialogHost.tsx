import { useEffect, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { setConfirmListener, type ConfirmRequest } from "../data/confirm";

export default function ConfirmDialogHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    setConfirmListener(setRequest);
    return () => setConfirmListener(null);
  }, []);

  if (!request) return null;

  function repondre(value: boolean) {
    request!.resolve(value);
    setRequest(null);
  }

  return (
    <ConfirmDialog
      message={request.message}
      titre={request.titre}
      danger={request.danger}
      onConfirm={() => repondre(true)}
      onCancel={() => repondre(false)}
    />
  );
}
