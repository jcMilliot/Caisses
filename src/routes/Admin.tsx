import { useCallback, useEffect, useState } from "react";
import Journal from "./Journal";
import { adminApi, type Utilisateur } from "../data/admin";
import { backupApi, type BackupConfig, type FrequenceBackup } from "../data/backup";
import { formaterHorodatage } from "../domain/dates";

interface Props {
  trigramme: string;
}

type Onglet = "utilisateurs" | "sauvegarde" | "journal";

const ONGLETS: { id: Onglet; label: string }[] = [
  { id: "utilisateurs", label: "Utilisateurs" },
  { id: "sauvegarde", label: "Sauvegarde" },
  { id: "journal", label: "Journal" },
];

// Page Admin : réservée au trigramme AJC, mot de passe redemandé une fois par lancement de l'app
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

      {onglet === "utilisateurs" && <UtilisateursOnglet />}
      {onglet === "sauvegarde" && <SauvegardeOnglet trigramme={trigramme} />}
      {onglet === "journal" && <Journal />}
    </div>
  );
}

function DeverrouillageAdmin({ trigramme, onOk }: { trigramme: string; onOk: () => void }) {
  const [defini, setDefini] = useState<boolean | null>(null);
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
      await adminApi.unlock(trigramme, motDePasse);
      onOk();
    } catch (e) {
      setErreur(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (defini === null) return null;

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
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
          <button className="btn btn-primary" onClick={valider} disabled={busy || !peutValider}>
            {busy ? "…" : "Déverrouiller"}
          </button>
        </div>
      </div>
    </div>
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

function UtilisateursOnglet() {
  const [utilisateurs, setUtilisateurs] = useState<Utilisateur[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    adminApi.listUtilisateurs().then(setUtilisateurs).catch((e) => setErreur(String(e)));
  }, []);

  if (erreur) return <p style={{ color: "var(--danger-text)" }}>{erreur}</p>;
  if (!utilisateurs) return <p style={{ color: "var(--text-muted)" }}>Chargement…</p>;

  return (
    <div>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 14px" }}>
        Trigrammes saisis sur les postes qui utilisent cette base. Un trigramme apparaît ici dès que quelqu'un l'a
        choisi au premier lancement ; la dernière connexion est mise à jour à chaque démarrage de l'app.
      </p>
      <div className="panel" style={{ padding: 0, overflow: "auto", maxWidth: 640 }}>
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
                <td style={tdStyle}>{u.role === "admin" ? "Administrateur" : "Utilisateur"}</td>
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
    </div>
  );
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
