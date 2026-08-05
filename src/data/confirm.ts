export interface ConfirmRequest {
  message: string;
  titre: string;
  danger?: boolean;
  resolve: (value: boolean) => void;
}

type Listener = (request: ConfirmRequest | null) => void;

let listener: Listener | null = null;

export function setConfirmListener(fn: Listener | null) {
  listener = fn;
}

function demander(message: string, titre: string, danger?: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    if (!listener) {
      resolve(window.confirm(message));
      return;
    }
    listener({ message, titre, danger, resolve });
  });
}

export function confirmerSuppression(message: string): Promise<boolean> {
  return demander(message, "Confirmer la suppression", true);
}

export function confirmerAction(message: string, titre = "Confirmer"): Promise<boolean> {
  return demander(message, titre);
}
