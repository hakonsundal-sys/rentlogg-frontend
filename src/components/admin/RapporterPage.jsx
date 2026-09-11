import { useEffect, useState } from "react";
import { Download, CheckCircle2, FileText, Clock, AlertTriangle, Send, X, Pencil } from "lucide-react";
import { apiFetch, downloadCsv, downloadPdf, viewHtmlReport, API_URL } from "../../api";
import { isNetworkError } from "../../offlineQueue";
import { Card, primaryBtnStyle } from "../shared";
import RoomGrid from "../RoomGrid";
import RunRoomsAndItems from "../RunRoomsAndItems";

function currentMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date()).slice(0, 7);
}

// Same "what calendar day just ended" offset as the backend's yesterdayInOslo() — the digest
// normally runs at 07:00 for the previous day, so that's the sensible default here too.
function yesterdayInOslo() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(d);
}

const STATUS_LABEL = { completed: "Fullført", in_progress: "Pågår", missing: "Manglende" };

function photoUrl(filePath) {
  const filename = filePath.split(/[\\/]/).pop();
  return `${API_URL}/uploads/${filename}`;
}

export default function RapporterPage({ token }) {
  const [sites, setSites] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [month, setMonth] = useState(currentMonth());
  const [siteId, setSiteId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [report, setReport] = useState(null);
  const [grid, setGrid] = useState(null);
  const [error, setError] = useState("");
  const [digestDate, setDigestDate] = useState(yesterdayInOslo());
  const [digestSiteId, setDigestSiteId] = useState("");
  const [digestRecipients, setDigestRecipients] = useState([]); // checked subset of the selected site's own recipients
  const [digestSending, setDigestSending] = useState(false);
  const [digestResult, setDigestResult] = useState(null);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [runDetail, setRunDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [isEditingRun, setIsEditingRun] = useState(false);
  const [editInitials, setEditInitials] = useState("");

  useEffect(() => {
    apiFetch("/sites", { token }).then(setSites).catch((err) => setError(err.message));
    apiFetch("/departments", { token }).then(setDepartments).catch(() => {});
  }, [token]);

  const digestSiteRecipients = digestSiteId
    ? (sites.find((s) => s.id === Number(digestSiteId))?.report_recipients || "").split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  // Picking a location resets the checkbox list to "everyone configured for it" — matches
  // today's default behavior (send to all) unless someone actively narrows it down.
  useEffect(() => {
    setDigestRecipients(digestSiteRecipients);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digestSiteId]);

  function toggleDigestRecipient(email) {
    setDigestRecipients((list) => (list.includes(email) ? list.filter((e) => e !== email) : [...list, email]));
  }

  useEffect(() => {
    const params = new URLSearchParams({
      month,
      ...(siteId ? { site_id: siteId } : {}),
      ...(!siteId && departmentId ? { department_id: departmentId } : {}),
    });
    apiFetch(`/reports/summary?${params}`, { token }).then(setReport).catch((err) => setError(err.message));
  }, [token, month, siteId, departmentId]);

  // The room x day "vaskeplan" grid only makes sense for one location at a time — 32 rooms x
  // 30 days is already a lot of cells, showing every location's rooms at once would be unreadable.
  useEffect(() => {
    if (!siteId) {
      setGrid(null);
      return;
    }
    apiFetch(`/sites/${siteId}/rooms/monthly-grid?month=${month}`, { token }).then(setGrid).catch((err) => setError(err.message));
  }, [token, siteId, month]);

  // Opens the same day's checklist a vaskeplan cell was clicked for, then scrolls straight to
  // the room that was actually clicked — with 32 rooms in a run, hunting for the right one
  // would defeat the point of linking the grid to the checklist in the first place.
  async function openRunDetail(runId, roomId) {
    setSelectedRunId(runId);
    setIsEditingRun(false);
    setEditInitials("");
    setLoadingDetail(true);
    try {
      const data = await apiFetch(`/checklists/runs/${runId}`, { token });
      setRunDetail(data);
      if (roomId) {
        setTimeout(() => {
          document.getElementById(`room-${roomId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 50);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingDetail(false);
    }
  }

  function closeRunDetail() {
    setSelectedRunId(null);
    setRunDetail(null);
    setIsEditingRun(false);
  }

  async function refreshRunDetail() {
    try {
      setRunDetail(await apiFetch(`/checklists/runs/${selectedRunId}`, { token }));
    } catch (err) {
      // A mutation just made via RunRoomsAndItems may have been queued offline rather than sent
      // — there's nothing new to fetch yet, so a network failure here isn't a real error to show.
      if (!isNetworkError(err)) setError(err.message);
    }
  }

  function exportCsv() {
    const params = new URLSearchParams({
      month,
      ...(siteId ? { site_id: siteId } : {}),
      ...(!siteId && departmentId ? { department_id: departmentId } : {}),
    });
    downloadCsv(`/reports/summary.csv?${params}`, token, `rapport-${month}.csv`).catch((err) => setError(err.message));
  }

  async function sendDigestNow() {
    if (digestSiteId && digestSiteRecipients.length > 0 && digestRecipients.length === 0) {
      setError("Velg minst én mottaker, eller fjern lokasjonsvalget for å sende til alle.");
      return;
    }
    setError("");
    setDigestResult(null);
    setDigestSending(true);
    try {
      const result = await apiFetch("/reports/daily-digest/run", {
        token, method: "POST",
        body: JSON.stringify({
          date: digestDate,
          ...(digestSiteId ? { site_id: digestSiteId, recipients: digestRecipients } : {}),
        }),
      });
      setDigestResult(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setDigestSending(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Rapporter</h1>
          <div style={{ color: "var(--text-secondary)" }}>Månedlig oversikt per lokasjon</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={inputStyle} />
          {departments.length > 0 && (
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} style={inputStyle}>
              <option value="">Alle avdelinger</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)} style={inputStyle}>
            <option value="">Alle lokasjoner</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={exportCsv} style={primaryBtnStyle}>
            <Download size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> Eksporter CSV
          </button>
        </div>
      </div>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600 }}>Send daglig rapport manuelt</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              Sender den vanlige 07:00-digesten for valgt dato på nytt — til alle lokasjoner med mottakere satt, eller kun én.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select value={digestSiteId} onChange={(e) => setDigestSiteId(e.target.value)} style={inputStyle}>
              <option value="">Alle lokasjoner</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="date" value={digestDate} onChange={(e) => setDigestDate(e.target.value)} style={inputStyle} />
            <button onClick={sendDigestNow} disabled={digestSending} style={primaryBtnStyle}>
              <Send size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> {digestSending ? "Sender..." : "Send nå"}
            </button>
          </div>
        </div>
        {digestSiteId && digestSiteRecipients.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>
              Mottakere for denne lokasjonen
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {digestSiteRecipients.map((email) => (
                <label key={email} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={digestRecipients.includes(email)}
                    onChange={() => toggleDigestRecipient(email)}
                  />
                  {email}
                </label>
              ))}
            </div>
          </div>
        )}
        {digestSiteId && digestSiteRecipients.length === 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)", fontSize: 13, color: "var(--text-secondary)" }}>
            Denne lokasjonen har ingen rapport-mottakere satt opp ennå.
          </div>
        )}
        {digestResult && (
          <div style={{ marginTop: 12, fontSize: 13, color: "var(--text-secondary)" }}>
            {digestResult.sent} sendt, {digestResult.skipped} hoppet over, {digestResult.failed} feilet ({digestResult.date})
          </div>
        )}
      </Card>

      {error && <div style={{ color: "var(--text-danger)", marginBottom: 12 }}>{error}</div>}

      {report && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            <StatCard icon={CheckCircle2} label="Oppmøte" value={`${report.attendancePct}%`} color="var(--text-success)" />
            <StatCard icon={FileText} label="Planlagte dager" value={report.plannedDays} />
            <StatCard icon={Clock} label="Fullførte dager" value={report.completedDays} color="var(--accent-orange-dark)" />
            <StatCard icon={AlertTriangle} label="Manglende dager" value={report.missingDays} color="var(--text-danger)" />
          </div>

          <Card style={{ padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "var(--surface-0)", textAlign: "left" }}>
                  <th style={thStyle}>Dato</th>
                  <th style={thStyle}>Lokasjon</th>
                  <th style={thStyle}>Planlagt</th>
                  <th style={thStyle}>Rom</th>
                  <th style={thStyle}>Fullført</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={tdStyle}>{row.date}</td>
                    <td style={tdStyle}>{row.site_name}</td>
                    <td style={tdStyle}>{STATUS_LABEL[row.status]}</td>
                    <td style={tdStyle}>{row.room_count}</td>
                    <td style={tdStyle}>{row.tasksCompleted}/{row.tasksTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.rows.length === 0 && (
              <div style={{ padding: 16, color: "var(--text-secondary)", fontSize: 13, textAlign: "center" }}>
                Ingen data for valgt periode ennå.
              </div>
            )}
          </Card>

          {siteId && grid && grid.rooms.length > 0 && (
            <RoomGrid
              grid={grid} month={month}
              siteName={sites.find((s) => s.id === Number(siteId))?.name}
              onOpenRun={openRunDetail}
            />
          )}
          {siteId && grid && grid.rooms.length === 0 && (
            <div style={{ marginTop: 12, color: "var(--text-secondary)", fontSize: 13 }}>
              Denne lokasjonen har ingen rom å vise vaskeplan for.
            </div>
          )}
        </>
      )}

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
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                  <button
                    onClick={() => viewHtmlReport(`/reports/runs/${runDetail.id}/html`, token).catch((err) => setError(err.message))}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      background: "var(--surface-0)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
                      padding: "8px 12px", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)",
                    }}
                  >
                    <FileText size={14} /> Vis rapport
                  </button>
                  <button
                    onClick={() => downloadPdf(`/reports/runs/${runDetail.id}/pdf`, token, `rapport-besok-${runDetail.id}.pdf`).catch((err) => setError(err.message))}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      background: "var(--surface-0)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
                      padding: "8px 12px", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)",
                    }}
                  >
                    <Download size={14} /> Last ned PDF
                  </button>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{runDetail.rooms?.length > 0 ? "Rom" : "Sjekkliste"}</div>
                  {!isEditingRun ? (
                    <button
                      onClick={() => setIsEditingRun(true)}
                      style={{
                        display: "flex", alignItems: "center", gap: 4, background: "none", border: "none",
                        color: "var(--accent-orange-dark)", fontSize: 12, fontWeight: 500, cursor: "pointer",
                      }}
                    >
                      <Pencil size={12} /> Rediger
                    </button>
                  ) : (
                    <button onClick={() => setIsEditingRun(false)} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: 12, cursor: "pointer" }}>
                      Ferdig
                    </button>
                  )}
                </div>
                {isEditingRun && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Signatur (navn)</label>
                    <input
                      value={editInitials} onChange={(e) => setEditInitials(e.target.value)}
                      placeholder="Fullt navn" maxLength={60}
                      style={{
                        padding: "4px 8px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
                        background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 12, width: 150,
                      }}
                    />
                  </div>
                )}
                <RunRoomsAndItems
                  token={token} runDetail={runDetail} editable={isEditingRun} editInitials={editInitials}
                  onChanged={refreshRunDetail} setError={setError}
                />

                {runDetail.photos.length > 0 && runDetail.rooms?.length > 0 && (
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
      <div style={{ fontSize: 24, fontWeight: 600 }}>{value}</div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</div>
    </Card>
  );
}

const inputStyle = {
  padding: "8px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
  background: "var(--surface-1)", color: "var(--text-primary)", fontSize: 13,
};
const thStyle = { padding: 12, fontWeight: 500 };
const tdStyle = { padding: 12 };
