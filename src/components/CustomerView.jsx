import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Download } from "lucide-react";
import { apiFetch, downloadPdf, downloadZip } from "../api";
import { Card, StatusBadge } from "./shared";

const ASSIGNED_LABEL = { manager: "sendt til driftsleder", customer: "sendt til deg" };

function DeviationItem({ token, user, deviation: d, onApproved, setError }) {
  const [approveInitials, setApproveInitials] = useState(user?.name || "");
  const [approving, setApproving] = useState(false);
  const needsApproval = d.status === "resolved" && !d.customer_approved_at;

  async function approve() {
    if (!approveInitials.trim()) {
      setError("Skriv inn navnet ditt for å godkjenne.");
      return;
    }
    setApproving(true);
    try {
      const updated = await apiFetch(`/deviations/${d.id}/approve`, {
        token, method: "PATCH", body: JSON.stringify({ initials: approveInitials.trim() }),
      });
      onApproved(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setApproving(false);
    }
  }

  return (
    <div style={{ fontSize: 13, padding: "6px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-danger)" }}>
        <AlertTriangle size={14} /> {d.description} ({d.priority})
      </div>
      {(d.room_name || d.room_task_label) && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginLeft: 20 }}>
          {d.room_name}{d.room_task_label ? ` · ${d.room_task_label}` : ""}
        </div>
      )}
      {d.reported_by_initials && (
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginLeft: 20 }}>Meldt av: {d.reported_by_initials}</div>
      )}
      {d.reply_text && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginLeft: 20, marginTop: 4 }}>
          Svar: {d.reply_text} — {d.replied_by_initials}
          {d.assigned_to && ` (${ASSIGNED_LABEL[d.assigned_to] || d.assigned_to})`}
        </div>
      )}
      {needsApproval && (
        <div style={{ marginLeft: 20, marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--text-success)", display: "flex", alignItems: "center", gap: 4 }}>
            <CheckCircle2 size={13} /> Merket som utbedret
          </span>
          <input
            value={approveInitials} onChange={(e) => setApproveInitials(e.target.value)}
            placeholder="Fullt navn" maxLength={60}
            style={{
              padding: "5px 8px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
              background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 12, width: 140,
            }}
          />
          <button onClick={approve} disabled={approving} style={{
            background: "var(--text-success)", color: "white", border: "none",
            padding: "6px 12px", borderRadius: "var(--radius)", fontSize: 12, cursor: "pointer",
          }}>
            Godkjenn utbedring
          </button>
        </div>
      )}
    </div>
  );
}

