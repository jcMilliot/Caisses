// Découpe un texte collé depuis Excel en tableau de lignes × colonnes (TSV).
//
// Excel encadre de guillemets doubles toute cellule contenant un retour à la ligne (Alt+Entrée
// dans la cellule), une tabulation ou un guillemet, et double les guillemets internes ("" pour
// un " littéral). Mais certaines sources (copie hors plage de cellules, autres tableurs, contenu
// déjà transformé) produisent des guillemets **nus** au milieu d'une valeur (ex. `G1/8" m`). Pour
// rester robuste dans les deux cas, on ne considère un guillemet comme ouvrant un champ "quoté"
// que s'il est en **début de champ** (tout au début, après une tabulation ou après un retour à
// la ligne). Un guillemet ailleurs est un caractère littéral.
//
// Lignes et colonnes sont découpées en **une seule passe** : un découpage en lignes puis en
// colonnes ne voyait pas qu'un champ commençait après une tabulation, et coupait en deux la
// ligne d'une cellule multi-lignes placée ailleurs qu'en 1re colonne (cf. Bugs.md).
export function decouperTableauTsv(texte: string): string[][] {
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let courant = "";
  let dansGuillemets = false;
  let debutDeChamp = true;

  function finirChamp() {
    ligne.push(courant);
    courant = "";
    debutDeChamp = true;
  }

  function finirLigne() {
    finirChamp();
    // Ligne vide (retour à la ligne final, lignes blanches) : ignorée.
    if (!(ligne.length === 1 && ligne[0] === "")) lignes.push(ligne);
    ligne = [];
  }

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

    if (!dansGuillemets) {
      if (c === "\t") {
        finirChamp();
        continue;
      }
      if (c === "\r" || c === "\n") {
        if (c === "\r" && texte[i + 1] === "\n") i++; // \r\n = un seul retour à la ligne
        finirLigne();
        continue;
      }
    }

    courant += c;
    debutDeChamp = false;
  }
  finirLigne();
  return lignes;
}
