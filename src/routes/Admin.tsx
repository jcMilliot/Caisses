import { useCallback, useEffect, useState } from "react";
import Journal from "./Journal";
import AdminFeuilleDeRoute from "./AdminFeuilleDeRoute";
import AdminCaisses from "./AdminCaisses";
import { adminApi, ADMIN_PERMANENT, LIBELLE_ROLE, type Role, type Utilisateur } from "../data/admin";
import { affairesApi } from "../data/affaires";
import { backupApi, type BackupConfig, type FichierSauvegarde, type FrequenceBackup } from "../data/backup";
import { confirmerAction, confirmerActionRisquee } from "../data/confirm";
import { formaterHorodatage } from "../domain/dates";
import CodeSecoursDialog from "../components/CodeSecoursDialog";
import MotDePasseOublie from "../components/MotDePasseOublie";
import IconeNav from "../components/IconeNav";

interface Props {
  trigramme: string;
}

type Onglet = "utilisateurs" | "parametres" | "caisses" | "sauvegarde" | "journal" | "feuille";

const ONGLETS: { id: Onglet; label: string }[] = [
  { id: "utilisateurs", label: "Utilisateurs" },
  { id: "parametres", label: "Paramètres" },
  { id: "caisses", label: "Caisses" },
  { id: "sauvegarde", label: "Sauvegarde" },
  { id: "journal", label: "Journal" },
  { id: "feuille", label: "Feuille de route" },
];

// Page Admin : réservée au rôle Administrateur, mot de passe personnel redemandé une fois par lancement de l'app
// (sauf s'il vient d'être saisi au choix du trigramme). La garde réelle est côté Rust
// (`require_admin` sur chaque commande admin).
export default function Admin({ trigramme }: Props) {
  const [session, setSession] = useState<boolean | null>(null);
  const [onglet, setOnglet] = useState<Onglet>("utilisateurs");

  useEffect(() => {
    adminApi.sessionActive().then(setSession);
  }, []);

  async function verrouiller() {
    await adminApi.lock();
    setSession(false);
  }

  if (session === null) return null;
  if (!session) return <DeverrouillageAdmin trigramme={trigramme} onOk={() => setSession(true)} />;

  return (
    // Refonte visuelle 2026-10-02 : page centrée comme les autres écrans, en-tête homogène,
    // onglets soulignés.
    <div style={{ padding: "28px 24px 48px", maxWidth: 1200, margin: "0 auto" }}>
      <div className="page-header" style={{ marginBottom: 14 }}>
        <div>
          <h1 className="page-title">Administration</h1>
          <p className="page-subtitle">Connecté en tant que {trigramme}.</p>
        </div>
        <div className="page-actions">
          <CodeSecours trigramme={trigramme} />
          <ChangerMotDePasse />
          <button className="btn btn-sm" onClick={verrouiller} title="Refermer la page Admin sur ce poste">
            🔒 Verrouiller
          </button>
        </div>
      </div>

      <div className="tabs">
        {ONGLETS.map((o) => (
          <button key={o.id} className={onglet === o.id ? "tab actif" : "tab"} onClick={() => setOnglet(o.id)}>
            {o.label}
          </button>
        ))}
      </div>

      {onglet === "utilisateurs" && <UtilisateursOnglet trigramme={trigramme} />}
      {onglet === "parametres" && <ParametresOnglet />}
      {onglet === "caisses" && <AdminCaisses trigramme={trigramme} />}
      {onglet === "sauvegarde" && <SauvegardeOnglet trigramme={trigramme} />}
      {onglet === "journal" && <Journal />}
      {onglet === "feuille" && <AdminFeuilleDeRoute />}
    </div>
  );
}

