import { confirm } from "@tauri-apps/plugin-dialog";

export function confirmerSuppression(message: string): Promise<boolean> {
  return confirm(message, { title: "Confirmer la suppression", kind: "warning" });
}

export function confirmerAction(message: string, titre = "Confirmer"): Promise<boolean> {
  return confirm(message, { title: titre, kind: "warning" });
}
