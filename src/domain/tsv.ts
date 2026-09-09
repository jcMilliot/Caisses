// Découpe un texte collé depuis Excel en lignes et colonnes TSV.
//
// Excel encadre de guillemets doubles toute cellule contenant un retour à la ligne, une
// tabulation ou un guillemet, et double les guillemets internes ("" pour un " littéral). Mais
// certaines sources (copie hors plage de cellules, autres tableurs, contenu déjà transformé)
// produisent des guillemets **nus** au milieu d'une valeur (ex. `G1/8" m`). Pour rester robuste
// dans les deux cas, on ne considère un guillemet comme ouvrant un champ "quoté" que s'il est
// en **début de champ** (juste après un séparateur, ou tout au début). Un guillemet ailleurs
// est un caractère littéral.
//
// Parcours commun : `decouper(texte, separateurs)` renvoie les segments découpés sur les
// caractères de `separateurs` qui sont hors d'un champ quoté. decouperLignesTsv sépare sur les
// retours à la ligne, decouperColonnesTsv sur les tabulations.

function decouper(texte: string, estSeparateur: (c: string) => boolean): string[] {
  const segments: string[] = [];
  let courant = "";
  let dansGuillemets = false;
  let debutDeChamp = true;

  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];

    if (c === '"') {
      if (dansGuillemets) {
        if (texte[i + 1] === '"') {
          courant += '"'; // "" = un " littéral
          i++;
        } else {
          dansGuillemets = false; // guillemet fermant
        }
      } else if (debutDeChamp) {
        dansGuillemets = true; // guillemet ouvrant
        debutDeChamp = false;
      } else {
        courant += '"'; // guillemet nu au milieu d'un champ → littéral
      }
      continue;
    }

    // Gère \r\n comme un seul séparateur quand \n est un séparateur.
    if (!dansGuillemets && c === "\r" && texte[i + 1] === "\n" && estSeparateur("\n")) {
      segments.push(courant);
      courant = "";
      debutDeChamp = true;
      i++;
      continue;
    }

    if (!dansGuillemets && estSeparateur(c)) {
      segments.push(courant);
      courant = "";
      debutDeChamp = true;
      continue;
    }

    courant += c;
    debutDeChamp = false;
  }
  segments.push(courant);
  return segments;
}

export function decouperLignesTsv(texte: string): string[] {
  return decouper(texte, (c) => c === "\n" || c === "\r").filter((l) => l.length > 0);
}

export function decouperColonnesTsv(ligne: string): string[] {
  return decouper(ligne, (c) => c === "\t");
}
