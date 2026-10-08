import { useEffect, useState } from "react";
import { Download, CheckCircle2, FileText, Clock, AlertTriangle, Send } from "lucide-react";
import { apiFetch, downloadCsv, downloadZip } from "../../api";
import { Card, Field, Loading, TabButton, primaryBtnStyle } from "../shared";
import RoomGrid from "../RoomGrid";
import RunDetailModal from "../RunDetailModal";

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

export default function RapporterPage({ token, user }) {
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
  const [tab, setTab] = useState("manedlig"); // "manedlig" | "revisjon"
  const [openDate, setOpenDate] = useState(null); // "YYYY-MM-DD" — which grid day's checklist is open

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
    // This sends real e-mail, with photos, to the customer's own addresses — for every site when none is
    // chosen. It used to go on the first click.
    const scope = digestSiteId ? "denne lokasjonen" : "alle lokasjoner";
    if (!window.confirm(`Sende dagsrapporten for ${digestDate} til kundene på e-post (${scope})?`)) return;
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

  // Revisjonssporet er sin egen fane og ikke en seksjon lenger ned på månedsrapporten: det
  // leses i en helt annen situasjon — når noen spør etter dokumentasjon — og med sin egen
  // periode, ikke den valgte måneden.
  if (tab === "revisjon") {
    return (
      <div>
        <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Rapporter</h1>
        <div style={{ color: "var(--text-secondary)", marginBottom: 16 }}>Revisjonsspor og eksport</div>
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: 20, overflowX: "auto" }}>
          <TabButton active={false} onClick={() => setTab("manedlig")}>Månedlig</TabButton>
          <TabButton active onClick={() => setTab("revisjon")}>Revisjon</TabButton>
          <TabButton active={false} onClick={() => setTab("noekkeltall")}>Nøkkeltall</TabButton>
        </div>
        <RevisjonPanel token={token} sites={sites} />
      </div>
    );
  }

  if (tab === "noekkeltall") {
    return (
      <div>
        <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Rapporter</h1>
        <div style={{ color: "var(--text-secondary)", marginBottom: 16 }}>Nøkkeltall for drift, kvalitet og kompetanse</div>
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: 20, overflowX: "auto" }}>
          <TabButton active={false} onClick={() => setTab("manedlig")}>Månedlig</TabButton>
          <TabButton active={false} onClick={() => setTab("revisjon")}>Revisjon</TabButton>
          <TabButton active onClick={() => setTab("noekkeltall")}>Nøkkeltall</TabButton>
        </div>
        <NoekkeltallPanel token={token} />
      </div>
    );
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

      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: 20, overflowX: "auto" }}>
        <TabButton active onClick={() => setTab("manedlig")}>Månedlig</TabButton>
        <TabButton active={false} onClick={() => setTab("revisjon")}>Revisjon</TabButton>
        <TabButton active={false} onClick={() => setTab("noekkeltall")}>Nøkkeltall</TabButton>
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
            <StatCard icon={Clock} label="Fullførte dager" value={report.completedDays} color="var(--brand-dark)" />
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
              onOpenRun={(date) => setOpenDate(date)}
            />
          )}
          {siteId && grid && grid.rooms.length === 0 && (
            <div style={{ marginTop: 12, color: "var(--text-secondary)", fontSize: 13 }}>
              Denne lokasjonen har ingen rom å vise vaskeplan for.
            </div>
          )}
        </>
      )}

      {openDate && (
        <RunDetailModal
          token={token} siteId={siteId} date={openDate}
          userRole={user?.role} defaultInitials={user?.name}
          onClose={() => setOpenDate(null)} setError={setError}
        />
      )}
    </div>
  );
}

// Nøkkeltall: styresakens dashbord for kvalitet, drift og kompetanse. Egen fane og ikke en
// seksjon på månedsrapporten, av samme grunn som revisjonssporet — det leses i en annen
// situasjon, og med sin egen periode.
//
// HMS-dashbordet mangler, og det står det om her i stedet for å utelate det stille: en side som
// viser tre av fire og ikke sier fra, ser komplett ut og er det ikke.
const KATEGORI_NAVN = {
  hms: "HMS-avvik",
  kvalitet: "Kvalitetsavvik",
  kundeklage: "Kundeklage",
  naestenulykke: "Nestenulykke",
  forbedring: "Forbedringsforslag",
  ukategorisert: "Ikke kategorisert",
};

