import { useEffect, useState } from "react";
import { Download, CheckCircle2, FileText, Clock, AlertTriangle, Send } from "lucide-react";
import { apiFetch, downloadCsv } from "../../api";
import { Card } from "../shared";

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

export default function RapporterPage({ token }) {
  const [sites, setSites] = useState([]);
  const [month, setMonth] = useState(currentMonth());
  const [siteId, setSiteId] = useState("");
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [digestDate, setDigestDate] = useState(yesterdayInOslo());
  const [digestSiteId, setDigestSiteId] = useState("");
  const [digestSending, setDigestSending] = useState(false);
  const [digestResult, setDigestResult] = useState(null);

  useEffect(() => {
    apiFetch("/sites", { token }).then(setSites).catch((err) => setError(err.message));
  }, [token]);

  useEffect(() => {
    const params = new URLSearchParams({ month, ...(siteId ? { site_id: siteId } : {}) });
    apiFetch(`/reports/summary?${params}`, { token }).then(setReport).catch((err) => setError(err.message));
  }, [token, month, siteId]);

  function exportCsv() {
    const params = new URLSearchParams({ month, ...(siteId ? { site_id: siteId } : {}) });
    downloadCsv(`/reports/summary.csv?${params}`, token, `rapport-${month}.csv`).catch((err) => setError(err.message));
  }

  async function sendDigestNow() {
    setError("");
    setDigestResult(null);
    setDigestSending(true);
    try {
      const result = await apiFetch("/reports/daily-digest/run", {
        token, method: "POST", body: JSON.stringify({ date: digestDate, ...(digestSiteId ? { site_id: digestSiteId } : {}) }),
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
                  <th style={thStyle}>Oppgaver</th>
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
        </>
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

const primaryBtnStyle = {
  background: "var(--accent-orange)", color: "white", border: "none",
  padding: "9px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
};
const inputStyle = {
  padding: "8px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
  background: "var(--surface-1)", color: "var(--text-primary)", fontSize: 13,
};
const thStyle = { padding: 12, fontWeight: 500 };
const tdStyle = { padding: 12 };