function DeverrouillageAdmin({ trigramme, onOk }: { trigramme: string; onOk: () => void }) {
  const [defini, setDefini] = useState<boolean | null>(null);
  const [oubli, setOubli] = useState(false);
  const [codeAffiche, setCodeAffiche] = useState<string | null>(null);
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminApi.compteStatus(trigramme).then((s) => setDefini(s.mot_de_passe_defini));
  }, [trigramme]);

  const creation = defini === false;
  const peutValider = motDePasse.length > 0 && (!creation || confirmation.length > 0);

  async function valider() {
    if (!peutValider) return;
    if (creation && motDePasse !== confirmation) {
      setErreur("Les deux mots de passe ne correspondent pas");
      return;
    }
    setBusy(true);
    setErreur(null);
    try {
      const code = await adminApi.unlock(trigramme, motDePasse);
      if (code) setCodeAffiche(code);
      else onOk();
    } catch (e) {
      setErreur(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (defini === null) return null;
  if (codeAffiche) return <CodeSecoursDialog code={codeAffiche} onFermer={onOk} />;
  if (oubli) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "80px 24px" }}>
        <div className="panel" style={{ width: 420, maxWidth: "92vw", padding: 32, boxShadow: "var(--shadow-md)" }}>
          <h1 style={{ margin: "0 0 10px", fontSize: 19, fontWeight: 700 }}>Mot de passe oublié — {trigramme}</h1>
          <MotDePasseOublie
            trigramme={trigramme}
            onReinitialise={(nouveau, code) => {
              setOubli(false);
              adminApi
                .unlock(trigramme, nouveau)
                .then(() => setCodeAffiche(code))
                .catch((e) => setErreur(String(e)));
            }}
            onAnnuler={() => setOubli(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "80px 24px" }}>
      <div className="panel" style={{ width: 420, maxWidth: "92vw", padding: 32, boxShadow: "var(--shadow-md)" }}>
        <div style={iconeCadenasStyle}>
          <IconeNav nom="admin" taille={22} />
        </div>
        <h1 style={{ margin: "0 0 6px", fontSize: 19, fontWeight: 700 }}>
          {creation ? "Créer le mot de passe administrateur" : "Administration"}
        </h1>
        <p style={{ margin: "0 0 18px", fontSize: 13.5, color: "var(--text-muted)" }}>
          {creation
            ? "Aucun mot de passe n'est encore défini pour ce compte. Choisissez-en un (6 caractères minimum)."
            : `Saisissez le mot de passe de ${trigramme}.`}
        </p>
        <input
          className="input"
          type="password"
          autoFocus
          placeholder="Mot de passe"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && valider()}
          style={{ width: "100%", marginBottom: 10 }}
        />
        {creation && (
          <input
            className="input"
            type="password"
            placeholder="Confirmer le mot de passe"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && valider()}
            style={{ width: "100%", marginBottom: 10 }}
          />
        )}
        {erreur && <p style={{ margin: "4px 0 12px", fontSize: 13, color: "var(--danger-text)" }}>{erreur}</p>}
        {!creation && (
          <button
            type="button"
            onClick={() => setOubli(true)}
            style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", fontSize: 12.5, cursor: "pointer" }}
          >
            Mot de passe oublié ?
          </button>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button className="btn btn-primary" onClick={valider} disabled={busy || !peutValider} style={{ minWidth: 130 }}>
            {busy ? "…" : "Déverrouiller"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Nouveau code de secours pour l'admin connecté (l'ancien ne sert plus). Signale son absence
// (ex. AJC, mot de passe créé avant l'arrivée des codes de secours).
function CodeSecours({ trigramme }: { trigramme: string }) {
  const [defini, setDefini] = useState<boolean | null>(null);
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    adminApi.compteStatus(trigramme).then((s) => setDefini(s.code_secours_defini)).catch(() => {});
  }, [trigramme]);

  async function generer() {
    const ok = await confirmerAction(
      defini
        ? "Générer un nouveau code de secours ? L'ancien ne fonctionnera plus."
        : "Générer votre code de secours ? Il permet de choisir un nouveau mot de passe en cas d'oubli.",
      "Code de secours",
    );
    if (!ok) return;
    try {
      setCode(await adminApi.regenererCodeSecours());
      setDefini(true);
    } catch (e) {
      await confirmerAction(String(e), "Code de secours");
    }
  }

  return (
    <>
      <button
        className={defini === false ? "btn btn-sm btn-pastel-orange" : "btn btn-sm"}
        onClick={generer}
        title={defini === false ? "Aucun code de secours : en cas d'oubli du mot de passe, impossible de le réinitialiser seul" : undefined}
      >
        {defini === false ? "⚠ Créer un code de secours" : "Nouveau code de secours"}
      </button>
      {code && <CodeSecoursDialog code={code} onFermer={() => setCode(null)} />}
    </>
  );
}

