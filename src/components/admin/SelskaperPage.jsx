import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { apiFetch } from "../../api";
import { Card } from "../shared";

export default function SelskaperPage({ token }) {
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  // "<company id>:<module key>" while that one checkbox is in flight — a company can have several
  // modules, and only the one actually being toggled should lock while the call runs.
  const [savingModule, setSavingModule] = useState(null);

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
              background: "linear-gradient(135deg, var(--brand), var(--brand-dark))", color: "white",
              marginBottom: 12,
            }}>
              <Building2 size={20} />
            </div>
            <div style={{ fontWeight: 600 }}>{company.name}</div>
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

const primaryBtnStyle = {
  background: "var(--brand)", color: "white", border: "none",
  padding: "9px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
};
const inputStyle = {
  padding: "8px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
  background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 14, boxSizing: "border-box",
};