export default function CustomerView({ token, user }) {
  const [sites, setSites] = useState([]);
  const [deviations, setDeviations] = useState([]);
  const [error, setError] = useState("");

  const [openFormSiteId, setOpenFormSiteId] = useState(null);
  const [formRooms, setFormRooms] = useState(null);
  const [formRoomId, setFormRoomId] = useState("");
  const [formTasks, setFormTasks] = useState([]);
  const [formTaskLabel, setFormTaskLabel] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPriority, setFormPriority] = useState("medium");
  const [formInitials, setFormInitials] = useState("");

  useEffect(() => {
    Promise.all([apiFetch("/sites", { token }), apiFetch("/deviations", { token })])
      .then(([sites, deviations]) => {
        setSites(sites);
        setDeviations(deviations);
      })
      .catch((err) => setError(err.message));
  }, [token]);

  async function openReportForm(site) {
    setOpenFormSiteId(site.id);
    setFormRoomId("");
    setFormTasks([]);
    setFormTaskLabel("");
    setFormDescription("");
    setFormPriority("medium");
    setFormInitials(user?.name || "");
    setFormRooms(null);
    try {
      setFormRooms(await apiFetch(`/sites/${site.id}/rooms`, { token }));
    } catch {
      setFormRooms([]);
    }
  }

  async function onRoomChange(roomId) {
    setFormRoomId(roomId);
    setFormTaskLabel("");
    if (!roomId) {
      setFormTasks([]);
      return;
    }
    try {
      setFormTasks(await apiFetch(`/rooms/${roomId}/items`, { token }));
    } catch {
      setFormTasks([]);
    }
  }

  async function submitReport(site) {
    if (!formDescription.trim()) return;
    if (!formInitials.trim()) {
      setError("Skriv inn navnet ditt for å melde avvik.");
      return;
    }
    try {
      await apiFetch("/deviations", {
        token, method: "POST",
        body: JSON.stringify({
          site_id: site.id,
          room_id: formRoomId || null,
          room_task_label: formTaskLabel || null,
          description: formDescription.trim(),
          priority: formPriority,
          initials: formInitials.trim(),
        }),
      });
      setOpenFormSiteId(null);
      setDeviations(await apiFetch("/deviations", { token }));
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <Card style={{ color: "var(--text-danger)" }}>{error}</Card>;

  return (
    <div>
      {sites.map((s) => {
        // A resolved avvik keeps showing until the customer actively approves it — that
        // signed confirmation is the point, not just letting it quietly disappear once the
        // cleaner says it's done.
        const siteDeviations = deviations.filter(
          (d) => d.site_id === s.id && (d.status !== "resolved" || !d.customer_approved_at)
        );
        return (
          <Card key={s.id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 500 }}>{s.name}</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                  <Clock size={13} /> Sist rengjort: {s.last_cleaned_at || "Aldri"}
                </div>
              </div>
              <StatusBadge status={s.status} />
            </div>

            {siteDeviations.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                {siteDeviations.map((d) => (
                  <DeviationItem
                    key={d.id} token={token} user={user} deviation={d}
                    onApproved={(updated) => setDeviations((list) => list.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)))}
                    setError={setError}
                  />
                ))}
              </div>
            )}

            {openFormSiteId === s.id ? (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                {formRooms === null && <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Laster rom...</div>}
                {formRooms?.length > 0 && (
                  <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <select value={formRoomId} onChange={(e) => onRoomChange(e.target.value)} style={selectStyle}>
                      <option value="">Generelt (ikke rom-spesifikt)</option>
                      {formRooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    {formRoomId && (
                      <select value={formTaskLabel} onChange={(e) => setFormTaskLabel(e.target.value)} style={selectStyle}>
                        <option value="">Generelt for rommet</option>
                        {formTasks.map((t) => <option key={t.id} value={t.label}>{t.label}</option>)}
                      </select>
                    )}
                  </div>
                )}
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Beskriv avviket..."
                  style={{
                    width: "100%", minHeight: 70, padding: 10, borderRadius: "var(--radius)",
                    border: "1px solid var(--border)", background: "var(--surface-2)",
                    color: "var(--text-primary)", fontSize: 14, resize: "vertical", boxSizing: "border-box",
                  }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <select value={formPriority} onChange={(e) => setFormPriority(e.target.value)} style={selectStyle}>
                    <option value="low">Lav</option>
                    <option value="medium">Middels</option>
                    <option value="high">Høy</option>
                  </select>
                  <input
                    value={formInitials} onChange={(e) => setFormInitials(e.target.value)}
                    placeholder="Fullt navn" maxLength={60}
                    style={{
                      padding: "7px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
                      background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 13, width: 160,
                    }}
                  />
                  <button onClick={() => setOpenFormSiteId(null)} style={{ ...secondaryBtnStyle }}>Avbryt</button>
                  <button onClick={() => submitReport(s)} style={primaryBtnStyle}>Send avvik</button>
                </div>
              </div>
            ) : (
              <button onClick={() => openReportForm(s)} style={{ ...secondaryBtnStyle, marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <AlertTriangle size={13} /> Meld avvik
              </button>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                onClick={() => downloadPdf(`/reports/sites/${s.id}/pdf`, token, `rapport-${s.id}.pdf`)}
                style={secondaryBtnStyle}
              >
                Last ned rapport (PDF)
              </button>
              <button
                onClick={() => downloadZip(`/reports/sites/${s.id}/photos.zip`, token, `bilder-${s.id}.zip`).catch((err) => setError(err.message))}
                style={{ ...secondaryBtnStyle, display: "flex", alignItems: "center", gap: 6 }}
              >
                <Download size={13} /> Last ned alle bilder
              </button>
            </div>
          </Card>
        );
      })}
      {sites.length === 0 && (
        <Card style={{ textAlign: "center", color: "var(--text-secondary)" }}>Ingen lokasjoner registrert for denne kunden ennå.</Card>
      )}
    </div>
  );
}

const secondaryBtnStyle = {
  background: "none", border: "1px solid var(--border)", borderRadius: "var(--radius)",
  padding: "6px 12px", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)",
};
const primaryBtnStyle = {
  background: "var(--accent-orange)", color: "white", border: "none",
  padding: "7px 14px", borderRadius: "var(--radius)", fontSize: 12, cursor: "pointer",
};
const selectStyle = {
  padding: "7px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
  background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 13,
};
