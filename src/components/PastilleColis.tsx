import { estColisChiffre } from "../domain/colisage";

// Pastille d'un colis de l'intranet : chiffre = colis (violet pastel), lettre = caisse (vert
// pastel), texte 15 px gras — retour du 2026-10-14.
export default function PastilleColis({ tag }: { tag: string }) {
  const chiffre = estColisChiffre(tag);
  return (
    <span
      style={{
        display: "inline-block",
        minWidth: 22,
        padding: "1px 7px",
        borderRadius: 999,
        fontSize: 15,
        fontWeight: 700,
        lineHeight: 1.3,
        textAlign: "center",
        background: chiffre ? "var(--violet-bg)" : "var(--ok-bg)",
        color: chiffre ? "var(--violet-text)" : "var(--ok-text)",
        border: `1px solid ${chiffre ? "var(--violet-border)" : "var(--ok-border)"}`,
      }}
    >
      {tag}
    </span>
  );
}
