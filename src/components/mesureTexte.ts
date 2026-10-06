// Mesure de la largeur d'un texte à l'écran (canvas hors document), avec la police de l'app.
// Sert à calculer la largeur minimale des colonnes redimensionnables et à adapter la taille de
// la pastille de taux de remplissage à la largeur de sa colonne.

let canvas: HTMLCanvasElement | null = null;

export function largeurTexte(texte: string, taillePx: number, graisse = 400): number {
  canvas ??= document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return texte.length * taillePx * 0.62;
  ctx.font = `${graisse} ${taillePx}px ${getComputedStyle(document.body).fontFamily}`;
  return ctx.measureText(texte).width;
}

/** Largeur du mot le plus long d'un texte (là où un retour à la ligne aux espaces ne suffit plus). */
export function largeurPlusLongMot(texte: string, taillePx: number, graisse = 400): number {
  const mots = texte.split(/\s+/).filter(Boolean);
  return Math.max(0, ...mots.map((m) => largeurTexte(m, taillePx, graisse)));
}
