import { useEffect, useState } from "react";
import { Info, AlertTriangle, CircleAlert, MapPin, Clock } from "lucide-react";
import { apiFetch } from "../../api";
import { Card } from "../shared";

const PRIORITY = {
  low: { label: "Lav", icon: Info, color: "var(--text-secondary)" },
  medium: { label: "Middels", icon: AlertTriangle, color: "var(--accent-orange-dark)" },
  high: { label: "Høy", icon: CircleAlert, color: "var(--text-danger)" },
};
const STATUS_LABEL = { open: "ÅPEN", in_progress: "PÅGÅR", resolved: "LØST" };

export default function AvvikPage({ token, refreshSummary }) {
  const [deviations, setDeviations] = useState([]);
  const [sites, setSites] = useState([]);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", priority: "medium" });
  const [confirmDelete, setConfirmDelete] = useState(null);

  function loadAll() {
    Promise.all([apiFetch("/deviations", { token }), apiFetch("/sites", { token })])
      .then(([devData, sitesData]) => {
        setDeviations(devData);
        setSites(sitesData);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(loadAll, [token]);

  const siteName = (id) => sites.find((s) => s.id === id)?.name || "—";

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
      <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Avvik</h1>
      <div style={{ color: "var(--text-secondary)", marginBottom: 20 }}>{deviations.length} registrerte avvik</div>

      {error && <div style={{ color: "var(--text-danger)", marginBottom: 12 }}>{error}</div>}

      {deviations.map((dev) => {
        const p = PRIORITY[dev.priority] || PRIORITY.medium;
        const Icon = p.icon;
        return (
          <Card key={dev.id} style={{ marginBottom: 12 }}>
            {editingId === dev.id ? (
              <div>
                <input
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  placeholder="Tittel"
                  style={{ ...inputStyle, marginBottom: 8 }}
                />
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  style={{ ...inputStyle, minHeight: 60, marginBottom: 8, resize: "vertical" }}
                />
                <select
                  value={editForm.priority}
                  onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                  style={{ ...inputStyle, marginBottom: 8, width: 160 }}
                >
                  <option value="low">Lav</option>
                  <option value="medium">Middels</option>
                  <option value="high">Høy</option>
                </select>
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
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", gap: 10, marginTop: 6 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 3 }}><MapPin size={12} /> {siteName(dev.site_id)}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Clock size={12} /> {dev.created_at}</span>
                      <span style={{ fontWeight: 600, color: p.color }}>{p.label}</span>
                    </div>
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

      {deviations.length === 0 && <Card style={{ textAlign: "center", color: "var(--text-secondary)" }}>Ingen registrerte avvik.</Card>}
    </div>
  );
}

const primaryBtnStyle = {
  background: "var(--accent-orange)", color: "white", border: "none",
  padding: "8px 14px", borderRadius: "var(--radius)", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const secondaryBtnStyle = {
  background: "none", border: "1px solid var(--border)", color: "var(--text-primary)",
  padding: "6px 12px", borderRadius: "var(--radius)", fontSize: 12, cursor: "pointer",
};
const linkBtnStyle = {
  background: "none", border: "none", color: "var(--accent-orange-dark)", fontSize: 12, cursor: "pointer", fontWeight: 500,
};
const inputStyle = {
  padding: "8px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
  background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 14, boxSizing: "border-box", width: "100%",
};
