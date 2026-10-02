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
    <div style={{ padding: "32px 24px", maxWidth: 1200 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 20 }}>
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--accent)",
              marginBottom: 4,
            }}
          >
            Administration
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>Admin</h1>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <CodeSecours trigramme={trigramme} />
          <ChangerMotDePasse />
          <button className="btn btn-sm" onClick={verrouiller} title="Refermer la page Admin sur ce poste">
            Verrouiller
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
        {ONGLETS.map((o) => (
          <button
            key={o.id}
            className={onglet === o.id ? "btn btn-primary btn-sm" : "btn btn-sm"}
            onClick={() => setOnglet(o.id)}
          >
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
        <div className="panel" style={{ width: 420, maxWidth: "92vw", padding: 28 }}>
          <h1 style={{ margin: "0 0 10px", fontSize: 18, fontWeight: 700 }}>Mot de passe oublié — {trigramme}</h1>
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
      <div className="panel" style={{ width: 420, maxWidth: "92vw", padding: 28 }}>
        <h1 style={{ margin: "0 0 10px", fontSize: 18, fontWeight: 700 }}>
          {creation ? "Créer le mot de passe administrateur" : "Page Admin"}
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
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
          <button className="btn btn-primary" onClick={valider} disabled={busy || !peutValider}>
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
    <div style={backdropStyle} onClick={fermer}>
      <div className="panel" style={{ width: 380, padding: 24 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700 }}>Changer le mot de passe</h2>
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
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 14px" }}>
        Trigrammes saisis sur les postes qui utilisent cette base. Un trigramme apparaît ici dès que quelqu'un l'a
        choisi au premier lancement ; la dernière connexion est mise à jour à chaque démarrage de l'app. Rôles :
        Utilisateur (accès normal), Lecteur (lecture seule partout), Administrateur (page Admin, mot de passe
        personnel). Il reste toujours au moins un administrateur.
      </p>
      {erreur && <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--danger-text)" }}>{erreur}</p>}
      <div className="panel" style={{ padding: 0, overflow: "auto", maxWidth: 760 }}>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
              <th style={thStyle}>Trigramme</th>
              <th style={thStyle}>Rôle</th>
              <th style={thStyle}>Première connexion</th>
              <th style={thStyle}>Dernière connexion</th>
            </tr>
          </thead>
          <tbody>
            {utilisateurs.map((u) => (
              <tr key={u.trigramme} className="article-row">
                <td style={{ ...tdStyle, fontWeight: 700 }} className="mono">
                  {u.trigramme}
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
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14 }}>
        <input
          className="input"
          value={nouveauTrigramme}
          onChange={(e) => setNouveauTrigramme(e.target.value.toUpperCase())}
          placeholder="Trigramme"
          maxLength={3}
          style={{ width: 100 }}
        />
        <select value={nouveauRole} onChange={(e) => setNouveauRole(e.target.value as Role)} style={{ ...selectStyle, width: 190 }}>
          {(Object.keys(LIBELLE_ROLE) as Role[]).map((r) => (
            <option key={r} value={r}>
              {LIBELLE_ROLE[r]}
            </option>
          ))}
        </select>
        <button className="btn btn-sm" onClick={ajouter} disabled={nouveauTrigramme.trim().length !== 3}>
          Ajouter un utilisateur
        </button>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "6px 0 0" }}>
        Pour déclarer quelqu'un avant son premier lancement (par exemple un nouvel administrateur).
      </p>
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
    <div style={{ maxWidth: 640 }}>
      <div className="panel" style={{ padding: 20, display: "grid", gap: 14 }}>
        <label style={labelStyle}>
          <span style={libelleStyle}>Seuil d'alerte général (%)</span>
          <input
            className="input"
            type="number"
            min={1}
            max={100}
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            style={{ width: 90 }}
          />
        </label>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0 }}>
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
    <div style={{ maxWidth: 640 }}>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 16px" }}>
        Copie de la base <span className="mono">caisses.sqlite3</span> dans le dossier choisi. La sauvegarde automatique
        est faite par le premier poste ouvert qui la trouve en retard (un seul poste la fait). Le dossier doit donc être
        accessible depuis tous les postes, et de préférence ailleurs que le dossier de la base.
      </p>

      <div className="panel" style={{ padding: 20, display: "grid", gap: 14 }}>
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

      <div style={{ marginTop: 18, fontSize: 13, display: "grid", gap: 4 }}>
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

  useEffect(() => {
    setFichiers(null);
    setErreur(null);
    backupApi.listSauvegardes().then(setFichiers).catch((e) => setErreur(String(e)));
  }, [dossier]);

  async function restaurer(chemin: string, libelle: string) {
    const confirme = await confirmerActionRisquee(
      `Remplacer toute la base actuelle par ${libelle} ? Tout ce qui a été saisi depuis sera perdu. ` +
        "Une copie de la base actuelle est faite juste avant, à côté de caisses.sqlite3. " +
        "Le mot de passe admin et les réglages de sauvegarde actuels sont conservés. L'app redémarrera ensuite.",
      "Restaurer une sauvegarde",
    );
    if (!confirme) return;
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
    <div style={{ marginTop: 28 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 6px" }}>Restaurer une sauvegarde</h3>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 12px" }}>
        Remplace la base par une sauvegarde. Impossible tant que l'app est ouverte sur un autre poste : la fermer
        partout ailleurs d'abord.
      </p>

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
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Taille</th>
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {fichiers.map((f) => (
                <tr key={f.chemin} className="article-row">
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

const backdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 300,
};

const labelStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "180px 1fr", alignItems: "center", gap: 12 };
const libelleStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600 };

const selectStyle: React.CSSProperties = {
  padding: "6px 8px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius)",
  background: "var(--bg-panel)",
  color: "var(--text)",
  font: "inherit",
  fontSize: 13,
  width: 200,
};

const thStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderBottom: "2px solid var(--row-border-color)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  background: "var(--bg-panel)",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid var(--row-border-color)",
  textAlign: "left",
};
