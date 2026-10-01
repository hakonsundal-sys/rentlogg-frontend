import { useEffect, useState } from "react";
import { Building2, Check, Pencil, X } from "lucide-react";
import { apiFetch } from "../../api";
import { Card, linkBtnStyle } from "../shared";

export default function SelskaperPage({ token }) {
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  // "<company id>:<module key>" while that one checkbox is in flight — a company can have several
  // modules, and only the one actually being toggled should lock while the call runs.
  const [savingModule, setSavingModule] = useState(null);
  // Which company is being renamed, and the draft name. Inline rather than a dialog: the card
  // already shows the name, and this replaces it in place so it is obvious what is being edited.
  const [renaming, setRenaming] = useState(null);
  const [draftName, setDraftName] = useState("");
  const [savingName, setSavingName] = useState(false);

  function loadAll() {
    apiFetch("/companies", { token }).then(setCompanies).catch((err) => setError(err.message));
  }

  useEffect(loadAll, [token]);

  async function createCompany(e) {
    e.preventDefault();
    setError("");
    try {
      await apiFetch("/companies", { token, method: "POST", body: JSON.stringify({ name }) });
      setName("");
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveName(companyId) {
    const nytt = draftName.trim();
    if (!nytt) return;
    setError("");
    setSavingName(true);
    try {
      const updated = await apiFetch(`/companies/${companyId}`, {
        token, method: "PATCH", body: JSON.stringify({ name: nytt }),
      });
      // Merge rather than replace: the response carries id/name/modules, not created_at.
      setCompanies((list) => list.map((c) => (c.id === updated.id ? { ...c, name: updated.name } : c)));
      setRenaming(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingName(false);
    }
  }

  // Logoen leses til en data-URI i nettleseren og sendes som tekst. Det finnes derfor ingen
  // opplastingsrute og ingen fil på disk — se src/branding.js og companies i backendens db.js
  // for hvorfor en logo er det ene bildet i dette systemet som ikke er en fil.
  //
  // Grensen her er 150 kB på den ferdige data-URI-en, altså etter base64, fordi det er den
  // strengen som faktisk sendes. En base64-streng er ~33 % større enn filen, så en 120 kB PNG
  // havner over. Backend håndhever det samme; dette er bare for å si fra før opplastingen.
  const MAX_LOGO_CHARS = 150 * 1024;

  function pickLogo(companyId, event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (dataUrl.length > MAX_LOGO_CHARS) {
        setError(`Logoen er for stor (${Math.round(dataUrl.length / 1024)} kB etter koding). Maks 150 kB.`);
        return;
      }
      saveBranding(companyId, { logo_data_url: dataUrl });
    };
    reader.onerror = () => setError("Klarte ikke å lese filen.");
    reader.readAsDataURL(file);
  }

  async function saveBranding(companyId, fields) {
    setError("");
    try {
      await apiFetch(`/companies/${companyId}/branding`, {
        token, method: "PATCH", body: JSON.stringify(fields),
      });
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleModule(companyId, moduleKey, enabled) {
    setError("");
    setSavingModule(`${companyId}:${moduleKey}`);
    try {
      const updated = await apiFetch(`/companies/${companyId}/modules`, {
        token, method: "PATCH", body: JSON.stringify({ module_key: moduleKey, enabled }),
      });
      setCompanies((list) => list.map((c) => (c.id === updated.id ? { ...c, modules: updated.modules } : c)));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingModule(null);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Firmaer</h1>
        <div style={{ color: "var(--text-secondary)" }}>{companies.length} firma bruker Rentlogg</div>
      </div>

      {error && <div style={{ color: "var(--text-danger)", marginBottom: 12 }}>{error}</div>}

      <Card style={{ marginBottom: 20 }}>
        <form onSubmit={createCompany} style={{ display: "flex", gap: 10 }}>
          <input
            required placeholder="Firmanavn" value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button type="submit" style={primaryBtnStyle}>+ Nytt firma</button>
        </form>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
        {companies.map((company) => (
          <Card key={company.id}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--brand)", color: "white",
              marginBottom: 12,
            }}>
              <Building2 size={20} />
            </div>
            {renaming === company.id ? (
              <form
                onSubmit={(e) => { e.preventDefault(); saveName(company.id); }}
                style={{ display: "flex", gap: 6, alignItems: "center" }}
              >
                <input
                  required autoFocus value={draftName} disabled={savingName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") setRenaming(null); }}
                  style={{ ...inputStyle, flex: 1, minWidth: 0, fontWeight: 600 }}
                />
                <button type="submit" disabled={savingName} title="Lagre" style={iconBtnStyle}><Check size={15} /></button>
                <button type="button" onClick={() => setRenaming(null)} title="Avbryt" style={iconBtnStyle}><X size={15} /></button>
              </form>
            ) : (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontWeight: 600 }}>{company.name}</span>
                <button
                  type="button"
                  onClick={() => { setRenaming(company.id); setDraftName(company.name); setError(""); }}
                  title="Endre navn"
                  style={{ ...iconBtnStyle, marginLeft: "auto" }}
                >
                  <Pencil size={14} />
                </button>
              </div>
            )}
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
              Opprettet {company.created_at?.slice(0, 10)}
            </div>
            {/* Tilleggsmoduler er bevisst bare synlige her: et firmas egen admin ser ingen spor av
                en modul de ikke har, og kan heller ikke skru den på selv. */}
            {company.modules?.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 }}>Tilleggsmoduler</div>
                {company.modules.map((m) => (
                  <label key={m.key} style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", marginTop: 6 }}>
                    <input
                      type="checkbox"
                      checked={m.enabled}
                      disabled={savingModule === `${company.id}:${m.key}`}
                      onChange={(e) => toggleModule(company.id, m.key, e.target.checked)}
                      style={{ marginTop: 3 }}
                    />
                    <span>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</span>
                      <span style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                        {m.description}
                      </span>
                    </span>
                  </label>
                ))}
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.5 }}>
                  Skrur du av en modul, skjules den bare &mdash; ingenting slettes.
                </div>
              </div>
            )}
            {/* White-label. Bevisst her og ikke hos firmaets egen admin: dette er noe vi slår på
                for en kunde, ikke en innstilling de roter med selv midt i en arbeidsdag. */}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>Egen profil</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5 }}>
                  <input
                    type="color"
                    value={company.brand_color || "#1e2a38"}
                    onChange={(e) => saveBranding(company.id, { brand_color: e.target.value })}
                    style={{ width: 34, height: 28, padding: 0, border: "1px solid var(--border)", background: "none", cursor: "pointer" }}
                  />
                  Kulør
                </label>
                {company.brand_color && (
                  <button onClick={() => saveBranding(company.id, { brand_color: "" })} style={linkBtnStyle}>
                    Nullstill kulør
                  </button>
                )}

                {company.logo_data_url ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <img src={company.logo_data_url} alt="" style={{ height: 24, maxWidth: 110, objectFit: "contain" }} />
                    <button onClick={() => saveBranding(company.id, { logo_data_url: "" })} style={linkBtnStyle}>
                      Fjern logo
                    </button>
                  </span>
                ) : (
                  <label style={{ fontSize: 12.5, cursor: "pointer", color: "var(--brand-dark)", fontWeight: 500 }}>
                    + Last opp logo
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={(e) => pickLogo(company.id, e)}
                      style={{ display: "none" }}
                    />
                  </label>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  defaultValue={company.custom_domain || ""}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (company.custom_domain || "")) saveBranding(company.id, { custom_domain: v });
                  }}
                  placeholder="rent.kundensdomene.no"
                  style={{ ...inputStyle, width: 230, fontSize: 12.5 }}
                />
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Eget domene</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.5, maxWidth: 440 }}>
                Kuløren og logoen virker med én gang. Domenet er bare oppslaget &mdash; DNS, sertifikat,
                domenet lagt til i Vercel og <code>ALLOWED_ORIGINS</code> må settes opp for hånd per kunde
                før verten faktisk svarer.
              </div>
            </div>
          </Card>
        ))}
      </div>
      {companies.length === 0 && <Card style={{ textAlign: "center", color: "var(--text-secondary)" }}>Ingen firma ennå.</Card>}

      <div style={{ marginTop: 16, fontSize: 13, color: "var(--text-secondary)" }}>
        Gå til «Inviter brukere» for å invitere det første admin-brukeren til et nytt firma.
      </div>
    </div>
  );
}

const iconBtnStyle = {
  background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 6px",
  cursor: "pointer", color: "var(--text-secondary)", display: "flex", alignItems: "center",
};

const primaryBtnStyle = {
  background: "var(--brand)", color: "white", border: "none",
  padding: "9px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
};
const inputStyle = {
  padding: "8px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
  background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 14, boxSizing: "border-box",
};
