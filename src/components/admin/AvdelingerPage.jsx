import { useEffect, useState } from "react";
import { Building2, Trash2, Pencil } from "lucide-react";
import { apiFetch } from "../../api";
import { Card } from "../shared";

const emptyForm = { name: "", client_id: "" };

export default function AvdelingerPage({ token, refreshSummary }) {
  const [departments, setDepartments] = useState([]);
  const [clients, setClients] = useState([]);
  const [sites, setSites] = useState([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editingDepartmentId, setEditingDepartmentId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);

  function loadAll() {
    Promise.all([apiFetch("/departments", { token }), apiFetch("/clients", { token }), apiFetch("/sites", { token })])
      .then(([departmentsData, clientsData, sitesData]) => {
        setDepartments(departmentsData);
        setClients(clientsData);
        setSites(sitesData);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(loadAll, [token]);

  const siteCount = (departmentId) => sites.filter((s) => s.department_id === departmentId).length;
  const clientName = (clientId) => clients.find((c) => c.id === clientId)?.name || "Ukjent kunde";

  async function createDepartment(e) {
    e.preventDefault();
    setError("");
    try {
      await apiFetch("/departments", { token, method: "POST", body: JSON.stringify({ ...form, client_id: Number(form.client_id) }) });
      setForm(emptyForm);
      setShowForm(false);
      loadAll();
      refreshSummary?.();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteDepartment(id) {
    setError("");
    try {
      await apiFetch(`/departments/${id}`, { token, method: "DELETE" });
      setConfirmDelete(null);
      loadAll();
      refreshSummary?.();
    } catch (err) {
      setError(err.message);
      setConfirmDelete(null);
    }
  }

  function startEditDepartment(department) {
    setEditingDepartmentId(department.id);
    setEditForm({ name: department.name || "", client_id: String(department.client_id) });
  }

  async function saveEditDepartment(e, id) {
    e.preventDefault();
    setError("");
    try {
      await apiFetch(`/departments/${id}`, { token, method: "PATCH", body: JSON.stringify({ name: editForm.name }) });
      setEditingDepartmentId(null);
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Avdelinger</h1>
          <div style={{ color: "var(--text-secondary)" }}>{departments.length} avdelinger</div>
        </div>
        <button onClick={() => setShowForm((v) => !v)} style={primaryBtnStyle}>+ Ny avdeling</button>
      </div>

      {error && <div style={{ color: "var(--text-danger)", marginBottom: 12 }}>{error}</div>}

      {showForm && (
        <Card style={{ marginBottom: 20 }}>
          <form onSubmit={createDepartment} style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            <input required placeholder="Avdelingsnavn" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            <select required value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} style={inputStyle}>
              <option value="">Velg kunde...</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="submit" style={{ ...primaryBtnStyle, gridColumn: "span 2" }}>Opprett avdeling</button>
          </form>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {departments.map((department) => (
          <Card key={department.id}>
            {editingDepartmentId === department.id ? (
              <form onSubmit={(e) => saveEditDepartment(e, department.id)} style={{ display: "grid", gap: 8 }}>
                <input required placeholder="Avdelingsnavn" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} style={inputStyle} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" style={primaryBtnStyle}>Lagre</button>
                  <button type="button" onClick={() => setEditingDepartmentId(null)} style={linkBtnStyle}>Avbryt</button>
                </div>
              </form>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                    background: "linear-gradient(135deg, var(--accent-orange), var(--accent-orange-dark))", color: "white",
                  }}>
                    <Building2 size={20} />
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => startEditDepartment(department)} style={iconBtnStyle}><Pencil size={15} /></button>
                    <button onClick={() => setConfirmDelete(department.id)} style={iconBtnStyle}><Trash2 size={15} /></button>
                  </div>
                </div>

                <div style={{ fontWeight: 600, marginTop: 12 }}>{department.name}</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{clientName(department.client_id)}</div>

                <div style={{ borderTop: "1px solid var(--border)", marginTop: 12, paddingTop: 10, fontSize: 13, color: "var(--text-secondary)" }}>
                  {siteCount(department.id)} lokasjoner
                </div>

                {confirmDelete === department.id && (
                  <div style={{ marginTop: 10, fontSize: 13, background: "var(--bg-danger)", padding: 10, borderRadius: "var(--radius)" }}>
                    Slette denne avdelingen?
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button onClick={() => deleteDepartment(department.id)} style={{ ...primaryBtnStyle, background: "var(--text-danger)" }}>Ja, slett</button>
                      <button onClick={() => setConfirmDelete(null)} style={linkBtnStyle}>Avbryt</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        ))}
      </div>
      {departments.length === 0 && <Card style={{ textAlign: "center", color: "var(--text-secondary)" }}>Ingen avdelinger ennå.</Card>}
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