function NoekkeltallPanel({ token }) {
  const [dager, setDager] = useState(90);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    apiFetch(`/dashboard/kpi?days=${dager}`, { token }).then(setData).catch((e) => setError(e.message));
  }, [token, dager]);

  if (error) return <div style={{ color: "var(--text-danger)" }}>{error}</div>;
  if (!data) return <Loading />;

  const k = data.kvalitet;
  const d = data.drift;
  const kom = data.kompetanse;
  const totalt = k.per_kategori.reduce((n, r) => n + r.antall, 0);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <Field label="Periode" style={{ width: 170 }}>
          <select value={dager} onChange={(e) => setDager(Number(e.target.value))} style={inputStyle}>
            <option value={30}>Siste 30 dager</option>
            <option value={90}>Siste 90 dager</option>
            <option value={365}>Siste år</option>
          </select>
        </Field>
      </div>

      {/* ── Drift ── */}
      <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Drift</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
        <StatCard icon={CheckCircle2} label="Avvik lukket" value={d.lukkede} />
        <StatCard icon={Clock} label="Snitt lukketid" value={d.snitt_dager != null ? `${d.snitt_dager} d` : "—"} />
        <StatCard icon={Clock} label="Lengste" value={d.lengste_dager != null ? `${d.lengste_dager} d` : "—"} />
        {/* Det ene tallet på siden som krever handling i dag, så det er rødt når det ikke er null. */}
        <StatCard icon={AlertTriangle} label="Forfalte avvik" value={d.forfalte}
          color={d.forfalte > 0 ? "var(--text-danger)" : undefined} />
        <StatCard icon={AlertTriangle} label="Åpne uten frist" value={d.apne_uten_frist}
          color={d.apne_uten_frist > 0 ? "var(--text-warning)" : undefined} />
      </div>

      {/* ── Kvalitet ── */}
      <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Kvalitet</h2>
      <Card style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>
          {totalt} avvik i perioden, fordelt på type
        </div>
        {k.per_kategori.length === 0 ? (
          <div style={{ color: "var(--text-secondary)" }}>Ingen avvik i perioden.</div>
        ) : (
          k.per_kategori.map((r) => (
            <div key={r.kategori} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ width: 150, fontSize: 13.5, flexShrink: 0 }}>
                {KATEGORI_NAVN[r.kategori] || r.kategori}
              </span>
              {/* Enkel søylerad i stedet for et diagrambibliotek: fem tall trenger ikke mer,
                  og en avhengighet til blir en avhengighet å vedlikeholde. */}
              <span style={{ flex: 1, background: "var(--surface-0)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
                <span style={{
                  display: "block", height: 18, width: `${Math.max(4, (r.antall / totalt) * 100)}%`,
                  background: r.kategori === "ukategorisert" ? "var(--text-muted)" : "var(--brand)",
                }} />
              </span>
              <span style={{ width: 28, textAlign: "right", fontWeight: 600, fontSize: 13.5 }}>{r.antall}</span>
            </div>
          ))
        )}
      </Card>

      <Card style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Gjentakende avvik</div>
        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 10 }}>
          Samme oppgave i samme rom mer enn én gang i perioden
        </div>
        {k.gjentakende.length === 0 ? (
          <div style={{ color: "var(--text-secondary)", fontSize: 13.5 }}>Ingen gjentakelser i perioden.</div>
        ) : (
          k.gjentakende.map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderTop: i ? "1px solid var(--border)" : "none", fontSize: 13.5 }}>
              <span>{r.lokasjon} · {r.rom} · <strong>{r.oppgave}</strong></span>
              <span style={{ color: "var(--text-danger)", fontWeight: 600, flexShrink: 0 }}>{r.antall} ganger</span>
            </div>
          ))
        )}
      </Card>

      {/* ── Kompetanse ── */}
      <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Kompetanse</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
        <StatCard icon={AlertTriangle} label="Utløpte kurs" value={kom.utlopt}
          color={kom.utlopt > 0 ? "var(--text-danger)" : undefined} />
        <StatCard icon={Clock} label="Utløper innen 60 dager" value={kom.utloper_snart}
          color={kom.utloper_snart > 0 ? "var(--text-warning)" : undefined} />
      </div>

      {/* Sagt, ikke utelatt. Se kommentaren øverst. */}
      <Card style={{ background: "var(--surface-0)" }}>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          <strong>HMS-tallene mangler.</strong> Styresaken ber om fire dashbord — drift, kvalitet,
          kompetanse og HMS. De tre første står over. HMS krever risikovurderinger, vernerunder og
          hendelsesregistrering, som ikke er bygget ennå; HMS-avvik telles foreløpig bare som en
          avvikskategori under Kvalitet.
        </div>
      </Card>
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

