// Petites icônes au trait de la barre de navigation (refonte visuelle 2026-10-02). SVG en ligne,
// couleur du texte (currentColor) — aucune dépendance.

export type NomIconeNav = "accueil" | "documentation" | "admin";

export default function IconeNav({ nom, taille = 16 }: { nom: NomIconeNav; taille?: number }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {nom === "accueil" && (
        <>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
        </>
      )}
      {nom === "documentation" && (
        <>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
          <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
          <path d="M8 7.5h8M8 11h6" />
        </>
      )}
      {nom === "admin" && (
        <>
          <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.3 7.5 9.5 4.4-1.2 7.5-4.9 7.5-9.5V6z" />
          <path d="m9 12 2 2 4-4" />
        </>
      )}
    </svg>
  );
}