function ChangerMotDePasse() {
  const [ouvert, setOuvert] = useState(false);
  const [ancien, setAncien] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  function fermer() {
    setOuvert(false);
    setAncien("");
    setNouveau("");
    setConfirmation("");
    setMessage(null);
  }

  async function valider() {
    if (nouveau !== confirmation) {
      setMessage({ ok: false, texte: "Les deux nouveaux mots de passe ne correspondent pas" });
      return;
    }
    try {
      await adminApi.changerMotDePasse(ancien, nouveau);
      setAncien("");
      setNouveau("");
      setConfirmation("");
      setMessage({ ok: true, texte: "Mot de passe modifié." });
    } catch (e) {
      setMessage({ ok: false, texte: String(e) });
    }
  }

  if (!ouvert) {
    return (
      <button className="btn btn-sm" onClick={() => setOuvert(true)}>
        Changer le mot de passe
      </button>
    );
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 300 }} onClick={fermer}>
      <div className="modal" style={{ width: 400, padding: 24 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 16px", fontSize: 17, fontWeight: 700 }}>Changer le mot de passe</h2>
        <input className="input" type="password" placeholder="Mot de passe actuel" value={ancien} autoFocus onChange={(e) => setAncien(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
        <input className="input" type="password" placeholder="Nouveau mot de passe" value={nouveau} onChange={(e) => setNouveau(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
        <input
          className="input"
          type="password"
          placeholder="Confirmer le nouveau mot de passe"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && valider()}
          style={{ width: "100%", marginBottom: 8 }}
        />
        {message && (
          <p style={{ margin: "4px 0 10px", fontSize: 13, color: message.ok ? "var(--ok-text)" : "var(--danger-text)" }}>{message.texte}</p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={fermer}>
            Fermer
          </button>
          <button className="btn btn-primary" onClick={valider} disabled={!ancien || !nouveau || !confirmation}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

function UtilisateursOnglet({ trigramme }: { trigramme: string }) {
  const [utilisateurs, setUtilisateurs] = useState<Utilisateur[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nouveauTrigramme, setNouveauTrigramme] = useState("");
  const [nouveauRole, setNouveauRole] = useState<Role>("utilisateur");

  const recharger = useCallback(() => {
    adminApi.listUtilisateurs().then(setUtilisateurs).catch((e) => setErreur(String(e)));
  }, []);

  useEffect(() => {
    recharger();
  }, [recharger]);

  async function changerRole(u: Utilisateur, role: Role) {
    if (role === u.role) return;
    const message =
      u.role === "admin"
        ? `${u.trigramme} ne sera plus administrateur : son mot de passe sera supprimé. Continuer ?`
        : role === "admin"
          ? `${u.trigramme} deviendra administrateur. Il créera son mot de passe à sa première ouverture de la page Admin. Continuer ?`
          : `Passer ${u.trigramme} en « ${LIBELLE_ROLE[role]} » ? (pris en compte sur son poste au prochain changement d'écran)`;
    if (!(await confirmerAction(message, "Changer le rôle"))) return;
    setErreur(null);
    try {
      await adminApi.setRole(u.trigramme, role);
      recharger();
    } catch (e) {
      setErreur(String(e));
    }
  }

  async function reinitialiserMotDePasse(u: Utilisateur) {
    const ok = await confirmerAction(
      `Effacer le mot de passe de ${u.trigramme} ? Il en choisira un nouveau (avec un nouveau code de secours) à sa prochaine ouverture de la page Admin ou au choix de son trigramme.`,
      "Réinitialiser le mot de passe",
    );
    if (!ok) return;
    setErreur(null);
    try {
      await adminApi.reinitialiserMotDePasseAdmin(u.trigramme);
      recharger();
    } catch (e) {
      setErreur(String(e));
    }
  }

  async function ajouter() {
    setErreur(null);
    try {
      await adminApi.ajouterUtilisateur(nouveauTrigramme, nouveauRole);
      setNouveauTrigramme("");
      setNouveauRole("utilisateur");
      recharger();
    } catch (e) {
      setErreur(String(e));
    }
  }

  if (!utilisateurs) return erreur ? <p style={{ color: "var(--danger-text)" }}>{erreur}</p> : <p style={{ color: "var(--text-muted)" }}>Chargement…</p>;

  return (
    <div>
      <p style={introOngletStyle}>Gestion des utilisateurs</p>
      {erreur && <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--danger-text)" }}>{erreur}</p>}
      <div className="panel" style={{ padding: 0, overflow: "auto", maxWidth: 820 }}>
        <table className="table-donnees">
          <thead>
            <tr>
              <th style={thStyle}>Trigramme</th>
              <th style={thStyle}>Rôle</th>
              <th style={thStyle}>Première connexion</th>
              <th style={thStyle}>Dernière connexion</th>
            </tr>
          </thead>
          <tbody>
            {utilisateurs.map((u) => (
              <tr key={u.trigramme}>
                <td style={tdStyle}>
                  <span style={avatarStyle}>{u.trigramme}</span>
                </td>
                <td style={tdStyle}>
                  <select
                    value={u.role}
                    onChange={(e) => changerRole(u, e.target.value as Role)}
                    disabled={u.trigramme === ADMIN_PERMANENT}
                    title={u.trigramme === ADMIN_PERMANENT ? `${ADMIN_PERMANENT} reste toujours administrateur` : undefined}
                    style={{ ...selectStyle, width: 190 }}
                  >
                    {(Object.keys(LIBELLE_ROLE) as Role[]).map((r) => (
                      <option key={r} value={r}>
                        {LIBELLE_ROLE[r]}
                      </option>
                    ))}
                  </select>
                  {u.role === "admin" && !u.mot_de_passe_defini && (
                    <div style={{ fontSize: 11.5, color: "var(--warn-text)", marginTop: 3 }}>Mot de passe pas encore créé</div>
                  )}
                  {u.role === "admin" && u.mot_de_passe_defini && u.trigramme !== trigramme && (
                    <button
                      type="button"
                      onClick={() => reinitialiserMotDePasse(u)}
                      style={{ display: "block", background: "none", border: "none", padding: 0, marginTop: 3, color: "var(--accent)", fontSize: 11.5, cursor: "pointer" }}
                    >
                      Réinitialiser le mot de passe
                    </button>
                  )}
                </td>
                <td style={tdStyle} className="mono">
                  {formaterHorodatage(u.premiere_connexion)}
                </td>
                <td style={tdStyle} className="mono">
                  {formaterHorodatage(u.derniere_connexion)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel" style={{ maxWidth: 820, marginTop: 16, padding: "14px 16px" }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>Ajouter un utilisateur</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          className="input"
          value={nouveauTrigramme}
          onChange={(e) => setNouveauTrigramme(e.target.value.toUpperCase())}
          placeholder="Trigramme"
          maxLength={3}
          style={{ width: 110, textTransform: "uppercase", letterSpacing: "0.06em" }}
        />
        <select value={nouveauRole} onChange={(e) => setNouveauRole(e.target.value as Role)} style={{ ...selectStyle, width: 190 }}>
          {(Object.keys(LIBELLE_ROLE) as Role[]).map((r) => (
            <option key={r} value={r}>
              {LIBELLE_ROLE[r]}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={ajouter} disabled={nouveauTrigramme.trim().length !== 3}>
          Ajouter
        </button>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 0" }}>
        Pour déclarer quelqu'un avant son premier lancement (par exemple un nouvel administrateur).
      </p>
      </div>
    </div>
  );
}

// Seuil d'alerte général (décision 2026-09-30) : seul endroit où il se règle. L'enregistrer
// l'applique aux nouvelles affaires et écrase celui des affaires dont la caisse n'est pas
// encore livrée ; les affaires livrées gardent le leur.
function ParametresOnglet() {
  const [actuel, setActuel] = useState<number | null>(null);
  const [saisie, setSaisie] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    affairesApi
      .getSeuilGeneral()
      .then((s) => {
        setActuel(s);
        setSaisie(String(s));
      })
      .catch((e) => setMessage({ ok: false, texte: String(e) }));
  }, []);

  const valeur = Number(saisie.replace(",", "."));
  const valide = saisie.trim() !== "" && Number.isFinite(valeur) && valeur >= 1 && valeur <= 100;
  const modifie = actuel !== null && valide && valeur !== actuel;

  async function enregistrer() {
    if (!modifie) return;
    const ok = await confirmerAction(
      `Le seuil d'alerte passera à ${valeur} % pour les nouvelles affaires et pour toutes les affaires dont la caisse n'est pas encore livrée (même si leur seuil avait été changé). Les affaires livrées gardent leur seuil. Continuer ?`,
      "Seuil d'alerte général",
    );
    if (!ok) return;
    setBusy(true);
    setMessage(null);
    try {
      const nb = await affairesApi.setSeuilGeneral(valeur);
      setActuel(valeur);
      setMessage({ ok: true, texte: `Seuil enregistré — ${nb} affaire(s) mise(s) à jour.` });
    } catch (e) {
      setMessage({ ok: false, texte: String(e) });
    } finally {
      setBusy(false);
    }
  }

  if (actuel === null) return message ? <p style={{ color: "var(--danger-text)" }}>{message.texte}</p> : null;

  return (
    <div style={{ maxWidth: 680 }}>
      <div className="panel" style={panneauReglageStyle}>
        <label style={labelStyle}>
          <span style={libelleStyle}>Seuil d'alerte général</span>
          <span style={champUniteStyle}>
            <input
              className="input"
              type="number"
              min={1}
              max={100}
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              style={{ width: 90 }}
            />
            <span style={uniteStyle}>%</span>
          </span>
        </label>
        <p style={aideStyle}>
          Taux de remplissage au-delà duquel une caisse passe en alerte dans Simulations. Il s'applique aux nouvelles
          affaires et, à l'enregistrement, remplace celui des affaires dont la caisse n'est pas encore livrée.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={enregistrer} disabled={!modifie || busy}>
            Enregistrer
          </button>
        </div>
      </div>
      {message && (
        <p style={{ margin: "12px 0 0", fontSize: 13, color: message.ok ? "var(--ok-text)" : "var(--danger-text)" }}>{message.texte}</p>
      )}
      <PoidsMaxParametre />
    </div>
  );
}

// Limite de poids au m² d'une caisse (alerte « Charge trop lourde » de Simulations, 2026-10-02).
function PoidsMaxParametre() {
  const [actuel, setActuel] = useState<number | null>(null);
  const [saisie, setSaisie] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    affairesApi
      .getPoidsMaxKgM2()
      .then((p) => {
        setActuel(p);
        setSaisie(String(p));
      })
      .catch((e) => setMessage({ ok: false, texte: String(e) }));
  }, []);

  const valeur = Number(saisie.replace(",", "."));
  const valide = saisie.trim() !== "" && Number.isFinite(valeur) && valeur > 0;
  const modifie = actuel !== null && valide && valeur !== actuel;

  async function enregistrer() {
    if (!modifie) return;
    setBusy(true);
    setMessage(null);
    try {
      await affairesApi.setPoidsMaxKgM2(valeur);
      setActuel(valeur);
      setMessage({ ok: true, texte: "Limite de poids enregistrée — prise en compte à la prochaine ouverture d'une affaire." });
    } catch (e) {
      setMessage({ ok: false, texte: String(e) });
    } finally {
      setBusy(false);
    }
  }

  if (actuel === null) return message ? <p style={{ color: "var(--danger-text)" }}>{message.texte}</p> : null;

  return (
    <div style={{ marginTop: 16 }}>
      <div className="panel" style={panneauReglageStyle}>
        <label style={labelStyle}>
          <span style={libelleStyle}>Limite de poids d'une caisse</span>
          <span style={champUniteStyle}>
            <input className="input" type="number" min={1} value={saisie} onChange={(e) => setSaisie(e.target.value)} style={{ width: 90 }} />
            <span style={uniteStyle}>kg/m²</span>
          </span>
        </label>
        <p style={aideStyle}>
          Dans une affaire en simulation, si le poids total des articles présents dans une caisse dépasse la limite au
          mètre carré, une alerte apparaît.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={enregistrer} disabled={!modifie || busy}>
            Enregistrer
          </button>
        </div>
      </div>
      {message && (
        <p style={{ margin: "12px 0 0", fontSize: 13, color: message.ok ? "var(--ok-text)" : "var(--danger-text)" }}>{message.texte}</p>
      )}
    </div>
  );
}

const LIBELLE_FREQUENCE: Record<FrequenceBackup, string> = {
  desactivee: "Désactivée",
  quotidienne: "Quotidienne",
  hebdomadaire: "Hebdomadaire",
};

function SauvegardeOnglet({ trigramme }: { trigramme: string }) {
  const [config, setConfig] = useState<BackupConfig | null>(null);
  const [dossier, setDossier] = useState<string | null>(null);
  const [frequence, setFrequence] = useState<FrequenceBackup>("desactivee");
  const [conservation, setConservation] = useState(30);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const appliquer = useCallback((c: BackupConfig) => {
    setConfig(c);
    setDossier(c.dossier);
    setFrequence(c.frequence);
    setConservation(c.conservation);
  }, []);

  useEffect(() => {
    backupApi.getConfig().then(appliquer).catch((e) => setMessage({ ok: false, texte: String(e) }));
  }, [appliquer]);

  const modifie =
    config !== null && (dossier !== config.dossier || frequence !== config.frequence || conservation !== config.conservation);

  async function choisirDossier() {
    const choisi = await backupApi.chooseFolder();
    if (choisi) setDossier(choisi);
  }

  async function enregistrer() {
    setMessage(null);
    try {
      appliquer(await backupApi.setConfig(dossier, frequence, conservation));
      setMessage({ ok: true, texte: "Paramètres enregistrés." });
    } catch (e) {
      setMessage({ ok: false, texte: String(e) });
    }
  }

  async function sauvegarderMaintenant() {
    setBusy(true);
    setMessage(null);
    try {
      const chemin = await backupApi.now(trigramme);
      setMessage({ ok: true, texte: `Sauvegarde créée : ${chemin}` });
    } catch (e) {
      setMessage({ ok: false, texte: String(e) });
    } finally {
      setBusy(false);
      backupApi.getConfig().then(appliquer);
    }
  }

  if (!config) {
    return message ? <p style={{ color: "var(--danger-text)" }}>{message.texte}</p> : null;
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <p style={introOngletStyle}>
        Copie de la base <span className="mono">caisses.sqlite3</span> dans le dossier choisi. La sauvegarde automatique
        est faite par le premier poste ouvert qui la trouve en retard (un seul poste la fait). Le dossier doit donc être
        accessible depuis tous les postes, et de préférence ailleurs que le dossier de la base.
      </p>

      <div className="panel" style={panneauReglageStyle}>
        <div style={labelStyle}>
          <span style={libelleStyle}>Dossier</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="mono" style={{ flex: 1, fontSize: 12.5, wordBreak: "break-all", color: dossier ? "var(--text)" : "var(--text-muted)" }}>
              {dossier ?? "Aucun dossier choisi"}
            </span>
            <button className="btn btn-sm" onClick={choisirDossier}>
              Choisir…
            </button>
          </div>
        </div>
        <label style={labelStyle}>
          <span style={libelleStyle}>Fréquence</span>
          <select value={frequence} onChange={(e) => setFrequence(e.target.value as FrequenceBackup)} style={selectStyle}>
            {(Object.keys(LIBELLE_FREQUENCE) as FrequenceBackup[]).map((f) => (
              <option key={f} value={f}>
                {LIBELLE_FREQUENCE[f]}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          <span style={libelleStyle}>Sauvegardes conservées</span>
          <input
            className="input"
            type="number"
            min={1}
            max={365}
            value={conservation}
            onChange={(e) => setConservation(Number(e.target.value))}
            style={{ width: 90 }}
          />
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn" onClick={sauvegarderMaintenant} disabled={busy || !config.dossier || modifie} title={modifie ? "Enregistrer d'abord les paramètres" : undefined}>
            {busy ? "Sauvegarde…" : "Sauvegarder maintenant"}
          </button>
          <button className="btn btn-primary" onClick={enregistrer} disabled={!modifie}>
            Enregistrer
          </button>
        </div>
      </div>

      {message && (
        <p style={{ margin: "12px 0 0", fontSize: 13, color: message.ok ? "var(--ok-text)" : "var(--danger-text)", wordBreak: "break-all" }}>
          {message.texte}
        </p>
      )}

      <div style={{ marginTop: 16, fontSize: 13, display: "grid", gap: 4, padding: "10px 14px", background: "rgba(32, 30, 26, 0.04)", borderRadius: "var(--radius)" }}>
        <div>
          <span style={{ color: "var(--text-muted)" }}>Dernière sauvegarde : </span>
          {config.derniere ? `${formaterHorodatage(config.derniere)} (poste ${config.dernier_poste ?? "?"})` : "jamais"}
        </div>
        {config.derniere_erreur && (
          <div style={{ color: "var(--danger-text)" }}>
            <span style={{ fontWeight: 600 }}>Dernière erreur : </span>
            {config.derniere_erreur}
          </div>
        )}
      </div>

      <RestaurationSection trigramme={trigramme} dossier={config.dossier} />
    </div>
  );
}

function RestaurationSection({ trigramme, dossier }: { trigramme: string; dossier: string | null }) {
  const [fichiers, setFichiers] = useState<FichierSauvegarde[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Attente de la fermeture des autres postes (demande envoyée) : trigrammes encore ouverts.
  const [attente, setAttente] = useState<{ chemin: string; postes: string[] } | null>(null);

  useEffect(() => {
    setFichiers(null);
    setErreur(null);
    backupApi.listSauvegardes().then(setFichiers).catch((e) => setErreur(String(e)));
  }, [dossier]);

  // Pendant l'attente : on relit les postes ouverts toutes les 3 s, et la restauration part
  // d'elle-même quand il n'en reste plus.
  useEffect(() => {
    if (!attente) return;
    let annule = false;
    const id = window.setInterval(async () => {
      try {
        const postes = await backupApi.autresPostesActifs();
        if (annule) return;
        if (postes.length === 0) {
          window.clearInterval(id);
          setAttente(null);
          await lancerRestauration(attente.chemin);
        } else {
          setAttente((a) => (a ? { ...a, postes } : a));
        }
      } catch (e) {
        setErreur(String(e));
      }
    }, 3000);
    return () => {
      annule = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attente?.chemin]);

  async function annulerAttente() {
    setAttente(null);
    setBusy(false);
    await backupApi.annulerFermeture().catch(() => {});
  }

  async function restaurer(chemin: string, libelle: string) {
    const confirme = await confirmerActionRisquee(
      `Remplacer toute la base actuelle par ${libelle} ? Tout ce qui a été saisi depuis sera perdu. ` +
        "Une copie de la base actuelle est faite juste avant, à côté de caisses.sqlite3. " +
        "Le mot de passe admin et les réglages de sauvegarde actuels sont conservés. L'app redémarrera ensuite.",
      "Restaurer une sauvegarde",
    );
    if (!confirme) return;
    setErreur(null);
    // Autres postes ouverts : on leur demande de fermer l'app, et on attend (décision 2026-10-02).
    const postes = await backupApi.autresPostesActifs().catch(() => [] as string[]);
    if (postes.length > 0) {
      setBusy(true);
      try {
        await backupApi.demanderFermeture(trigramme);
        setAttente({ chemin, postes });
      } catch (e) {
        setErreur(String(e));
        setBusy(false);
      }
      return;
    }
    await lancerRestauration(chemin);
  }

  async function lancerRestauration(chemin: string) {
    setBusy(true);
    setErreur(null);
    try {
      const securite = await backupApi.restaurer(chemin, trigramme);
      await confirmerAction(
        `Restauration terminée. L'état précédent de la base a été copié dans : ${securite}. L'app va redémarrer.`,
        "Restauration terminée",
      );
      await backupApi.redemarrer();
    } catch (e) {
      setErreur(String(e));
      setBusy(false);
    }
  }

  async function autreFichier() {
    const chemin = await backupApi.chooseFichierRestauration();
    if (chemin) await restaurer(chemin, `le fichier « ${chemin} »`);
  }

  return (
    <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px" }}>Restaurer une sauvegarde</h3>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 12px" }}>
        Remplace la base par une sauvegarde. Si l'app est ouverte sur d'autres postes, ils reçoivent un message leur
        demandant de la fermer ; la restauration démarre dès que tous l'ont fermée.
      </p>

      {attente && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            margin: "0 0 12px",
            padding: "10px 14px",
            background: "var(--info-bg)",
            border: "1px solid var(--info-border)",
            color: "var(--info-text)",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          <span style={{ flex: 1 }}>
            En attente de la fermeture de l'app sur : <strong>{attente.postes.join(", ")}</strong>. La restauration démarrera
            automatiquement.
          </span>
          <button className="btn btn-sm" onClick={annulerAttente}>
            Annuler
          </button>
        </div>
      )}

      {erreur && (
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--danger-text)", wordBreak: "break-word" }}>{erreur}</p>
      )}

      <div className="panel" style={{ padding: 0, overflow: "auto", maxHeight: 320 }}>
        {!dossier ? (
          <p style={{ margin: 0, padding: 16, fontSize: 13, color: "var(--text-muted)" }}>Aucun dossier de sauvegarde choisi.</p>
        ) : fichiers === null ? (
          <p style={{ margin: 0, padding: 16, fontSize: 13, color: "var(--text-muted)" }}>{erreur ? "—" : "Chargement…"}</p>
        ) : fichiers.length === 0 ? (
          <p style={{ margin: 0, padding: 16, fontSize: 13, color: "var(--text-muted)" }}>Aucune sauvegarde dans ce dossier.</p>
        ) : (
          <table className="table-donnees">
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Taille</th>
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {fichiers.map((f) => (
                <tr key={f.chemin}>
                  <td style={tdStyle} className="mono" title={f.nom}>
                    {formaterDateSauvegarde(f.date)}
                  </td>
                  <td style={tdStyle} className="mono">
                    {formaterTaille(f.taille_octets)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    <button
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={() => restaurer(f.chemin, `la sauvegarde du ${formaterDateSauvegarde(f.date)}`)}
                    >
                      Restaurer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: 10 }}>
        <button className="btn btn-sm" onClick={autreFichier} disabled={busy}>
          {busy ? "Restauration…" : "Autre fichier…"}
        </button>
      </div>
    </div>
  );
}

// "AAAA-MM-JJ HH:MM:SS" → "JJ/MM/AAAA HH:MM"
function formaterDateSauvegarde(date: string): string {
  const [jour, heure] = date.split(" ");
  const [a, m, j] = jour.split("-");
  return `${j}/${m}/${a} ${heure.slice(0, 5)}`;
}

function formaterTaille(octets: number): string {
  if (octets < 1024 * 1024) return `${Math.max(1, Math.round(octets / 1024))} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

const iconeCadenasStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 44,
  height: 44,
  borderRadius: 12,
  background: "var(--accent-soft)",
  color: "var(--accent)",
  marginBottom: 14,
};

const labelStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "210px 1fr", alignItems: "center", gap: 12 };
const libelleStyle: React.CSSProperties = { fontSize: 13.5, fontWeight: 600 };
const panneauReglageStyle: React.CSSProperties = { padding: "20px 22px", display: "grid", gap: 14 };
const aideStyle: React.CSSProperties = { fontSize: 12.5, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 };
const introOngletStyle: React.CSSProperties = { fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px", lineHeight: 1.5 };
const champUniteStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8 };
const uniteStyle: React.CSSProperties = { fontSize: 13, color: "var(--text-muted)" };

// Pastille du trigramme (onglet Utilisateurs).
const avatarStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 44,
  padding: "3px 8px",
  borderRadius: 999,
  background: "var(--accent-soft)",
  color: "var(--accent)",
  fontWeight: 700,
  fontSize: 12.5,
  letterSpacing: "0.04em",
};

// Champs et menus : style commun de index.css (bordure, arrondi, focus).
const selectStyle: React.CSSProperties = {
  fontSize: 13,
  width: 200,
};

// En-têtes et cellules : style de .table-donnees (index.css).
const thStyle: React.CSSProperties = {};
const tdStyle: React.CSSProperties = {};
