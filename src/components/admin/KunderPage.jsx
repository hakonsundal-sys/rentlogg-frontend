import { useEffect, useState } from "react";
import { Users, Trash2, Mail, Phone } from "lucide-react";
import { apiFetch } from "../../api";
import { Card } from "../shared";

const emptyForm = { name: "", contact_name: "", contact_email: "", phone: "" };

export default function KunderPage({ token, refreshSummary }) {
  const [clients, setClients] = useState([]);
  const [sites, setSites] = useState([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState(null);

  function loadAll() {
    Promise.all([apiFetch("/clients", { token }), apiFetch("/sites", { token })])
      .then(([clientsData, sitesData]) => {
        setClients(clientsData);
        setSites(sitesData);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(loadAll, [token]);

  const siteCount = (clientId) => sites.filter((s) => s.client_id === clientId).length;

  async function createClient(e) {
    e.preventDefault();
    setError("");
    try {
      await apiFetch("/clients", { token, method: "POST", body: JSON.stringify(form) });
      setForm(emptyForm);
      setShowForm(false);
      loadAll();
      refreshSummary?.();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteClient(id) {
    setError("");
    try {
      await apiFetch(`/clients/${id}`, { token, method: "DELETE" });
      setConfirmDelete(null);
      loadAll();
      refreshSummary?.();
    } catch (err) {
      setError(err.message);
      setConfirmDelete(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Kunder</h1>
          <div style={{ color: "var(--text-secondary)" }}>{clients.length} kunder</div>
        </div>
        <button onClick={() => setShowForm((v) => !v)} style={primaryBtnStyle}>+ Ny kunde</button>
      </div>

      {error && <div style={{ color: "var(--text-danger)", marginBottom: 12 }}>{error}</div>}

      {showForm && (
        <Card style={{ marginBottom: 20 }}>
          <form onSubmit={createClient} style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            <input required placeholder="Firmanavn" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            <input placeholder="Kontaktperson" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} style={inputStyle} />
            <input type="email" placeholder="E-post" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} style={inputStyle} />
            <input placeholder="Telefon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
            <button type="submit" style={{ ...primaryBtnStyle, gridColumn: "span 2" }}>Opprett kunde</button>
          </form>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {clients.map((client) => (
          <Card key={client.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                background: "linear-gradient(135deg, var(--accent-orange), var(--accent-orange-dark))", color: "white",
              }}>
                <Users size={20} />
              </div>
              <button onClick={() => setConfirmDelete(client.id)} style={iconBtnStyle}><Trash2 size={15} /></button>
            </div>

            <div style={{ fontWeight: 600, marginTop: 12 }}>{client.name}</div>
            {client.contact_name && <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{client.contact_name}</div>}
            {client.contact_email && (
              <div style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                <Mail size={13} /> {client.contact_email}
              </div>
            )}
            {client.phone && (
              <div style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
                <Phone size={13} /> {client.phone}
              </div>
            )}

            <div style={{ borderTop: "1px solid var(--border)", marginTop: 12, paddingTop: 10, fontSize: 13, color: "var(--text-secondary)" }}>
              {siteCount(client.id)} lokasjoner
            </div>

            {confirmDelete === client.id && (
              <div style={{ marginTop: 10, fontSize: 13, background: "var(--bg-danger)", padding: 10, borderRadius: "var(--radius)" }}>
                Slette denne kunden?
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => deleteClient(client.id)} style={{ ...primaryBtnStyle, background: "var(--text-danger)" }}>Ja, slett</button>
                  <button onClick={() => setConfirmDelete(null)} style={linkBtnStyle}>Avbryt</button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
      {clients.length === 0 && <Card style={{ textAlign: "center", color: "var(--text-secondary)" }}>Ingen kunder ennå.</Card>}
    </div>
  );
}

const primaryBtnStyle = {
  background: "var(--accent-orange)", color: "white", border: "none",
  padding: "9px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const linkBtnStyle = {
  background: "none", border: "none", color: "var(--accent-orange-dark)", fontSize: 12, cursor: "pointer", fontWeight: 500,
};
const iconBtnStyle = {
  background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4,
};
const inputStyle = {
  padding: "8px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
  background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 14, boxSizing: "border-box", width: "100%",
};
