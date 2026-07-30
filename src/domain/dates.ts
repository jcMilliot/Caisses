// Les dates sont stockées en base au format ISO (AAAA-MM-JJ, compatible <input type="date">)
// mais affichées à l'utilisateur en JJ/MM/AAAA. Le collage Excel arrive en JJ/MM/AA (année sur
// 2 chiffres, toujours interprétée comme 20XX dans ce contexte métier).

export function dateExcelVersIso(s: string): string {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return "";
  const [, jj, mm, aa] = m;
  const annee = aa.length === 2 ? `20${aa}` : aa;
  return `${annee}-${mm.padStart(2, "0")}-${jj.padStart(2, "0")}`;
}

export function dateIsoVersAffichage(iso: string): string {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const [, aaaa, mm, jj] = m;
  return `${jj}/${mm}/${aaaa}`;
}
