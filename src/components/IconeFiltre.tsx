// Entonnoir des en-têtes filtrables (DemandesTable, ArticlesTable) — ~ hauteur du texte
// d'en-tête : contour au repos, plein quand un filtre est actif sur la colonne (le bouton passe
// alors sur fond coloré, cf. `.btn-filtre-colonne` dans index.css).
export default function IconeFiltre({ plein }: { plein: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" style={{ display: "block" }}>
      <path
        d="M1.5 2.5h13l-5 6v5l-3 1.5v-6.5z"
        fill={plein ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
