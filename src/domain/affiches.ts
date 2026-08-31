import type { Demande, DemandeCaisse } from "./types";
import { estCaisse4B, estCaisse4C, necessiteNimp15, estDemandeValidee, estDemandeCaisseValidee } from "./demandeOptions";
import { dateIsoVersAffichage } from "./dates";
import { PALETTE_CAISSES } from "./palette";

export interface AfficheCaisse {
  cle: string;
  demandeId: number;
  demandeCaisseId: number | null;
  affaire: string;
  typeEnvoiCaisse: string;
  typeOuverture: string;
  longueurMm: number;
  largeurMm: number;
  hauteurMm: number;
  quantite: number;
  dateDemandeeS2c: string;
  contrePlaque: boolean;
}

export type CategorieEnvoi = "standard" | "4b" | "4c";

export function categorieEnvoi(typeEnvoiCaisse: string): CategorieEnvoi {
  if (estCaisse4C(typeEnvoiCaisse)) return "4c";
  if (estCaisse4B(typeEnvoiCaisse)) return "4b";
  return "standard";
}

export function libelleCategorie(typeEnvoiCaisse: string): string {
  switch (categorieEnvoi(typeEnvoiCaisse)) {
    case "4c":
      return "4C";
    case "4b":
      return "4B";
    default:
      return "Standard";
  }
}

export function titreAffiche(typeEnvoiCaisse: string): string {
  const base = "Demande d'Achat Caisse en bois";
  switch (categorieEnvoi(typeEnvoiCaisse)) {
    case "4b":
      return `${base} - NIMP15`;
    case "4c":
      return `${base} - NIMP15 + HOUSSE`;
    default:
      return base;
  }
}

export function couleurAffiche(typeEnvoiCaisse: string): string {
  switch (categorieEnvoi(typeEnvoiCaisse)) {
    case "4c":
      return PALETTE_CAISSES[1];
    case "4b":
      return PALETTE_CAISSES[4];
    default:
      return PALETTE_CAISSES[0];
  }
}

// Une demande ACHSTOCK (achat de caisses déjà tenues en stock, référence `AR_CAISS_XXXXX` dans
// le champ `stock`) n'est pas une caisse en bois à fabriquer sur mesure — elle n'a pas de
// dimensions pertinentes et ne doit jamais générer de carte d'affiche visuelle. Elle n'apparaît
// que sous forme de bloc texte au moment de la copie groupée (cf. construireBlocAchstock).
export function estDemandeAchstock(demande: Demande): boolean {
  return demande.affaire.trim().toUpperCase().includes("ACHSTOCK");
}

export function construireAffiches(demandes: Demande[], demandeCaisses: DemandeCaisse[]): AfficheCaisse[] {
  const affiches: AfficheCaisse[] = [];

  for (const d of demandes) {
    if (!d.ok_pour_passer_cde || estDemandeValidee(d) || estDemandeAchstock(d)) continue;

    affiches.push({
      cle: `demande:${d.id}`,
      demandeId: d.id,
      demandeCaisseId: null,
      affaire: d.affaire,
      typeEnvoiCaisse: d.type_envoi_caisse,
      typeOuverture: d.type_ouverture,
      longueurMm: d.longueur_mm,
      largeurMm: d.largeur_mm,
      hauteurMm: d.hauteur_mm,
      quantite: d.quantite,
      dateDemandeeS2c: d.date_demandee_s2c,
      contrePlaque: d.contre_plaque,
    });

    for (const sc of demandeCaisses) {
      if (sc.demande_id !== d.id) continue;
      if (estDemandeCaisseValidee(sc, d)) continue;
      affiches.push({
        cle: `demande_caisse:${sc.id}`,
        demandeId: d.id,
        demandeCaisseId: sc.id,
        affaire: d.affaire,
        typeEnvoiCaisse: sc.type_envoi_caisse,
        typeOuverture: sc.type_ouverture,
        longueurMm: sc.longueur_mm,
        largeurMm: sc.largeur_mm,
        hauteurMm: sc.hauteur_mm,
        quantite: sc.quantite,
        dateDemandeeS2c: sc.date_demandee_s2c,
        contrePlaque: sc.contre_plaque,
      });
    }
  }

  return affiches;
}

