import { useEffect, useState } from "react";
import { Info, AlertTriangle, CircleAlert, MapPin, Clock } from "lucide-react";
import { apiFetch, API_URL } from "../../api";
import { Card, Field, Loading, primaryBtnStyle, linkBtnStyle, inputStyle } from "../shared";

function photoUrl(filePath) {
  const filename = filePath.split(/[\\/]/).pop();
  return `${API_URL}/uploads/${filename}`;
}

const PRIORITY = {
  low: { label: "Lav", icon: Info, color: "var(--text-secondary)" },
  medium: { label: "Middels", icon: AlertTriangle, color: "var(--accent-orange-dark)" },
  high: { label: "Høy", icon: CircleAlert, color: "var(--text-danger)" },
};
const STATUS_LABEL = { open: "ÅPEN", in_progress: "PÅGÅR", resolved: "LØST" };
const ASSIGNED_LABEL = { manager: "Sendt til driftsleder", customer: "Sendt til kunde" };

export default function AvvikPage({ token, refreshSummary }) {
  const [deviations, setDeviations] = useState([]);
  const [sites, setSites] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", priority: "medium" });
  const [confirmDelete, setConfirmDelete] = useState(null);

  function loadAll() {
    Promise.all([apiFetch("/deviations", { token }), apiFetch("/sites", { token }), apiFetch("/departments", { token }).catch(() => [])])
      .then(([devData, sitesData, departmentsData]) => {
        setDeviations(devData);
        setSites(sitesData);
        setDepartments(departmentsData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(loadAll, [token]);

  const siteName = (id) => sites.find((s) => s.id === id)?.name || "—";
  const visibleDeviations = departmentFilter
    ? deviations.filter((d) => sites.find((s) => s.id === d.site_id)?.department_id === Number(departmentFilter))
    : deviations;

  function startEdit(dev) {
    setEditingId(dev.id);
    setEditForm({ title: dev.title || "", description: dev.description, priority: dev.priority });
  }

  async function saveEdit(id) {
    setError("");
    try {
      await apiFetch(`/deviations/${id}`, { token, method: "PATCH", body: JSON.stringify(editForm) });
      setEditingId(null);
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function markResolved(id) {
    try {
      await apiFetch(`/deviations/${id}`, { token, method: "PATCH", body: JSON.stringify({ status: "resolved" }) });
      loadAll();
      refreshSummary?.();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteDeviation(id) {
    try {
      await apiFetch(`/deviations/${id}`, { token, method: "DELETE" });
      setConfirmDelete(null);
      loadAll();
      refreshSummary?.();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Avvik</h1>
          <div style={{ color: "var(--text-secondary)" }}>{visibleDeviations.length} registrerte avvik</div>
        </div>
        {departments.length > 0 && (
          <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} style={{ ...inputStyle, width: 180 }}>
            <option value="">Alle avdelinger</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
      </div>

      {error && <div style={{ color: "var(--text-danger)", marginBottom: 12 }}>{error}</div>}

      {visibleDeviations.map((dev) => {
        const p = PRIORITY[dev.priority] || PRIORITY.medium;
        const Icon = p.icon;
        return (
          <Card key={dev.id} style={{ marginBottom: 12 }}>
            {editingId === dev.id ? (
              <div>
                <Field label="Tittel" style={{ marginBottom: 8 }}>
                  <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="Beskrivelse" style={{ marginBottom: 8 }}>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
                  />
                </Field>
                <Field label="Prioritet" style={{ marginBottom: 8, width: 160 }}>
                  <select
                    value={editForm.priority}
                    onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="low">Lav</option>
                    <option value="medium">Middels</option>
                    <option value="high">Høy</option>
                  </select>
                </Field>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => saveEdit(dev.id)} style={primaryBtnStyle}>Lagre</button>
                  <button onClick={() => setEditingId(null)} style={linkBtnStyle}>Avbryt</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", gap: 12 }}>
                  <Icon size={20} style={{ color: p.color, flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>{dev.title || dev.description.slice(0, 40)}</div>
                    {dev.title && <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{dev.description}</div>}
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 3 }}><MapPin size={12} /> {siteName(dev.site_id)}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Clock size={12} /> {(dev.run_started_at || dev.created_at).slice(0, 16)}</span>
                      <span style={{ fontWeight: 600, color: p.color }}>{p.label}</span>
                    </div>
                    {(dev.room_name || dev.room_task_label) && (
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                        {dev.room_name}{dev.room_task_label ? ` · ${dev.room_task_label}` : ""}
                      </div>
                    )}
                    {dev.reported_by_initials && (
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>Meldt av: {dev.reported_by_initials}</div>
                    )}
                    {dev.reply_text && (
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border)" }}>
                        <strong>Svar:</strong> {dev.reply_text} — {dev.replied_by_initials}
                        {dev.assigned_to && <span> ({ASSIGNED_LABEL[dev.assigned_to] || dev.assigned_to})</span>}
                      </div>
                    )}
                    {dev.status === "resolved" && (
                      <div style={{ fontSize: 12, color: dev.customer_approved_at ? "var(--text-success)" : "var(--text-secondary)", marginTop: 4 }}>
                        {dev.customer_approved_at
                          ? `Godkjent av kunde (${dev.customer_approved_by_initials})`
                          : "Venter på kundegodkjenning"}
                      </div>
                    )}
                    {dev.photos?.length > 0 && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                        {dev.photos.map((ph) => (
                          <a key={ph.id} href={photoUrl(ph.file_path)} target="_blank" rel="noreferrer">
                            <img src={photoUrl(ph.file_path)} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: "var(--radius-sm)" }} />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap",
                  background: dev.status === "resolved" ? "var(--c-teal)" : "var(--bg-danger)",
                  color: dev.status === "resolved" ? "var(--text-success)" : "var(--text-danger)",
                }}>
                  {STATUS_LABEL[dev.status]}
                </span>
              </div>
            )}

            {editingId !== dev.id && (
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={() => startEdit(dev)} style={secondaryBtnStyle}>Rediger</button>
                {dev.status !== "resolved" && (
                  <button onClick={() => markResolved(dev.id)} style={secondaryBtnStyle}>Merk løst</button>
                )}
                <button onClick={() => setConfirmDelete(dev.id)} style={{ ...secondaryBtnStyle, color: "var(--text-danger)" }}>Slett</button>
              </div>
            )}

            {confirmDelete === dev.id && (
              <div style={{ marginTop: 10, fontSize: 13, background: "var(--bg-danger)", padding: 10, borderRadius: "var(--radius)" }}>
                Slette dette avviket?
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => deleteDeviation(dev.id)} style={{ ...primaryBtnStyle, background: "var(--text-danger)" }}>Ja, slett</button>
                  <button onClick={() => setConfirmDelete(null)} style={linkBtnStyle}>Avbryt</button>
                </div>
              </div>
            )}
          </Card>
        );
      })}

      {loading ? <Loading /> : visibleDeviations.length === 0 && (
        <Card style={{ textAlign: "center", color: "var(--text-secondary)" }}>Ingen registrerte avvik.</Card>
      )}
    </div>
  );
}

const secondaryBtnStyle = {
  background: "none", border: "1px solid var(--border)", color: "var(--text-primary)",
  padding: "6px 12px", borderRadius: "var(--radius)", fontSize: 12, cursor: "pointer",
};
