import { Fragment } from "react";

// Texte de documentation → éléments React : **gras**, et `code` (documentation technique).
export function rendreTexte(texte: string): React.ReactNode {
  return texte.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((morceau, i) => {
    if (morceau.startsWith("**") && morceau.endsWith("**") && morceau.length > 4) return <strong key={i}>{morceau.slice(2, -2)}</strong>;
    if (morceau.startsWith("`") && morceau.endsWith("`") && morceau.length > 2)
      return (
        <code key={i} style={{ fontSize: "0.92em", background: "var(--bg-panel-alt)", border: "1px solid var(--border)", borderRadius: 4, padding: "0 4px" }}>
          {morceau.slice(1, -1)}
        </code>
      );
    return <Fragment key={i}>{morceau}</Fragment>;
  });
}