// Revisjonsfanen: sporet man kan lese, og pakken man kan levere.
//
// quality_log ble skrevet samvittighetsfullt i et år uten at noen kunne slå opp i den. Dette er
// leseflaten. Og knappen ved siden av er de samme dataene pakket slik man gir dem fra seg:
// én zip med PDF, CSV-er og bilder, lesbar uten Rentlogg.
function RevisjonPanel({ token, sites }) {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayStr());
  const [siteId, setSiteId] = useState("");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  function load() {
    const q = new URLSearchParams({ from, to, ...(siteId ? { site_id: siteId } : {}) });
    apiFetch(`/reports/quality-log?${q}`, { token })
      .then(setRows)
      .catch((err) => setError(err.message));
  }
  useEffect(load, [token, from, to, siteId]);

  const valgtLokasjon = sites.find((s) => String(s.id) === String(siteId));

  return (
    <div>
      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="Fra">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Til">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Lokasjon">
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)} style={inputStyle}>
              <option value="">Alle lokasjoner</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <button
            onClick={() => downloadCsv(`/reports/quality-log.csv?from=${from}&to=${to}${siteId ? `&site_id=${siteId}` : ""}`, token, "revisjonsspor.csv")}
            style={{ ...primaryBtnStyle, background: "var(--surface-0)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
          >
            Last ned CSV
          </button>
          {/* Hele pakken krever én lokasjon: en revisjonseksport er alltid for ett anlegg —
              et tilsyn spør om dette bygget, ikke om alt firmaet gjør. */}
          <button
            onClick={() => downloadZip(`/reports/sites/${siteId}/revisjon.zip?from=${from}&to=${to}`, token, `revisjon-${from}_${to}.zip`)}
            disabled={!siteId}
            title={siteId ? "" : "Velg én lokasjon først"}
            style={{ ...primaryBtnStyle, opacity: siteId ? 1 : 0.45, cursor: siteId ? "pointer" : "not-allowed" }}
          >
            <Download size={15} style={{ marginRight: 6, verticalAlign: "-2px" }} />
            Last ned revisjonspakke
          </button>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 10 }}>
          {valgtLokasjon
            ? `Pakken inneholder rapport som PDF, måleresultater og revisjonsspor som CSV, og alle bilder for ${valgtLokasjon.name} i perioden.`
            : "Velg én lokasjon for å laste ned hele revisjonspakken."}
        </div>
      </Card>

      {error && <div style={{ color: "var(--text-danger)", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {rows === null ? (
        <Loading />
      ) : rows.length === 0 ? (
        <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
          Ingen hendelser i perioden. Sporet fylles når noen melder eller behandler et avvik,
          frigir tross en måling utenfor grensen, eller fjerner dokumentasjon.
        </div>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--surface-0)" }}>
                  {["Tidspunkt", "Hendelse", "Hvor", "Utført av", "Detalj"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "9px 12px", fontWeight: 600, fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "9px 12px", whiteSpace: "nowrap", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                      {String(r.occurred_at).slice(0, 16)}
                    </td>
                    <td style={{ padding: "9px 12px", fontWeight: 500 }}>{r.action_label}</td>
                    <td style={{ padding: "9px 12px", color: "var(--text-secondary)" }}>
                      {[r.site_name, r.room_name].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>{r.after_value || r.user_name || "—"}</td>
                    <td style={{ padding: "9px 12px", color: "var(--text-secondary)", maxWidth: 360 }}>{r.comment || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date());
}
