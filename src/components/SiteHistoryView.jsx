import { useEffect, useState } from "react";
import { X, ChevronDown, ChevronRight, CheckCircle2, Circle } from "lucide-react";
import { apiFetch, API_URL } from "../api";
import { DeviationItem } from "./DeviationItem";

function photoUrl(filePath) {
  const filename = filePath.split(/[\\/]/).pop();
  return `${API_URL}/uploads/${filename}`;
}

function tabBtnStyle(active) {
  return {
    padding: "6px 14px", borderRadius: 999, fontSize: 13, cursor: "pointer",
    border: active ? "1px solid var(--accent-orange)" : "1px solid var(--border)",
    background: active ? "var(--accent-orange-bg)" : "var(--surface-0)",
    color: active ? "var(--accent-orange-dark)" : "var(--text-secondary)",
  };
}

// Site-scoped visit timeline + full avvik history for the customer role — "Se historikk"
// lets them browse past visits beyond the PDF report's last-20 cap, and see avvik for this
// site across all statuses/dates, not just currently-open ones.
export default function SiteHistoryView({ token, user, site, deviations, onApproved, setError, onClose }) {
  const [tab, setTab] = useState("visits");
  const [runs, setRuns] = useState([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState(null);
  const [runDetails, setRunDetails] = useState({});

  async function loadRuns(before) {
    setLoadingRuns(true);
    try {
      const params = before ? `?before=${before}` : "";
      const data = await apiFetch(`/checklists/site-runs/${site.id}${params}`, { token });
      setRuns((prev) => (before ? [...prev, ...data.runs] : data.runs));
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingRuns(false);
    }
  }

  useEffect(() => {
    loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.id]);

  async function toggleRun(runId) {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      return;
    }
    setExpandedRunId(runId);
    if (!runDetails[runId]) {
      try {
        const detail = await apiFetch(`/checklists/runs/${runId}`, { token });
        setRunDetails((d) => ({ ...d, [runId]: detail }));
      } catch (err) {
        setError(err.message);
      }
    }
  }

  const sortedDeviations = [...deviations].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface-1)", borderRadius: "var(--radius-lg)", padding: 20,
          maxWidth: 540, width: "100%", maxHeight: "85vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 16 }}>{site.name} — Historikk</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          <button onClick={() => setTab("visits")} style={tabBtnStyle(tab === "visits")}>Besøk</button>
          <button onClick={() => setTab("deviations")} style={tabBtnStyle(tab === "deviations")}>Avvik ({sortedDeviations.length})</button>
        </div>

        {tab === "visits" && (
          <>
            {runs.map((run) => (
              <div key={run.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", marginBottom: 8, overflow: "hidden" }}>
                <div
                  onClick={() => toggleRun(run.id)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 10, cursor: "pointer" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {expandedRunId === run.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{run.started_at.slice(0, 16)}</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{run.cleaner_name}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {run.deviation_count > 0 && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999,
                        background: "var(--bg-danger)", color: "var(--text-danger)",
                      }}>
                        {run.deviation_count} avvik
                      </span>
                    )}
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999,
                      background: run.completed_at ? "var(--c-teal)" : "var(--accent-orange-bg)",
                      color: run.completed_at ? "var(--text-success)" : "var(--accent-orange-dark)",
                    }}>
                      {run.completed_at ? "FULLFØRT" : "PÅGÅR"}
                    </span>
                  </div>
                </div>
                {expandedRunId === run.id && (
                  <div style={{ borderTop: "1px solid var(--border)", padding: 10 }}>
                    {!runDetails[run.id] && <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Laster...</div>}
                    {runDetails[run.id] && <RunDetail detail={runDetails[run.id]} />}
                  </div>
                )}
              </div>
            ))}
            {runs.length === 0 && !loadingRuns && (
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Ingen besøk registrert ennå.</div>
            )}
            {hasMore && (
              <button
                onClick={() => loadRuns(runs[runs.length - 1].id)}
                disabled={loadingRuns}
                style={{
                  width: "100%", marginTop: 8, background: "var(--surface-0)", border: "1px solid var(--border)",
                  borderRadius: "var(--radius)", padding: "8px", fontSize: 13, cursor: "pointer", color: "var(--text-secondary)",
                }}
              >
                {loadingRuns ? "Laster..." : "Last flere"}
              </button>
            )}
          </>
        )}

        {tab === "deviations" && (
          <>
            {sortedDeviations.map((d) => (
              <div key={d.id} style={{ borderTop: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", paddingTop: 8 }}>{d.created_at.slice(0, 16)}</div>
                <DeviationItem token={token} user={user} deviation={d} onApproved={onApproved} setError={setError} />
              </div>
            ))}
            {sortedDeviations.length === 0 && (
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Ingen avvik registrert for denne lokasjonen.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RunDetail({ detail }) {
  return (
    <>
      {detail.rooms?.length > 0 ? (
        detail.rooms.map((room) => (
          <div key={room.id} style={{ padding: "6px 0" }}>
            <div style={{ fontSize: 13, display: "flex", justifyContent: "space-between" }}>
              <span>{room.name}</span>
              <span style={{ color: "var(--text-secondary)" }}>{room.items.filter((i) => i.done).length}/{room.items.length}</span>
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
        ))
      ) : (
        <>
          {detail.items.map((item) => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
              {item.done
                ? <CheckCircle2 size={13} style={{ color: "var(--text-success)" }} />
                : <Circle size={13} style={{ color: "var(--text-muted)" }} />}
              <span style={{ fontSize: 13 }}>{item.label}</span>
            </div>
          ))}
          {detail.photos?.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {detail.photos.map((p) => (
                <a key={p.id} href={photoUrl(p.file_path)} target="_blank" rel="noreferrer">
                  <img src={photoUrl(p.file_path)} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: "var(--radius-sm)" }} />
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
