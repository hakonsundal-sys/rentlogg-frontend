import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { apiFetch } from "../../api";
import { Card } from "../shared";

export default function SelskaperPage({ token }) {
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState("");
  const [name, setName] = useState("");

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
              background: "linear-gradient(135deg, var(--accent-orange), var(--accent-orange-dark))", color: "white",
              marginBottom: 12,
            }}>
              <Building2 size={20} />
            </div>
            <div style={{ fontWeight: 600 }}>{company.name}</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
              Opprettet {company.created_at?.slice(0, 10)}
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

const primaryBtnStyle = {
  background: "var(--accent-orange)", color: "white", border: "none",
  padding: "9px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
};
const inputStyle = {
  padding: "8px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
  background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 14, boxSizing: "border-box",
};
