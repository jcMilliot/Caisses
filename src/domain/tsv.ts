// Découpe un texte collé depuis Excel en lignes logiques, en respectant les guillemets TSV :
// Excel encadre de guillemets doubles toute cellule contenant un retour à la ligne, une
// tabulation ou un guillemet, et double les guillemets internes ("" pour un " littéral). Un
// simple split sur /\r?\n/ casserait une ligne en deux dès qu'une cellule contient un retour à
// la ligne interne (ex. une désignation multi-lignes).
export function decouperLignesTsv(texte: string): string[] {
  const lignes: string[] = [];
  let ligneCourante = "";
  let dansGuillemets = false;

  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];

    if (c === '"') {
      if (dansGuillemets && texte[i + 1] === '"') {
        ligneCourante += '""';
        i++;
      } else {
        dansGuillemets = !dansGuillemets;
        ligneCourante += c;
      }
      continue;
    }

    if (!dansGuillemets && (c === "\n" || c === "\r")) {
      if (c === "\r" && texte[i + 1] === "\n") i++;
      lignes.push(ligneCourante);
      ligneCourante = "";
      continue;
    }

    ligneCourante += c;
  }
  if (ligneCourante.length > 0) lignes.push(ligneCourante);

  return lignes.filter((l) => l.length > 0);
}

// Découpe une ligne logique (déjà isolée par decouperLignesTsv) en colonnes, en retirant
// l'encadrement de guillemets d'une cellule et en dépliant les "" en ".
export function decouperColonnesTsv(ligne: string): string[] {
  const colonnes: string[] = [];
  let colonneCourante = "";
  let dansGuillemets = false;

  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];

    if (c === '"') {
      if (dansGuillemets && ligne[i + 1] === '"') {
        colonneCourante += '"';
        i++;
      } else {
        dansGuillemets = !dansGuillemets;
      }
      continue;
    }

    if (!dansGuillemets && c === "\t") {
      colonnes.push(colonneCourante);
      colonneCourante = "";
      continue;
    }

    colonneCourante += c;
  }
  colonnes.push(colonneCourante);

  return colonnes;
}