function formaterMetres(mm: number): string {
  return (mm / 1000).toFixed(2);
}

// Teinte de bordure/accent un ton plus soutenu que le pastel de fond, par catégorie.
function accentAffiche(typeEnvoiCaisse: string): string {
  switch (categorieEnvoi(typeEnvoiCaisse)) {
    case "4c":
      return "#c9527a";
    case "4b":
      return "#7c5cbf";
    default:
      return "#3b7dd8";
  }
}

function ligneChamp(label: string, valeur: string, pleineLargeur = false): string {
  return `
    <td style="padding:7px 10px;vertical-align:top;${pleineLargeur ? "" : "width:50%;"}">
      <div style="font-size:8.5px;font-weight:700;letter-spacing:0.05em;color:#64748b;text-transform:uppercase;margin-bottom:2px;">${label}</div>
      <div style="font-size:11px;font-weight:600;color:#0f172a;">${valeur}</div>
    </td>`;
}

export function rendreAfficheHtml(affiche: AfficheCaisse, demandeur: string, dateDemande: string, logoDataUrl?: string): string {
  const couleur = couleurAffiche(affiche.typeEnvoiCaisse);
  const accent = accentAffiche(affiche.typeEnvoiCaisse);
  const titre = titreAffiche(affiche.typeEnvoiCaisse);
  const nimp15 = necessiteNimp15(affiche.typeEnvoiCaisse);
  const logoImg = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="" height="28" style="height:28px;width:auto;display:block;" />`
    : "";

  return `
<table role="presentation" style="border-collapse:separate;border-spacing:0;font-family:Calibri,Segoe UI,Arial,sans-serif;color:#0f172a;width:100%;max-width:440px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
  <tr>
    <td style="padding:0;">
      <table role="presentation" style="border-collapse:collapse;width:100%;background:${couleur};border-bottom:2px solid ${accent};">
        <tr>
          <td style="padding:9px 12px;width:44px;">${logoImg}</td>
          <td style="padding:9px 6px;text-align:center;">
            <div style="font-size:12.5px;font-weight:800;letter-spacing:-0.01em;color:#0f172a;">${titre}</div>
          </td>
          <td style="padding:9px 12px;width:44px;text-align:right;">${logoImg}</td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:0;background:#ffffff;">
      <table role="presentation" style="border-collapse:collapse;width:100%;">
        <tr style="border-bottom:1px solid #eef2f6;">
          ${ligneChamp("Date de la demande", dateIsoVersAffichage(dateDemande) || dateDemande)}
          ${ligneChamp("Par", demandeur || "—")}
        </tr>
        <tr style="border-bottom:1px solid #eef2f6;">
          ${ligneChamp("Affaire", affiche.affaire || "—", true)}
        </tr>
        <tr style="border-bottom:1px solid #eef2f6;">
          ${ligneChamp(
            "Dimensions intérieures (L × l × H)",
            `${formaterMetres(affiche.longueurMm)} m &nbsp;×&nbsp; ${formaterMetres(affiche.largeurMm)} m &nbsp;×&nbsp; ${formaterMetres(affiche.hauteurMm)} m`,
            true,
          )}
        </tr>
        <tr style="border-bottom:1px solid #eef2f6;">
          ${ligneChamp("Qté", String(affiche.quantite))}
          ${ligneChamp("Manipulable au transpalette", "Oui")}
        </tr>
        <tr style="border-bottom:1px solid #eef2f6;">
          ${ligneChamp("Délai", dateIsoVersAffichage(affiche.dateDemandeeS2c) || affiche.dateDemandeeS2c || "—")}
          ${ligneChamp("Position de la fermeture", affiche.typeOuverture || "—")}
        </tr>
        <tr${nimp15 ? ' style="border-bottom:1px solid #eef2f6;"' : ""}>
          ${ligneChamp("Observation — Contre-plaqué", affiche.contrePlaque ? "Oui" : "Non", !nimp15)}
          ${nimp15 ? ligneChamp("NIMP15", "Oui") : ""}
        </tr>
      </table>
    </td>
  </tr>
  ${
    nimp15
      ? `<tr>
    <td style="padding:7px 12px;background:#fef2f2;border-top:1px solid #fecaca;">
      <div style="font-size:10.5px;font-weight:700;color:#b91c1c;text-align:center;">
        Joindre un certificat lors de la livraison
      </div>
    </td>
  </tr>`
      : ""
  }
</table>`.trim();
}

// Texte d'introduction générique inséré une seule fois en tête du mail, avant les affiches (qui
// peuvent être de plusieurs types en cas de copie groupée). Si la sélection ne contient que des
// lignes ACHSTOCK (caisses déjà en stock, rien à fabriquer), le texte parle de commande plutôt
// que de fabrication.
export function texteIntroductionMail(quantiteCaisses: number, seulementAchstock = false): string {
  const pluriel = quantiteCaisses > 1;
  const verbe = seulementAchstock
    ? `de bien vouloir passer commande ${pluriel ? "des caisses suivantes" : "de la caisse suivante"}`
    : `de bien vouloir prévoir la fabrication ${pluriel ? "des caisses suivantes" : "de la caisse suivante"}`;
  return [`Bonjour,`, ``, `Merci ${verbe} :`].join("\n");
}

// Mention de prestation à ajouter uniquement pour les caisses 4C — positionnée après les
// affiches des autres types s'il y en a, sinon juste après l'introduction (jamais répétée par
// caisse : une seule fois pour l'ensemble du groupe 4C copié).
export const MENTION_SOUDURE_4C = "Avec prestation de soudure et fermeture de la caisse.";

// Une demande ACHSTOCK n'a pas de carte d'affiche (cf. estDemandeAchstock) : elle n'apparaît
// dans le mail copié que sous cette forme texte, un bloc par référence AR_CAISS_XXXXX
// (colonne `stock`), réutilisant les mêmes critères de sélection que les affiches normales
// (case "OK pour passer cde" cochée, demande non déjà validée).
export function demandesAchstockAEnvoyer(demandes: Demande[]): Demande[] {
  return demandes.filter((d) => d.ok_pour_passer_cde && !estDemandeValidee(d) && estDemandeAchstock(d));
}

export function rendreBlocAchstock(demande: Demande): string {
  return [
    demande.stock.trim() || "—",
    `Qté : ${demande.quantite}`,
    `Affaire : ${demande.affaire}`,
    `Délais : ${dateIsoVersAffichage(demande.date_demandee_s2c) || demande.date_demandee_s2c || "—"}`,
  ].join("\n");
}

export function rendreAfficheTexte(affiche: AfficheCaisse, demandeur: string, dateDemande: string): string {
  const nimp15 = necessiteNimp15(affiche.typeEnvoiCaisse);
  const lignes = [
    titreAffiche(affiche.typeEnvoiCaisse),
    `DATE DE LA DEMANDE : ${dateIsoVersAffichage(dateDemande) || dateDemande}`,
    `PAR : ${demandeur}`,
    `AFFAIRE : ${affiche.affaire}`,
    `DIMENSIONS INTERIEURES : L : ${formaterMetres(affiche.longueurMm)} m  l : ${formaterMetres(affiche.largeurMm)} m  H : ${formaterMetres(affiche.hauteurMm)} m`,
    `Qté : ${affiche.quantite}`,
    `MANIPULABLE AU TRANSPALETTE : Oui`,
    `DELAI : ${dateIsoVersAffichage(affiche.dateDemandeeS2c) || affiche.dateDemandeeS2c}`,
    `POSITION DE LA FERMETURE : ${affiche.typeOuverture}`,
    `OBSERVATION - CONTRE-PLAQUÉ : ${affiche.contrePlaque ? "Oui" : "Non"}`,
    ...(nimp15 ? [`NIMP15 : Oui`, `JOINDRE UN CERTIFICAT LORS DE LA LIVRAISON`] : []),
  ];
  return lignes.join("\n");
}
