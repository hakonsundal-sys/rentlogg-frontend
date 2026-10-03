import { useEffect, useState } from "react";
import { Building2, Check, Pencil, X } from "lucide-react";
import { apiFetch } from "../../api";
import { Card } from "../shared";

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

  async function toggleChecklistOnly(companyId, enabled) {
    setError("");
    setSavingModule(`${companyId}:checklist_only`);
    try {
      const updated = await apiFetch(`/companies/${companyId}/checklist-only`, {
        token, method: "PATCH", body: JSON.stringify({ enabled }),
      });
      setCompanies((list) => list.map((c) => (c.id === updated.id ? { ...c, checklist_only: updated.checklist_only, modules: updated.modules } : c)));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingModule(null);
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
                {/* Ikke en modul, men et valg om hva firmaet ER: et firma som ikke driver renhold
                    ser bare sjekklistene. Skrur sjekkliste-modulen på av seg selv. */}
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--border)" }}>
                  <input
                    type="checkbox"
                    checked={!!company.checklist_only}
                    disabled={savingModule === `${company.id}:checklist_only`}
                    onChange={(e) => toggleChecklistOnly(company.id, e.target.checked)}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>Kun sjekkliste (ikke renhold)</span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                      Skjuler lokasjoner, kunder, avvik og renholdsvisningen. Firmaet ser bare «Sjekk det», Ansatte og Timer/Opplæring om de har dem.
                    </span>
                  </span>
                </label>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.5 }}>
                  Skrur du av en modul, skjules den bare &mdash; ingenting slettes.
                </div>
              </div>
            )}
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
