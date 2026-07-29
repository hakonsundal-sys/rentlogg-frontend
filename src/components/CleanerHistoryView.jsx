import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { apiFetch, API_URL } from "../api";
import { Card } from "./shared";

function photoUrl(filePath) {
  const filename = filePath.split(/[\\/]/).pop();
  return `${API_URL}/uploads/${filename}`;
}

const REPLY_ACTIONS = [
  { action: "resolve", label: "Lukk avvik" },
  { action: "assign_manager", label: "Send til driftsleder" },
  { action: "assign_customer", label: "Send til kunde" },
];

export default function CleanerHistoryView({ token, initials: sharedInitials }) {
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState("");
  const [expandedRunId, setExpandedRunId] = useState(null);
  const [runDetail, setRunDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    apiFetch("/checklists/my-runs", { token }).then(setRuns).catch((err) => setError(err.message));
  }, [token]);

  async function toggleRun(runId) {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      setRunDetail(null);
      return;
    }
    setExpandedRunId(runId);
    setRunDetail(null);
    setLoadingDetail(true);
    try {
      const data = await apiFetch(`/checklists/runs/${runId}`, { token });
      setRunDetail(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingDetail(false);
    }
  }

  function onReplied(updatedDeviation) {
    setRunDetail((d) => ({
      ...d,
      deviations: d.deviations.map((dev) => (dev.id === updatedDeviation.id ? { ...dev, ...updatedDeviation } : dev)),
    }));
    setRuns((list) =>
      list.map((r) =>
        r.id === expandedRunId ? { ...r, needs_response_count: Math.max(0, (r.needs_response_count || 0) - 1) } : r
      )
    );
  }

  if (runs === null) return <div style={{ color: "var(--text-secondary)" }}>Laster...</div>;

  return (
    <div>
      {error && <div style={{ color: "var(--text-danger)", fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {runs.length === 0 && (
        <Card style={{ textAlign: "center", color: "var(--text-secondary)" }}>Ingen tidligere sjekklister ennå.</Card>
      )}
      {runs.map((run) => (
        <Card key={run.id} style={{ marginBottom: 10, padding: 0, overflow: "hidden" }}>
          <div
            onClick={() => toggleRun(run.id)}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 14, cursor: "pointer" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {expandedRunId === run.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{run.site_name}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {run.started_at.slice(0, 16)} · {run.completed_at ? "Fullført" : "Pågår"}
                </div>
              </div>
            </div>
            {run.deviation_count > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap",
                background: run.needs_response_count > 0 ? "var(--bg-danger)" : "var(--surface-0)",
                color: run.needs_response_count > 0 ? "var(--text-danger)" : "var(--text-secondary)",
              }}>
                {run.needs_response_count > 0 ? `${run.needs_response_count} å svare på` : `${run.deviation_count} avvik`}
              </span>
            )}
          </div>

          {expandedRunId === run.id && (
            <div style={{ borderTop: "1px solid var(--border)", padding: 14 }}>
              {loadingDetail && <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>Laster...</div>}
              {runDetail && (
                <>
                  {runDetail.rooms?.length > 0 ? (
                    <>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Rom</div>
                      {runDetail.rooms.map((room) => (
                        <div key={room.id} style={{ padding: "6px 0" }}>
                          <div style={{ fontSize: 13, display: "flex", justifyContent: "space-between" }}>
                            <span>{room.name}</span>
                            <span style={{ color: "var(--text-secondary)" }}>
                              {room.items.filter((i) => i.done).length}/{room.items.length}
                            </span>
                          </div>
                          {room.photos?.length > 0 && (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                              {room.photos.map((p) => (
                                <a key={p.id} href={photoUrl(p.file_path)} target="_blank" rel="noreferrer">
                                  <img src={photoUrl(p.file_path)} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: "var(--radius-sm)" }} />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </>
                  ) : (
                    <>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Sjekkliste</div>
                      {runDetail.items.map((item) => (
                        <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                          {item.done
                            ? <CheckCircle2 size={14} style={{ color: "var(--text-success)" }} />
                            : <Circle size={14} style={{ color: "var(--text-muted)" }} />}
                          <span style={{ fontSize: 13 }}>{item.label}</span>
                        </div>
                      ))}
                    </>
                  )}

                  {runDetail.deviations?.length > 0 && (
                    <>
                      <div style={{ fontWeight: 600, fontSize: 13, marginTop: 16, marginBottom: 6, color: "var(--text-danger)" }}>Avvik</div>
                      {runDetail.deviations.map((dev) => (
                        <DeviationRow key={dev.id} token={token} deviation={dev} sharedInitials={sharedInitials} onReplied={onReplied} setError={setError} />
                      ))}
                    </>
                  )}
                  {(!runDetail.deviations || runDetail.deviations.length === 0) && (
                    <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 16 }}>Ingen avvik meldt for dette besøket.</div>
                  )}
                </>
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

const ASSIGNED_LABEL = { manager: "Sendt til driftsleder", customer: "Sendt til kunde" };

function DeviationRow({ token, deviation, sharedInitials, onReplied, setError }) {
  const [replyText, setReplyText] = useState("");
  const [replyInitials, setReplyInitials] = useState(sharedInitials || "");
  const [submitting, setSubmitting] = useState(false);

  async function reply(action) {
    if (!replyText.trim()) {
      setError("Skriv et svar før du sender.");
      return;
    }
    if (!replyInitials.trim()) {
      setError("Skriv inn navnet ditt for å svare.");
      return;
    }
    setSubmitting(true);
    try {
      const updated = await apiFetch(`/deviations/${deviation.id}/reply`, {
        token, method: "PATCH",
        body: JSON.stringify({ reply_text: replyText.trim(), initials: replyInitials.trim(), action }),
      });
      onReplied(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: "10px 0", borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <AlertTriangle size={14} style={{ color: "var(--text-danger)", marginTop: 2, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          {deviation.room_name && (
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {deviation.room_name}{deviation.room_task_label ? ` · ${deviation.room_task_label}` : ""}
            </div>
          )}
          <div style={{ fontSize: 13 }}>{deviation.description}</div>
          {deviation.reported_by_initials && (
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>Meldt av: {deviation.reported_by_initials}</div>
          )}
        </div>
      </div>

      {deviation.reply_text ? (
        <div style={{ marginTop: 8, marginLeft: 22, fontSize: 12, color: "var(--text-secondary)" }}>
          <div>Svar: {deviation.reply_text} — {deviation.replied_by_initials}</div>
          <div style={{ marginTop: 2 }}>
            {deviation.status === "resolved" ? "Lukket" : ASSIGNED_LABEL[deviation.assigned_to] || ""}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 8, marginLeft: 22 }}>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Svar på avviket..."
            style={{
              width: "100%", minHeight: 50, padding: 8, borderRadius: "var(--radius)",
              border: "1px solid var(--border)", background: "var(--surface-2)",
              color: "var(--text-primary)", fontSize: 13, resize: "vertical", boxSizing: "border-box",
            }}
          />
          <input
            value={replyInitials} onChange={(e) => setReplyInitials(e.target.value)}
            placeholder="Fullt navn" maxLength={60}
            style={{
              marginTop: 6, padding: "5px 8px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
              background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 13, width: 160,
            }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {REPLY_ACTIONS.map(({ action, label }) => (
              <button
                key={action} disabled={submitting} onClick={() => reply(action)}
                style={{
                  background: action === "resolve" ? "var(--text-success)" : "var(--surface-0)",
                  color: action === "resolve" ? "white" : "var(--text-secondary)",
                  border: action === "resolve" ? "none" : "1px solid var(--border)",
                  padding: "6px 12px", borderRadius: "var(--radius)", fontSize: 12, cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
