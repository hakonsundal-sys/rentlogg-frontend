import { useEffect, useState } from "react";
import { Sparkles, X, ClipboardList, CheckCircle2, Circle, Clock, AlertTriangle } from "lucide-react";
import { apiFetch, API_URL } from "../../api";
import { Card } from "../shared";

const ROLE_CHIP = { admin: "Administrator", manager: "Driftsleder" };

const RUN_FILTERS = [
  { key: "all", label: "Alle" },
  { key: "in_progress", label: "Pågående" },
  { key: "completed", label: "Fullført" },
];

function photoUrl(filePath) {
  const filename = filePath.split(/[\\/]/).pop();
  return `${API_URL}/uploads/${filename}`;
}

export default function DashboardPage({ token, user, summary }) {
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [runs, setRuns] = useState([]);
  const [deviations, setDeviations] = useState([]);
  const [runFilter, setRunFilter] = useState("all");
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [runDetail, setRunDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/checklists/runs", { token }).then(setRuns).catch((err) => setError(err.message));
    apiFetch("/deviations", { token }).then(setDeviations).catch(() => {});
  }, [token]);

  async function openRunDetail(runId) {
    setSelectedRunId(runId);
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

  function closeRunDetail() {
    setSelectedRunId(null);
    setRunDetail(null);
  }

  if (!summary) return <div style={{ color: "var(--text-secondary)" }}>Laster...</div>;

  const filteredRuns = runs.filter((r) => {
    if (runFilter === "completed") return !!r.completed_at;
    if (runFilter === "in_progress") return !r.completed_at;
    return true;
  });
  const runDeviations = runDetail ? deviations.filter((d) => d.run_id === runDetail.id) : [];

  const activity = [
    ...summary.recentActivity.map((a) => ({
      key: `run-${a.id}`,
      title: a.siteName,
      subtitle: `${a.cleanerName} · ${a.status === "completed" ? "Fullført" : "Pågår"}${a.signedInitials ? ` · signert ${a.signedInitials}` : ""}`,
      badge: a.status === "completed" ? "FULLFØRT" : "PÅGÅR",
      badgeColor: a.status === "completed" ? "var(--text-success)" : "var(--accent-orange-dark)",
      badgeBg: a.status === "completed" ? "var(--c-teal)" : "var(--accent-orange-bg)",
    })),
    ...summary.plannedToday.map((p) => ({
      key: `planned-${p.siteId}`,
      title: p.siteName,
      subtitle: p.assignedCleanerName ? `${p.assignedCleanerName} · Tildelt` : "Ikke tildelt",
      badge: "PLANLAGT",
      badgeColor: "var(--text-secondary)",
      badgeBg: "var(--surface-0)",
    })),
  ];

  return (
    <div>
      <div style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 999, background: "var(--accent-orange-bg)", color: "var(--accent-orange-dark)", fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
        <Sparkles size={12} style={{ marginRight: 4 }} /> {ROLE_CHIP[user.role] || user.role}
      </div>
      <h1 style={{ fontSize: 28, margin: "0 0 4px" }}>Hei {user.name} 👋</h1>
      <div style={{ color: "var(--text-secondary)", marginBottom: 24 }}>Oversikt over driften</div>

      {showOnboarding && (
        <Card style={{ marginBottom: 24, position: "relative" }}>
          <button onClick={() => setShowOnboarding(false)} style={{
            position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)",
          }}>
            <X size={16} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, marginBottom: 10 }}>
            💡 Første gangs oppsett
          </div>
          <div style={{ color: "var(--text-secondary)", marginBottom: 8 }}>Slik kommer du i gang. Det er tre enkle steg:</div>
          <ol style={{ margin: 0, paddingLeft: 20, color: "var(--text-primary)", lineHeight: 1.8 }}>
            <li><strong>Opprett kunde</strong> — gå til <em>Kunder</em> og legg til firmaet du skal vaske for.</li>
            <li><strong>Opprett lokasjon</strong> — gå inn på kunden og legg til bygningen eller etasjen som skal rengjøres.</li>
            <li><strong>Inviter folk</strong> — send lenke til kunden, driftslederen og renholderne som skal bruke appen.</li>
          </ol>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        <StatCard icon={ClipboardList} label="Oppdrag totalt" value={summary.totalRunsToday + summary.plannedToday.length} />
        <StatCard icon={CheckCircle2} label="Fullført" value={summary.completedToday} color="var(--text-success)" />
        <StatCard icon={Clock} label="Pågående" value={summary.inProgressToday} color="var(--accent-orange-dark)" />
        <StatCard icon={AlertTriangle} label="Åpne avvik" value={summary.openDeviationsCount} color="var(--text-danger)" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 16 }}>
        <Card>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Siste aktivitet</div>
          {activity.length === 0 && <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>Ingen aktivitet i dag ennå.</div>}
          {activity.map((a) => (
            <div key={a.key} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 0", borderTop: "1px solid var(--border)",
            }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{a.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{a.subtitle}</div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 999,
                background: a.badgeBg, color: a.badgeColor,
              }}>
                {a.badge}
              </span>
            </div>
          ))}
        </Card>

        <div style={{
          background: "linear-gradient(135deg, var(--accent-orange), var(--accent-orange-dark))",
          borderRadius: 12, padding: 20, color: "white",
        }}>
          <div style={{ fontSize: 13, opacity: 0.9 }}>Aktive lokasjoner</div>
          <div style={{ fontSize: 40, fontWeight: 700, margin: "4px 0" }}>{summary.activeSites}</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Oversikt over alle dine lokasjoner.</div>
        </div>
      </div>

      {error && <div style={{ color: "var(--text-danger)", fontSize: 13, marginTop: 16 }}>{error}</div>}

      <Card style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontWeight: 600 }}>Alle oppdrag</div>
          <div style={{ display: "flex", gap: 6 }}>
            {RUN_FILTERS.map((f) => (
              <button key={f.key} onClick={() => setRunFilter(f.key)} style={{
                padding: "4px 10px", borderRadius: 999, fontSize: 12, cursor: "pointer",
                border: runFilter === f.key ? "1px solid var(--accent-orange)" : "1px solid var(--border)",
                background: runFilter === f.key ? "var(--accent-orange-bg)" : "var(--surface-0)",
                color: runFilter === f.key ? "var(--accent-orange-dark)" : "var(--text-secondary)",
              }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {filteredRuns.length === 0 && <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>Ingen oppdrag ennå.</div>}
        {filteredRuns.map((r) => (
          <div key={r.id} onClick={() => openRunDetail(r.id)} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 0", borderTop: "1px solid var(--border)", cursor: "pointer",
          }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>{r.site_name}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {r.cleaner_name} · {r.started_at.slice(0, 16)}
              </div>
            </div>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 999,
              background: r.completed_at ? "var(--c-teal)" : "var(--accent-orange-bg)",
              color: r.completed_at ? "var(--text-success)" : "var(--accent-orange-dark)",
            }}>
              {r.completed_at ? "FULLFØRT" : "PÅGÅR"}
            </span>
          </div>
        ))}
      </Card>

      {selectedRunId && (
        <div
          onClick={closeRunDetail}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "var(--surface-1)", borderRadius: "var(--radius-lg)", padding: 24,
            maxWidth: 480, width: "100%", maxHeight: "85vh", overflowY: "auto",
          }}>
            {loadingDetail && <div style={{ color: "var(--text-secondary)" }}>Laster...</div>}
            {runDetail && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 16 }}>{runDetail.site_name}</div>
                    {runDetail.site_address && <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{runDetail.site_address}</div>}
                  </div>
                  <button onClick={closeRunDetail} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
                    <X size={18} />
                  </button>
                </div>

                <div style={{ marginTop: 12, fontSize: 13, color: "var(--text-secondary)", display: "grid", gap: 4 }}>
                  <div>Renholder: <strong style={{ color: "var(--text-primary)" }}>{runDetail.cleaner_name}</strong></div>
                  <div>Startet: {runDetail.started_at.slice(0, 16)}</div>
                  {runDetail.completed_at && <div>Fullført: {runDetail.completed_at.slice(0, 16)}</div>}
                  {runDetail.signed_initials && (
                    <div>Signert: <strong style={{ color: "var(--text-primary)" }}>{runDetail.signed_initials}</strong></div>
                  )}
                  <div>{runDetail.gps_verified ? "Posisjon bekreftet" : "Posisjon ikke bekreftet"}</div>
                </div>

                <div style={{ marginTop: 16, fontWeight: 600, fontSize: 13 }}>Sjekkliste</div>
                {runDetail.items.map((item) => (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid var(--border)" }}>
                    {item.done
                      ? <CheckCircle2 size={15} style={{ color: "var(--text-success)" }} />
                      : <Circle size={15} style={{ color: "var(--text-muted)" }} />}
                    <span style={{
                      fontSize: 13, textDecoration: item.done ? "line-through" : "none",
                      color: item.done ? "var(--text-secondary)" : "var(--text-primary)",
                    }}>
                      {item.label}
                    </span>
                  </div>
                ))}

                {runDetail.photos.length > 0 && (
                  <>
                    <div style={{ marginTop: 16, fontWeight: 600, fontSize: 13 }}>Bilder</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                      {runDetail.photos.map((p) => (
                        <a key={p.id} href={photoUrl(p.file_path)} target="_blank" rel="noreferrer">
                          <img src={photoUrl(p.file_path)} alt="" style={{ width: 70, height: 70, objectFit: "cover", borderRadius: "var(--radius-sm)" }} />
                        </a>
                      ))}
                    </div>
                  </>
                )}

                {runDeviations.length > 0 && (
                  <>
                    <div style={{ marginTop: 16, fontWeight: 600, fontSize: 13, color: "var(--text-danger)" }}>Avvik</div>
                    {runDeviations.map((d) => (
                      <div key={d.id} style={{ fontSize: 13, color: "var(--text-danger)", padding: "6px 0", borderTop: "1px solid var(--border)" }}>
                        {d.description}
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <Card>
      <Icon size={18} style={{ color: color || "var(--text-secondary)", marginBottom: 10 }} />
      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600 }}>{value}</div>
    </Card>
  );
}
