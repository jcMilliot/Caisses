import { useEffect, useRef } from "react";

// Champ d'édition inline d'une cellule de tableau (articles de Simulations, Gestion des caisses) :
// focus + sélection à l'ouverture, Entrée / sortie du champ = valider (une seule fois), Échap =
// annuler. Options : Tab → cellule suivante (`onTabNext`), collage de plusieurs cellules Excel
// intercepté (`onCollageMultiCellules`).
export default function EditableCellInput({
  type,
  defaultValue,
  align,
  onCommit,
  onCancel,
  onTabNext,
  onCollageMultiCellules,
}: {
  type: "text" | "number" | "date";
  defaultValue: string;
  align: "left" | "right" | "center";
  onCommit: (value: string) => void;
  onCancel: () => void;
  onTabNext?: (backward: boolean) => void;
  onCollageMultiCellules?: (texte: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const committed = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    // select() n'est pas supporté sur <input type="date"> dans certains navigateurs.
    if (ref.current?.type !== "date") ref.current?.select();
  }, []);

  function commitOnce() {
    if (committed.current) return;
    committed.current = true;
    onCommit(ref.current?.value ?? defaultValue);
  }

  return (
    <input
      ref={ref}
      type={type}
      defaultValue={defaultValue}
      onBlur={commitOnce}
      onPaste={(e) => {
        // Un collage qui contient une tabulation ou un retour à la ligne = plusieurs cellules
        // Excel → on ne le met pas dans ce seul champ, on ouvre l'import avec ce texte.
        const texte = e.clipboardData.getData("text");
        if (onCollageMultiCellules && /[\t\n\r]/.test(texte)) {
          e.preventDefault();
          committed.current = true;
          onCollageMultiCellules(texte);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitOnce();
        } else if (e.key === "Escape") {
          e.preventDefault();
          committed.current = true;
          onCancel();
        } else if (e.key === "Tab" && onTabNext) {
          e.preventDefault();
          commitOnce();
          onTabNext(e.shiftKey);
        }
      }}
      style={{
        width: "100%",
        textAlign: align,
        padding: "3px 6px",
        border: "1px solid var(--accent)",
        borderRadius: 4,
        font: "inherit",
      }}
    />
  );
}
