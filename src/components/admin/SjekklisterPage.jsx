import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Download, Plus, Trash2, Archive, RotateCcw, ListChecks, Copy, QrCode, Printer, X } from "lucide-react";
import { apiFetch, downloadCsv } from "../../api";
import { Card, Field, Loading, TabButton, inputStyle, primaryBtnStyle, linkBtnStyle, iconBtnStyle } from "../shared";
import SubmissionDetail, { FollowUp } from "../checklist/SubmissionDetail";
import { addDays, fmtDate, fmtNumber, fmtTime, todayOslo, weekdayOfDate, weekdayShort, WEEK_ORDER } from "../checklist/format";

// Sjekklister-modulen, admin-siden: ukeoversikt (hva mangler), logg (hva skjedde) og oppsett av
// selve listene. Norsk-only som resten av admin-flatene.
export default function SjekklisterPage({ token, user }) {
  const [tab, setTab] = useState("oversikt");
  // Klikk på en celle i oversikten åpner loggen filtrert på den lista og den dagen.
  const [logFilter, setLogFilter] = useState(null);

  // Open deviations (not yet followed up) — shown on the tab and in the overview, because "something
  // is still unhandled" is the one thing a leader must not have to go looking for.
  const [openCount, setOpenCount] = useState(0);
  function refreshOpenCount() {
    apiFetch("/simple-checklists/deviations", { token }).then((rows) => setOpenCount(rows.length)).catch(() => {});
  }
  useEffect(refreshOpenCount, [token]);

  function openLog(filter) {
    setLogFilter(filter);
    setTab("logg");
  }

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Sjekk det – det er kjekt det</h1>
        <div style={{ color: "var(--text-secondary)" }}>
          Rutiner de ansatte krysser av, og loggen over hver utfylling.
        </div>
      </div>
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: 16, overflowX: "auto" }}>
        <TabButton active={tab === "oversikt"} onClick={() => setTab("oversikt")}>Oversikt</TabButton>
        <TabButton active={tab === "avvik"} onClick={() => setTab("avvik")}>
          Avvik{openCount > 0 && <span style={countBadge}>{openCount}</span>}
        </TabButton>
        <TabButton active={tab === "logg"} onClick={() => { setLogFilter(null); setTab("logg"); }}>Logg</TabButton>
        <TabButton active={tab === "malinger"} onClick={() => setTab("malinger")}>Målinger</TabButton>
        <TabButton active={tab === "oppsett"} onClick={() => setTab("oppsett")}>Sjekklister</TabButton>
        <TabButton active={tab === "rapport"} onClick={() => setTab("rapport")}>Rapport</TabButton>
      </div>
      {tab === "oversikt" && (
        <WeekOverview token={token} openCount={openCount} onOpenLog={openLog} onOpenDeviations={() => setTab("avvik")} onSetup={() => setTab("oppsett")} />
      )}
      {tab === "avvik" && <DeviationsTab token={token} onChanged={refreshOpenCount} />}
      {tab === "logg" && <AdminLog key={JSON.stringify(logFilter)} token={token} user={user} initialFilter={logFilter} onChanged={refreshOpenCount} />}
      {tab === "malinger" && <MeasurementsTab token={token} />}
      {tab === "oppsett" && <ListSetup token={token} />}
      {tab === "rapport" && <ReportSettings token={token} user={user} />}
    </div>
  );
}

// --- Oversikt ---------------------------------------------------------------------------------

function mondayOf(dateStr) {
  const wd = weekdayOfDate(dateStr);
  return addDays(dateStr, wd === 0 ? -6 : 1 - wd);
}

const CELL = {
  done: { bg: "var(--c-teal)", color: "var(--text-success)", text: "✓" },
  deviation: { bg: "var(--c-red)", color: "var(--text-danger)", text: "Avvik" },
  missing: { bg: "var(--c-amber)", color: "var(--text-warning)", text: "Mangler" },
  late: { bg: "var(--c-red)", color: "var(--text-danger)", text: "Forsinket" },
  partial: { bg: "var(--c-amber)", color: "var(--text-warning)", text: "Delvis" },
  due: { bg: "var(--surface-0)", color: "var(--text-secondary)", text: "Planlagt" },
  none: { bg: "transparent", color: "var(--text-secondary)", text: "" },
};

function WeekOverview({ token, openCount, onOpenLog, onOpenDeviations, onSetup }) {
  const [monday, setMonday] = useState(() => mondayOf(todayOslo()));
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    apiFetch(`/simple-checklists/overview?from=${monday}&to=${addDays(monday, 6)}`, { token })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [token, monday]);

  if (error) return <div style={{ color: "var(--text-danger)" }}>{error}</div>;
  if (!data) return <Loading />;

  const today = data.today;
  // Planned by weekday, not by cell state: a list done on a day it wasn't planned is a bonus, not
  // something today's "x av y" should count.
  const plannedToday = data.days.includes(today) ? data.lists.filter((l) => l.weekdays.includes(weekdayOfDate(today))) : [];
  const doneToday = plannedToday.filter((l) => l.cells[today].count >= (l.times_per_day || 1)).length;
  const deviationsWeek = data.lists.reduce((n, l) => n + Object.values(l.cells).reduce((m, c) => m + c.deviations, 0), 0);
  const missingWeek = data.lists.reduce((n, l) => n + Object.values(l.cells).filter((c) => c.state === "missing").length, 0);

  if (data.lists.length === 0) {
    return (
      <Card style={{ textAlign: "center", padding: 32 }}>
        <ListChecks size={32} color="var(--brand)" />
        <div style={{ fontWeight: 600, marginTop: 8 }}>Ingen sjekklister ennå</div>
        <div style={{ color: "var(--text-secondary)", fontSize: 14, margin: "4px 0 14px" }}>
          Lag den første — eller start fra en ferdig mal.
        </div>
        <button onClick={onSetup} style={primaryBtnStyle}>Sett opp sjekklister</button>
      </Card>
    );
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Stat label="Utført i dag" value={`${doneToday} av ${plannedToday.length}`} tone={plannedToday.length && doneToday === plannedToday.length ? "ok" : null} />
        <Stat label="Avvik denne uka" value={deviationsWeek} tone={deviationsWeek ? "danger" : null} />
        <Stat label="Manglende utfyllinger" value={missingWeek} tone={missingWeek ? "warning" : null} />
        <Stat label="Avvik ikke fulgt opp" value={openCount} tone={openCount ? "danger" : "ok"} onClick={openCount ? onOpenDeviations : undefined} />
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
          <button onClick={() => setMonday(addDays(monday, -7))} style={iconBtnStyle} aria-label="Forrige uke"><ChevronLeft size={18} /></button>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {fmtDate(monday)} – {fmtDate(addDays(monday, 6))}
          </div>
          <button onClick={() => setMonday(addDays(monday, 7))} style={iconBtnStyle} aria-label="Neste uke"><ChevronRight size={18} /></button>
          {monday !== mondayOf(today) && (
            <button onClick={() => setMonday(mondayOf(today))} style={linkBtnStyle}>Denne uka</button>
          )}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640, fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left", width: "28%" }}>Sjekkliste</th>
                {data.days.map((d) => (
                  <th key={d} style={{ ...th, color: d === today ? "var(--brand-dark)" : th.color }}>
                    {weekdayShort(weekdayOfDate(d))} {d.slice(8)}.{d.slice(5, 7)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.lists.map((l) => (
                <tr key={l.id}>
                  <td style={{ ...td, fontWeight: 500 }}>
                    {l.name}
                    {(l.on_demand || l.schedule_mode !== "weekly") && (
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 400 }}>
                        {l.on_demand ? "Ved behov" : scheduleText(l.weekdays, l).replace(/^./, (c) => c.toUpperCase())}
                      </div>
                    )}
                    {(l.due_time || (l.times_per_day || 1) > 1) && (
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 400 }}>
                        {[(l.times_per_day || 1) > 1 && `${l.times_per_day} ganger daglig`, l.due_time && `innen kl. ${l.due_time}`].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </td>
                  {data.days.map((d) => {
                    const c = l.cells[d];
                    const s = CELL[c.state];
                    const clickable = c.count > 0;
                    return (
                      <td key={d} style={{ ...td, textAlign: "center", background: d === today ? "var(--brand-bg)" : undefined }}>
                        {s.text && (
                          <button
                            onClick={clickable ? () => onOpenLog({ checklist_id: l.id, from: d, to: d }) : undefined}
                            title={clickable ? `${c.count} utfylling${c.count > 1 ? "er" : ""} — åpne i loggen` : undefined}
                            style={{
                              border: "none", borderRadius: "var(--radius-sm)", padding: "4px 6px", minWidth: 44,
                              fontSize: 12, fontWeight: 600, background: s.bg, color: s.color,
                              cursor: clickable ? "pointer" : "default",
                            }}
                          >
                            {s.text}
                            {(l.times_per_day || 1) > 1 && c.state !== "none"
                              ? ` ${c.count}/${l.times_per_day}`
                              : c.count > 1 ? ` ×${c.count}` : ""}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>
        «Mangler»: planlagt dag som er over uten nok utfyllinger. «Forsinket»: fristen i dag er passert. Lister «ved behov» regnes aldri som manglende.
      </div>
    </div>
  );
}

function Stat({ label, value, tone, onClick }) {
  const color = { ok: "var(--text-success)", danger: "var(--text-danger)", warning: "var(--text-warning)" }[tone] || "var(--text-primary)";
  const body = (
    <>
      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </>
  );
  return onClick ? (
    <button onClick={onClick} style={{ textAlign: "left", cursor: "pointer", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 16, color: "inherit", font: "inherit" }}>
      {body}
    </button>
  ) : (
    <Card>{body}</Card>
  );
}

// --- Avvik ------------------------------------------------------------------------------------

function DeviationsTab({ token, onChanged }) {
  const [status, setStatus] = useState("open");
  const [rows, setRows] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState("");

  function load() {
    setRows(null);
    apiFetch(`/simple-checklists/deviations?status=${status}`, { token }).then(setRows).catch((err) => setError(err.message));
  }
  useEffect(load, [token, status]);

  async function followUp(row, action) {
    setError("");
    try {
      await apiFetch(`/simple-checklists/submissions/${row.submission_id}/answers/${row.answer_id}/followup`, {
        token, method: "POST", body: JSON.stringify({ action }),
      });
      load();
      onChanged();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  if (openId) {
    return (
      <SubmissionDetail
        token={token}
        submissionId={openId}
        canFollowUp
        onChanged={onChanged}
        onBack={() => { setOpenId(null); load(); }}
      />
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[["open", "Ikke fulgt opp"], ["closed", "Fulgt opp"]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setStatus(key)}
            style={{
              ...chipStyle, fontWeight: 600,
              background: status === key ? "var(--brand)" : "var(--surface-1)",
              color: status === key ? "white" : "var(--text-primary)",
              borderColor: status === key ? "var(--brand)" : "var(--border)",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <div style={{ color: "var(--text-danger)", marginBottom: 10 }}>{error}</div>}
      {!rows && !error && <Loading />}
      {rows?.length === 0 && (
        <Card style={{ textAlign: "center", color: "var(--text-secondary)" }}>
          {status === "open" ? "Ingen avvik venter på oppfølging." : "Ingen avvik er fulgt opp ennå."}
        </Card>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows?.map((r) => (
          <Card key={r.answer_id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {r.checklist_name} · {fmtDate(r.work_date)} · {r.user_name}
              </div>
              <button onClick={() => setOpenId(r.submission_id)} style={linkBtnStyle}>Åpne utfyllingen</button>
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{r.label}</div>
            {r.measure_unit && r.measured_value !== null && (
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-danger)", marginTop: 2 }}>
                Målt {fmtNumber(r.measured_value)} {r.measure_unit}
                {r.range_label && r.range_label !== r.measure_unit && (
                  <span style={{ fontWeight: 400, color: "var(--text-secondary)", fontSize: 12 }}> · grense {r.range_label.replace(/(\d)\.(\d)/g, "$1,$2")}</span>
                )}
              </div>
            )}
            {r.comment && <div style={{ fontSize: 14, fontStyle: "italic", color: "var(--text-danger)", marginTop: 4 }}>{r.comment}</div>}
            <FollowUp answer={r} locale="nb-NO" canFollowUp onSave={(action) => followUp(r, action)} />
          </Card>
        ))}
      </div>
    </div>
  );
}

// --- Målinger ---------------------------------------------------------------------------------

// Én liten graf per målepunkt over tid, med grenselinjene og verdier utenfor grensen i rødt — det
// en mattilsynsinspektør ber om å få se («vis meg temperaturloggen for kjølerommet»). Én serie per
// graf, så ingen tegnforklaring: tittelen navngir serien. Tabellen under hver graf er den
// tilgjengelige varianten og det som skrives ut.
function MeasurementsTab({ token }) {
  const [days, setDays] = useState(30);
  const [checklistId, setChecklistId] = useState("");
  const [lists, setLists] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/simple-checklists?include_archived=1", { token }).then(setLists).catch(() => {});
  }, [token]);

  useEffect(() => {
    setData(null);
    const to = todayOslo();
    const from = addDays(to, -(days - 1));
    apiFetch(`/simple-checklists/measurements?from=${from}&to=${to}${checklistId ? `&checklist_id=${checklistId}` : ""}`, { token })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [token, days, checklistId]);

  // Grouped per item (the same point across fills); a deleted item falls back to list + label.
  const series = useMemo(() => {
    if (!data) return [];
    const map = new Map();
    data.rows.forEach((r) => {
      const key = r.item_id ? `i${r.item_id}` : `${r.checklist_id}|${r.label}`;
      if (!map.has(key)) map.set(key, { key, label: r.label, list: r.checklist_name, unit: r.measure_unit, points: [] });
      if (r.measured_value !== null) map.get(key).points.push(r);
    });
    return [...map.values()].filter((s) => s.points.length > 0);
  }, [data]);

  function exportCsv() {
    const esc = (v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [["Dato", "Tid", "Sjekkliste", "Punkt", "Verdi", "Enhet", "Minst", "Maks", "Vurdering", "Utført av"].join(",")];
    data.rows.filter((r) => r.measured_value !== null).forEach((r) => {
      lines.push([
        r.work_date, fmtTime(r.submitted_at), r.checklist_name, r.label, fmtNumber(r.measured_value), r.measure_unit,
        fmtNumber(r.measure_min), fmtNumber(r.measure_max), r.status === "deviation" ? "Utenfor" : "Innenfor", r.user_name,
      ].map(esc).join(","));
    });
    const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `malinger-${data.from}_${data.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div>
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="Periode" style={{ width: 160 }}>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={inputStyle}>
              <option value={7}>Siste 7 dager</option>
              <option value={30}>Siste 30 dager</option>
              <option value={90}>Siste 90 dager</option>
              <option value={365}>Siste år</option>
            </select>
          </Field>
          <Field label="Sjekkliste" style={{ minWidth: 200, flex: "0 1 280px" }}>
            <select value={checklistId} onChange={(e) => setChecklistId(e.target.value)} style={inputStyle}>
              <option value="">Alle</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}{l.active ? "" : " (arkivert)"}</option>)}
            </select>
          </Field>
          {data?.rows.length > 0 && (
            <button onClick={exportCsv} style={{ ...linkBtnStyle, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 5, marginLeft: "auto", paddingBottom: 8 }}>
              <Download size={14} /> Eksporter CSV
            </button>
          )}
        </div>
      </Card>
      {error && <div style={{ color: "var(--text-danger)" }}>{error}</div>}
      {!data && !error && <Loading />}
      {data && series.length === 0 && (
        <Card style={{ textAlign: "center", color: "var(--text-secondary)" }}>
          Ingen målinger i perioden. Legg til et målepunkt (f.eks. temperatur) i en sjekkliste under «Sjekklister».
        </Card>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 14 }}>
        {series.map((s) => <MeasureChart key={s.key} series={s} />)}
      </div>
    </div>
  );
}

function MeasureChart({ series }) {
  const [hover, setHover] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const pts = series.points;
  const last = pts[pts.length - 1];
  const outside = pts.filter((p) => p.status === "deviation").length;

  // Geometry. viewBox units, scaled to the card width; the plot keeps room for y labels on the left.
  const W = 440, H = 180, L = 40, R = 12, T = 12, B = 26;
  const times = pts.map((p) => Date.parse(`${p.submitted_at.replace(" ", "T")}Z`));
  const t0 = Math.min(...times), t1 = Math.max(...times);
  const lim = (k) => pts.map((p) => p[k]).filter((v) => v !== null && v !== undefined);
  const curMin = last.measure_min, curMax = last.measure_max;
  const all = [...pts.map((p) => p.measured_value), ...lim("measure_min"), ...lim("measure_max")];
  let lo = Math.min(...all), hi = Math.max(...all);
  if (lo === hi) { lo -= 1; hi += 1; }
  // Round the axis out to a 1/2/5 × 10ⁿ step, so ticks read 2, 3, 4, 5 rather than 2,2 / 3,3.
  const raw = (hi - lo) / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  if (hi === lo) hi = lo + step;
  const x = (t) => (t1 === t0 ? L + (W - L - R) / 2 : L + ((t - t0) / (t1 - t0)) * (W - L - R));
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticks = [];
  for (let v = lo; v <= hi + step / 2 && ticks.length < 8; v += step) ticks.push(v);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(times[i]).toFixed(1)},${y(p.measured_value).toFixed(1)}`).join(" ");
  const fmtTick = (v) => fmtNumber(step < 1 ? v.toFixed(1) : Math.round(v));
  const dateLabel = (t) => new Date(t).toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit", timeZone: "Europe/Oslo" });

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{series.label}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {series.list} · {pts.length} målinger
            {(curMin !== null || curMax !== null) && ` · grense ${[curMin !== null && `minst ${fmtNumber(curMin)}`, curMax !== null && `maks ${fmtNumber(curMax)}`].filter(Boolean).join(", ")} ${series.unit}`}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: last.status === "deviation" ? "var(--text-danger)" : "var(--text-primary)" }}>
            {fmtNumber(last.measured_value)} <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>{series.unit}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>siste, {fmtDate(last.work_date)}</div>
        </div>
      </div>
      {outside > 0 && (
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-danger)", marginTop: 4 }}>
          ⚠ {outside} av {pts.length} utenfor grensen
        </div>
      )}

      <div style={{ position: "relative", marginTop: 8 }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${series.label}: ${pts.length} målinger, siste ${fmtNumber(last.measured_value)} ${series.unit}`} style={{ display: "block", overflow: "visible" }}>
          {ticks.map((v, i) => (
            <g key={i}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth="1" />
              <text x={L - 6} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-secondary)">{fmtTick(v)}</text>
            </g>
          ))}
          {[["measure_max", curMax], ["measure_min", curMin]].map(([k, v]) => v !== null && v !== undefined && (
            <g key={k}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--text-secondary)" strokeWidth="1.25" strokeDasharray="5 4" />
              <text x={W - R} y={y(v) - 4} textAnchor="end" fontSize="10" fill="var(--text-secondary)">
                {k === "measure_max" ? "maks" : "minst"} {fmtNumber(v)}
              </text>
            </g>
          ))}
          <path d={path} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {pts.map((p, i) => {
            const bad = p.status === "deviation";
            return (
              <g key={i}>
                <circle cx={x(times[i])} cy={y(p.measured_value)} r={bad ? 5 : 4} fill={bad ? "var(--text-danger)" : "var(--brand)"} stroke="var(--surface-1)" strokeWidth="2" />
                {/* Hit target larger than the mark, per the hover rule. */}
                <circle
                  cx={x(times[i])} cy={y(p.measured_value)} r="12" fill="transparent"
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}
                />
              </g>
            );
          })}
          <text x={L} y={H - 6} fontSize="10" fill="var(--text-secondary)">{dateLabel(t0)}</text>
          {t1 !== t0 && <text x={W - R} y={H - 6} textAnchor="end" fontSize="10" fill="var(--text-secondary)">{dateLabel(t1)}</text>}
        </svg>
        {hover !== null && (
          <div style={{
            position: "absolute", pointerEvents: "none", transform: "translate(-50%, -110%)",
            left: `${(x(times[hover]) / W) * 100}%`, top: `${(y(pts[hover].measured_value) / H) * 100}%`,
            background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 8px",
            fontSize: 12, whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          }}>
            <div style={{ fontWeight: 700 }}>{fmtNumber(pts[hover].measured_value)} {series.unit}</div>
            <div style={{ color: "var(--text-secondary)" }}>{fmtDate(pts[hover].work_date)} kl. {fmtTime(pts[hover].submitted_at)} · {pts[hover].user_name}</div>
            {pts[hover].status === "deviation" && <div style={{ color: "var(--text-danger)", fontWeight: 600 }}>Utenfor grensen</div>}
          </div>
        )}
      </div>

      <button onClick={() => setShowTable((v) => !v)} style={{ ...linkBtnStyle, marginTop: 6, padding: 0 }}>
        {showTable ? "Skjul tabell" : "Vis som tabell"}
      </button>
      {showTable && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 6 }}>
          <thead>
            <tr><th style={{ ...th, textAlign: "left" }}>Tidspunkt</th><th style={{ ...th, textAlign: "right" }}>Verdi</th><th style={{ ...th, textAlign: "left" }}>Utført av</th></tr>
          </thead>
          <tbody>
            {[...pts].reverse().map((p, i) => (
              <tr key={i}>
                <td style={td}>{fmtDate(p.work_date)} {fmtTime(p.submitted_at)}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 600, color: p.status === "deviation" ? "var(--text-danger)" : "var(--text-primary)" }}>
                  {fmtNumber(p.measured_value)} {series.unit}{p.status === "deviation" ? " ⚠" : ""}
                </td>
                <td style={td}>{p.user_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

// --- Rapport ----------------------------------------------------------------------------------

function ReportSettings({ token, user }) {
  const isAdmin = user.role === "admin";
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch("/simple-checklists/settings", { token }).then(setForm).catch((err) => setError(err.message));
  }, [token]);

  async function save(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const saved = await apiFetch("/simple-checklists/settings", {
        token, method: "PUT", body: JSON.stringify({ report_recipients: form.report_recipients, report_hour: Number(form.report_hour) }),
      });
      setForm(saved);
      setNotice("Lagret.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendNow() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const r = await apiFetch("/simple-checklists/settings/send-now", { token, method: "POST" });
      setNotice(`Gårsdagens oppsummering er sendt til ${r.recipients} mottaker${r.recipients === 1 ? "" : "e"}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!form) return error ? <div style={{ color: "var(--text-danger)" }}>{error}</div> : <Loading />;

  return (
    <Card style={{ maxWidth: 620 }}>
      <div style={{ fontWeight: 600, fontSize: 16 }}>Daglig oppsummering på e-post</div>
      <div style={{ fontSize: 14, color: "var(--text-secondary)", margin: "4px 0 14px", lineHeight: 1.5 }}>
        Hver morgen: hvilke planlagte lister som ble gjort i går og hvilke som mangler, gårsdagens avvik,
        og hvor mange avvik som ikke er fulgt opp. Dager uten noe å melde sendes ikke.
      </div>
      <form onSubmit={save}>
        <Field label="Mottakere (skill med komma)">
          <textarea
            value={form.report_recipients}
            onChange={(e) => setForm({ ...form, report_recipients: e.target.value })}
            disabled={!isAdmin}
            rows={2}
            placeholder="leder@firma.no, daglig.leder@firma.no"
            style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }}
          />
        </Field>
        <Field label="Sendes kl." style={{ marginTop: 10, maxWidth: 160 }}>
          <select value={form.report_hour} onChange={(e) => setForm({ ...form, report_hour: e.target.value })} disabled={!isAdmin} style={inputStyle}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
          </select>
        </Field>
        {isAdmin ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
            <button type="submit" disabled={busy} style={primaryBtnStyle}>Lagre</button>
            <button type="button" onClick={sendNow} disabled={busy || !form.report_recipients} style={{ ...linkBtnStyle, fontSize: 13 }}>
              Send gårsdagens oppsummering nå
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 12 }}>Bare en administrator kan endre mottakerne.</div>
        )}
      </form>
      {notice && <div style={{ color: "var(--text-success)", marginTop: 10, fontSize: 14 }}>{notice}</div>}
      {error && <div style={{ color: "var(--text-danger)", marginTop: 10, fontSize: 14 }}>{error}</div>}
    </Card>
  );
}

// --- Logg -------------------------------------------------------------------------------------

function AdminLog({ token, user, initialFilter, onChanged }) {
  const [filter, setFilter] = useState(() => ({
    from: initialFilter?.from || addDays(todayOslo(), -30),
    to: initialFilter?.to || todayOslo(),
    checklist_id: initialFilter?.checklist_id ? String(initialFilter.checklist_id) : "",
    user_id: "",
    deviations: false,
  }));
  const [rows, setRows] = useState(null);
  const [lists, setLists] = useState([]);
  const [people, setPeople] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState("");

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (filter.from) p.set("from", filter.from);
    if (filter.to) p.set("to", filter.to);
    if (filter.checklist_id) p.set("checklist_id", filter.checklist_id);
    if (filter.user_id) p.set("user_id", filter.user_id);
    if (filter.deviations) p.set("deviations", "1");
    return p.toString();
  }, [filter]);

  useEffect(() => {
    apiFetch("/simple-checklists?include_archived=1", { token }).then(setLists).catch(() => {});
    apiFetch("/auth/users", { token }).then((u) => setPeople(u.filter((x) => x.role !== "customer"))).catch(() => {});
  }, [token]);

  function load() {
    setRows(null);
    apiFetch(`/simple-checklists/submissions?${query}`, { token }).then(setRows).catch((err) => setError(err.message));
  }
  useEffect(load, [token, query]);

  async function remove(detail) {
    if (!window.confirm(`Slette utfyllingen av «${detail.checklist_name}» ${fmtDate(detail.work_date)}? Dette kan ikke angres.`)) return;
    try {
      await apiFetch(`/simple-checklists/submissions/${detail.id}`, { token, method: "DELETE" });
      setOpenId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (openId) {
    return (
      <SubmissionDetail
        token={token}
        submissionId={openId}
        onBack={() => { setOpenId(null); load(); }}
        onDelete={user.role === "admin" ? remove : undefined}
        canFollowUp
        onChanged={onChanged}
      />
    );
  }

  const set = (k) => (e) => setFilter((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  return (
    <div>
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, alignItems: "end" }}>
          <Field label="Fra"><input type="date" value={filter.from} onChange={set("from")} style={inputStyle} /></Field>
          <Field label="Til"><input type="date" value={filter.to} onChange={set("to")} style={inputStyle} /></Field>
          <Field label="Sjekkliste">
            <select value={filter.checklist_id} onChange={set("checklist_id")} style={inputStyle}>
              <option value="">Alle</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}{l.active ? "" : " (arkivert)"}</option>)}
            </select>
          </Field>
          <Field label="Utført av">
            <select value={filter.user_id} onChange={set("user_id")} style={inputStyle}>
              <option value="">Alle</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, gap: 10, flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={filter.deviations} onChange={set("deviations")} /> Bare med avvik
          </label>
          <button
            onClick={() => downloadCsv(`/simple-checklists/submissions.csv?${query}`, token, `sjekkliste-logg-${filter.from}_${filter.to}.csv`).catch((err) => setError(err.message))}
            style={{ ...linkBtnStyle, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <Download size={14} /> Eksporter CSV
          </button>
        </div>
      </Card>

      {error && <div style={{ color: "var(--text-danger)", marginBottom: 10 }}>{error}</div>}
      {!rows && !error && <Loading />}
      {rows?.length === 0 && <Card style={{ textAlign: "center", color: "var(--text-secondary)" }}>Ingen utfyllinger i perioden.</Card>}
      {rows?.length > 0 && (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560, fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: "left" }}>Dato</th>
                  <th style={{ ...th, textAlign: "left" }}>Sjekkliste</th>
                  <th style={{ ...th, textAlign: "left" }}>Utført av</th>
                  <th style={{ ...th, textAlign: "left" }}>Resultat</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => setOpenId(r.id)} style={{ cursor: "pointer" }}>
                    <td style={td}>{fmtDate(r.work_date)} <span style={{ color: "var(--text-secondary)" }}>{fmtTime(r.submitted_at)}</span></td>
                    <td style={{ ...td, fontWeight: 500 }}>{r.checklist_name}</td>
                    <td style={td}>{r.user_name}</td>
                    <td style={td}>
                      {r.deviation_count > 0 ? (
                        <>
                          <span style={{ ...pill, color: "var(--text-danger)", background: "var(--c-red)" }}>{r.deviation_count} avvik</span>
                          <span style={{ fontSize: 12, marginLeft: 6, color: r.open_deviation_count ? "var(--text-warning)" : "var(--text-success)" }}>
                            {r.open_deviation_count ? `${r.open_deviation_count} ikke fulgt opp` : "fulgt opp"}
                          </span>
                        </>
                      ) : (
                        <span style={{ ...pill, color: "var(--text-success)", background: "var(--c-teal)" }}>Alt i orden</span>
                      )}
                      {r.photo_count > 0 && <span style={{ fontSize: 12, color: "var(--text-secondary)", marginLeft: 8 }}>{r.photo_count} bilde{r.photo_count > 1 ? "r" : ""}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {rows?.length === 500 && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>Viser de 500 nyeste — snevre inn perioden for å se flere.</div>
      )}
    </div>
  );
}

// --- Oppsett ----------------------------------------------------------------------------------

// Ferdige utgangspunkt for bedrifter som ikke driver renhold. Bare et startpunkt: alt kan
// redigeres etterpå, og ingenting her er knyttet til lista etter at den er laget.
const TEMPLATES = [
  {
    name: "Åpningsrutine",
    weekdays: [1, 2, 3, 4, 5],
    items: ["Alarm slått av", "Lys og ventilasjon på", "Kjøl og frys har riktig temperatur", "Kasse og betalingsterminal startet", "Rømningsveier frie", "Inngangsparti ryddig"],
  },
  {
    name: "Stengerutine",
    weekdays: [1, 2, 3, 4, 5],
    items: ["Maskiner og utstyr slått av", "Kjøl- og frysedører lukket", "Avfall tatt ut", "Vinduer lukket", "Dører låst", "Alarm satt på"],
  },
  {
    name: "Temperaturkontroll",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    items: [
      { label: "Kjøleskap", measure_unit: "°C", measure_max: 4 },
      { label: "Fryser", measure_unit: "°C", measure_max: -18 },
      { label: "Varmholding", measure_unit: "°C", measure_min: 60 },
      "Termometer rengjort etter bruk",
    ],
  },
  {
    name: "Brannvernrunde",
    weekdays: [1],
    items: ["Rømningsveier frie og merket", "Nødlys fungerer", "Brannslukkere på plass og plombert", "Branndører lukker av seg selv", "Brannalarmsentralen viser ingen feil"],
  },
  {
    name: "HMS-runde",
    weekdays: [],
    items: ["Førstehjelpsutstyr komplett", "Verneutstyr tilgjengelig", "Sikkerhetsdatablader tilgjengelig", "Gangveier og lager ryddige", "Stiger og trapper i orden", "Avvik fra forrige runde fulgt opp"],
  },
];

function ListSetup({ token }) {
  const [lists, setLists] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");

  function load(selectAfter) {
    apiFetch("/simple-checklists?include_archived=1", { token })
      .then((l) => {
        setLists(l);
        if (selectAfter !== undefined) setSelectedId(selectAfter);
      })
      .catch((err) => setError(err.message));
  }
  useEffect(() => load(), [token]);

  async function create(body) {
    setError("");
    try {
      const created = await apiFetch("/simple-checklists", { token, method: "POST", body: JSON.stringify(body) });
      setNewName("");
      load(created.id);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!lists) return error ? <div style={{ color: "var(--text-danger)" }}>{error}</div> : <Loading />;
  const visible = lists.filter((l) => l.active || showArchived);
  const archivedCount = lists.filter((l) => !l.active).length;

  return (
    <div className="sc-setup" style={{ display: "grid", gridTemplateColumns: "minmax(220px, 280px) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
      <div>
        <Card style={{ padding: 8 }}>
          {visible.length === 0 && <div style={{ padding: 8, fontSize: 13, color: "var(--text-secondary)" }}>Ingen sjekklister ennå.</div>}
          {visible.map((l) => (
            <button
              key={l.id}
              onClick={() => setSelectedId(l.id)}
              style={{
                display: "block", width: "100%", textAlign: "left", border: "none", cursor: "pointer",
                padding: "9px 10px", borderRadius: "var(--radius)", marginBottom: 2,
                background: selectedId === l.id ? "var(--sidebar-active-bg)" : "transparent",
                color: l.active ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: selectedId === l.id ? 600 : 500 }}>{l.name}{l.active ? "" : " (arkivert)"}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{l.item_count} punkter · {scheduleText(l.weekdays, l)}</div>
            </button>
          ))}
          <form
            onSubmit={(e) => { e.preventDefault(); if (newName.trim()) create({ name: newName, weekdays: [1, 2, 3, 4, 5] }); }}
            style={{ display: "flex", gap: 6, padding: 6, borderTop: visible.length ? "1px solid var(--border)" : "none", marginTop: 6 }}
          >
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ny sjekkliste" style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
            <button type="submit" style={{ ...primaryBtnStyle, padding: "8px 10px" }} aria-label="Legg til"><Plus size={16} /></button>
          </form>
        </Card>
        {archivedCount > 0 && (
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: "var(--text-secondary)", marginTop: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Vis arkiverte ({archivedCount})
          </label>
        )}
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", margin: "16px 0 6px", textTransform: "uppercase", letterSpacing: 0.4 }}>
          Start fra mal
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {TEMPLATES.map((tpl) => (
            <button key={tpl.name} onClick={() => create(tpl)} style={chipStyle}>+ {tpl.name}</button>
          ))}
        </div>
      </div>

      <div>
        {error && <div style={{ color: "var(--text-danger)", marginBottom: 10 }}>{error}</div>}
        {selectedId ? (
          <ListEditor key={selectedId} token={token} id={selectedId} onChanged={() => load()} onRemoved={() => load(null)} onDuplicated={(newId) => load(newId)} />
        ) : (
          <Card style={{ color: "var(--text-secondary)", textAlign: "center", padding: 28 }}>
            Velg en sjekkliste til venstre, lag en ny, eller start fra en mal.
          </Card>
        )}
      </div>
    </div>
  );
}

function scheduleText(weekdays, list) {
  if (list?.schedule_mode === "monthly_day") return list.month_day === -1 ? "månedlig, siste dag" : `månedlig, den ${list.month_day}.`;
  if (list?.schedule_mode === "monthly_any") return "én gang i måneden";
  if (!weekdays?.length) return "ved behov";
  if (weekdays.length === 7) return "alle dager";
  if (weekdays.length === 5 && [1, 2, 3, 4, 5].every((d) => weekdays.includes(d))) return "hverdager";
  return WEEK_ORDER.filter((d) => weekdays.includes(d)).map((d) => weekdayShort(d)).join(", ");
}

function ListEditor({ token, id, onChanged, onRemoved, onDuplicated }) {
  const [list, setList] = useState(null);
  const [draft, setDraft] = useState(null);
  const [newItem, setNewItem] = useState("");
  const [editing, setEditing] = useState(null); // { id, label, help_text, isMeasure, unit, min, max }
  // New items: a plain check or a measurement (temperature and the like) with optional limits.
  const [newKind, setNewKind] = useState("check");
  const [newMeasure, setNewMeasure] = useState({ unit: "°C", min: "", max: "" });
  const [newPhoto, setNewPhoto] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function apply(l) {
    setList(l);
    setDraft({
      name: l.name, description: l.description || "", weekdays: l.weekdays,
      due_time: l.due_time || "", times_per_day: l.times_per_day || 1,
      schedule_mode: l.schedule_mode || "weekly", month_day: l.month_day ?? 1,
    });
  }
  useEffect(() => {
    apiFetch(`/simple-checklists/${id}`, { token }).then(apply).catch((err) => setError(err.message));
  }, [id, token]);

  async function call(path, method, body) {
    setError("");
    try {
      const res = await apiFetch(`/simple-checklists/${id}${path}`, { token, method, body: body ? JSON.stringify(body) : undefined });
      return res;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }

  async function saveHeader(e) {
    e.preventDefault();
    const l = await call("", "PATCH", draft);
    if (l) { apply(l); onChanged(); setSaved(true); setTimeout(() => setSaved(false), 1500); }
  }

  async function addItems(e) {
    e.preventDefault();
    // Limer man inn flere linjer (fra et gammelt skjema, en e-post), blir hver linje et punkt.
    const labels = newItem.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const extra = newKind === "measure"
      ? { measure_unit: newMeasure.unit || "°C", measure_min: newMeasure.min, measure_max: newMeasure.max }
      : {};
    if (newPhoto) extra.requires_photo = true;
    let l = null;
    for (const label of labels) l = (await call("/items", "POST", { label, ...extra })) || l;
    if (l) { setList(l); setNewItem(""); onChanged(); }
  }

  async function move(index, dir) {
    const ids = list.items.map((i) => i.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    const l = await call("/items/reorder", "POST", { ids });
    if (l) setList(l);
  }

  async function saveItem(e) {
    e.preventDefault();
    const l = await call(`/items/${editing.id}`, "PATCH", {
      label: editing.label,
      help_text: editing.help_text,
      measure_unit: editing.isMeasure ? editing.unit || "°C" : null,
      measure_min: editing.isMeasure ? editing.min : null,
      measure_max: editing.isMeasure ? editing.max : null,
      requires_photo: editing.requiresPhoto,
    });
    if (l) { setList(l); setEditing(null); }
  }

  async function deleteItem(item) {
    if (!window.confirm(`Fjerne punktet «${item.label}»? Tidligere utfyllinger beholder det.`)) return;
    const l = await call(`/items/${item.id}`, "DELETE");
    if (l) { setList(l); onChanged(); }
  }

  const [qr, setQr] = useState(null);
  async function showQr() {
    const r = await call("/qr", "GET");
    if (r) setQr(r);
  }

  async function duplicate() {
    const copy = await call("/duplicate", "POST");
    if (copy) onDuplicated?.(copy.id);
  }

  async function removeList() {
    if (!window.confirm(`Fjerne «${list.name}»? Har den utfyllinger, arkiveres den i stedet, så loggen beholdes.`)) return;
    const res = await call("", "DELETE");
    if (res) onRemoved();
  }

  async function restore() {
    const l = await call("", "PATCH", { active: true });
    if (l) { apply(l); onChanged(); }
  }

  if (!list) return error ? <div style={{ color: "var(--text-danger)" }}>{error}</div> : <Loading />;

  const qrModal = qr && (
    <div
      role="dialog" aria-modal="true" aria-label="QR-kode"
      onClick={() => setQr(null)}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface-1)", borderRadius: "var(--radius-lg)", padding: 20, maxWidth: 420, width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 600 }}>QR-kode for «{list.name}»</div>
          <button onClick={() => setQr(null)} style={iconBtnStyle} aria-label="Lukk"><X size={18} /></button>
        </div>
        <img src={qr.qrImage} alt={`QR-kode for ${list.name}`} style={{ width: "100%", display: "block", border: "1px solid var(--border)", borderRadius: 8 }} />
        <div style={{ fontSize: 13, color: "var(--text-secondary)", margin: "10px 0", lineHeight: 1.5 }}>
          Heng den opp der rutinen gjøres. Skanner en ansatt den med kameraet, åpnes lista direkte.
          Koden forblir den samme om lista endres.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <a href={qr.qrImage} download={`qr-${list.name}.svg`} style={{ ...primaryBtnStyle, textDecoration: "none", display: "inline-flex", gap: 6, alignItems: "center" }}>
            <Download size={14} /> Last ned
          </a>
          <button
            onClick={() => {
              const w = window.open("", "_blank");
              if (!w) return;
              w.document.write(`<title>QR</title><body style="margin:0;display:flex;justify-content:center;padding:40px"><img src="${qr.qrImage}" style="width:90mm" onload="window.print()"></body>`);
              w.document.close();
            }}
            style={{ ...linkBtnStyle, fontSize: 13, display: "inline-flex", gap: 5, alignItems: "center" }}
          >
            <Printer size={14} /> Skriv ut
          </button>
        </div>
      </div>
    </div>
  );

  const toggleDay = (d) =>
    setDraft((f) => ({ ...f, weekdays: f.weekdays.includes(d) ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d] }));

  return (
    <div>
      {qrModal}
      {!list.active && (
        <Card style={{ marginBottom: 12, background: "var(--c-amber)", borderColor: "transparent", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14 }}>Arkivert — vises ikke for de ansatte.</span>
          <button onClick={restore} style={{ ...linkBtnStyle, fontSize: 13, display: "inline-flex", gap: 5, alignItems: "center" }}>
            <RotateCcw size={14} /> Gjenopprett
          </button>
        </Card>
      )}
      <Card style={{ marginBottom: 12 }}>
        <form onSubmit={saveHeader}>
          <Field label="Navn">
            <input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="Beskrivelse (valgfritt — vises øverst for den ansatte)" style={{ marginTop: 10 }}>
            <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} style={inputStyle} />
          </Field>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", margin: "12px 0 6px" }}>Når skal den fylles ut?</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {[["weekly", "Faste ukedager"], ["monthly_day", "Månedlig, fast dag"], ["monthly_any", "Én gang i måneden"]].map(([key, label]) => (
              <button
                type="button" key={key} aria-pressed={draft.schedule_mode === key}
                onClick={() => setDraft({ ...draft, schedule_mode: key, month_day: draft.month_day || 1 })}
                style={{
                  ...chipStyle, fontWeight: 600,
                  background: draft.schedule_mode === key ? "var(--brand-bg)" : "var(--surface-1)",
                  color: draft.schedule_mode === key ? "var(--brand-dark)" : "var(--text-secondary)",
                  borderColor: draft.schedule_mode === key ? "var(--brand)" : "var(--border)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {draft.schedule_mode === "monthly_day" && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <Field label="Dag i måneden" style={{ width: 170 }}>
                <select value={draft.month_day} onChange={(e) => setDraft({ ...draft, month_day: Number(e.target.value) })} style={inputStyle}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Den {d}.</option>)}
                  <option value={-1}>Siste dag i måneden</option>
                </select>
              </Field>
              <Field label="Frist (valgfritt)" style={{ width: 150 }}>
                <input type="time" value={draft.due_time} onChange={(e) => setDraft({ ...draft, due_time: e.target.value })} style={inputStyle} />
              </Field>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", flex: "1 1 200px", paddingBottom: 4 }}>
                Ikke utfylt den dagen vises som «Mangler». Den 29.–31. flyttes til siste dag i korte måneder.
              </div>
            </div>
          )}
          {draft.schedule_mode === "monthly_any" && (
            <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Kan fylles ut hvilken dag som helst i måneden. Den ligger under «Denne måneden» hos de ansatte til den
              er gjort, og regnes som «Mangler» først når måneden er over. Passer for HMS-runder og månedlige kontroller.
            </div>
          )}
          {draft.schedule_mode === "weekly" && (
          <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {WEEK_ORDER.map((d) => {
              const on = draft.weekdays.includes(d);
              return (
                <button
                  type="button" key={d} onClick={() => toggleDay(d)} aria-pressed={on}
                  style={{
                    ...chipStyle, minWidth: 46, fontWeight: 600,
                    background: on ? "var(--brand)" : "var(--surface-1)", color: on ? "white" : "var(--text-primary)",
                    borderColor: on ? "var(--brand)" : "var(--border)",
                  }}
                >
                  {weekdayShort(d)}
                </button>
              );
            })}
            <button type="button" onClick={() => setDraft({ ...draft, weekdays: [0, 1, 2, 3, 4, 5, 6] })} style={linkBtnStyle}>Alle</button>
            <button type="button" onClick={() => setDraft({ ...draft, weekdays: [] })} style={linkBtnStyle}>Ved behov</button>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>
            {draft.weekdays.length === 0
              ? "Ingen dager valgt: lista kan fylles ut når som helst, og regnes aldri som manglende."
              : "Ikke utfylt en planlagt dag vises som «Mangler» i oversikten."}
          </div>
          {draft.weekdays.length > 0 && (
            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <Field label="Ganger per dag" style={{ width: 150 }}>
                <select value={draft.times_per_day} onChange={(e) => setDraft({ ...draft, times_per_day: Number(e.target.value) })} style={inputStyle}>
                  {[1, 2, 3, 4, 6].map((n) => <option key={n} value={n}>{n === 1 ? "1 gang" : `${n} ganger`}</option>)}
                </select>
              </Field>
              <Field label="Frist (valgfritt)" style={{ width: 150 }}>
                <input type="time" value={draft.due_time} onChange={(e) => setDraft({ ...draft, due_time: e.target.value })} style={inputStyle} />
              </Field>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", alignSelf: "flex-end", flex: "1 1 200px", paddingBottom: 4 }}>
                Med frist vises lista som «Forsinket» samme dag når klokka passerer fristen.
              </div>
            </div>
          )}
          </>
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
            <button type="submit" style={primaryBtnStyle}>Lagre</button>
            {saved && <span style={{ fontSize: 13, color: "var(--text-success)" }}>Lagret</span>}
            <button type="button" onClick={showQr} style={{ ...linkBtnStyle, marginLeft: "auto", display: "inline-flex", gap: 5, alignItems: "center" }}>
              <QrCode size={14} /> QR-kode
            </button>
            <button type="button" onClick={duplicate} style={{ ...linkBtnStyle, display: "inline-flex", gap: 5, alignItems: "center" }}>
              <Copy size={14} /> Dupliser
            </button>
            {list.active && (
              <button type="button" onClick={removeList} style={{ ...linkBtnStyle, color: "var(--text-danger)", display: "inline-flex", gap: 5, alignItems: "center" }}>
                <Archive size={14} /> Fjern / arkiver
              </button>
            )}
          </div>
        </form>
      </Card>

      <Card>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Punkter ({list.items.length})</div>
        {list.items.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
            Ingen punkter ennå. En liste uten punkter kan ikke fylles ut.
          </div>
        )}
        {list.items.map((item, i) => (
          <div key={item.id} style={{ display: "flex", gap: 6, alignItems: "flex-start", padding: "8px 0", borderTop: i ? "1px solid var(--border)" : "none" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <button onClick={() => move(i, -1)} disabled={i === 0} style={{ ...iconBtnStyle, padding: 0, opacity: i === 0 ? 0.3 : 1 }} aria-label="Flytt opp"><ChevronUp size={16} /></button>
              <button onClick={() => move(i, 1)} disabled={i === list.items.length - 1} style={{ ...iconBtnStyle, padding: 0, opacity: i === list.items.length - 1 ? 0.3 : 1 }} aria-label="Flytt ned"><ChevronDown size={16} /></button>
            </div>
            {editing?.id === item.id ? (
              <form onSubmit={saveItem} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <input autoFocus required value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} style={inputStyle} />
                <input value={editing.help_text} onChange={(e) => setEditing({ ...editing, help_text: e.target.value })} placeholder="Forklaring (valgfritt)" style={inputStyle} />
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                  <input type="checkbox" checked={editing.isMeasure} onChange={(e) => setEditing({ ...editing, isMeasure: e.target.checked })} />
                  Måling (den ansatte skriver inn et tall)
                </label>
                {editing.isMeasure && (
                  <MeasureFields value={editing} onChange={(m) => setEditing({ ...editing, ...m })} />
                )}
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                  <input type="checkbox" checked={editing.requiresPhoto} onChange={(e) => setEditing({ ...editing, requiresPhoto: e.target.checked })} />
                  Krever bilde
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" style={{ ...primaryBtnStyle, padding: "6px 12px" }}>Lagre</button>
                  <button type="button" onClick={() => setEditing(null)} style={linkBtnStyle}>Avbryt</button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setEditing({
                  id: item.id, label: item.label, help_text: item.help_text || "",
                  isMeasure: !!item.measure_unit, unit: item.measure_unit || "°C",
                  min: fmtNumber(item.measure_min), max: fmtNumber(item.measure_max),
                  requiresPhoto: !!item.requires_photo,
                })}
                style={{ flex: 1, textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "2px 0", color: "inherit" }}
                title="Klikk for å redigere"
              >
                <div style={{ fontSize: 14 }}>{i + 1}. {item.label}</div>
                {item.help_text && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{item.help_text}</div>}
                {item.measure_unit && (
                  <div style={{ fontSize: 12, color: "var(--brand-dark)", marginTop: 2 }}>
                    Måling i {item.measure_unit}{limitText(item)}
                  </div>
                )}
                {!!item.requires_photo && <div style={{ fontSize: 12, color: "var(--brand-dark)", marginTop: 2 }}>Krever bilde</div>}
              </button>
            )}
            {editing?.id !== item.id && (
              <button onClick={() => deleteItem(item)} style={iconBtnStyle} aria-label="Fjern punkt"><Trash2 size={15} /></button>
            )}
          </div>
        ))}
        <div style={{ display: "flex", gap: 6, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Nytt punkt:</span>
          <label style={{ display: "inline-flex", gap: 5, alignItems: "center", fontSize: 12, order: 9, marginLeft: 6 }}>
            <input type="checkbox" checked={newPhoto} onChange={(e) => setNewPhoto(e.target.checked)} /> Krever bilde
          </label>
          {[["check", "Avkrysning"], ["measure", "Måling"]].map(([key, label]) => (
            <button
              type="button" key={key} onClick={() => setNewKind(key)}
              style={{
                ...chipStyle, padding: "4px 10px", fontSize: 12, fontWeight: 600,
                background: newKind === key ? "var(--brand-bg)" : "var(--surface-1)",
                color: newKind === key ? "var(--brand-dark)" : "var(--text-secondary)",
                borderColor: newKind === key ? "var(--brand)" : "var(--border)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {newKind === "measure" && (
          <div style={{ marginTop: 8 }}>
            <MeasureFields value={newMeasure} onChange={(m) => setNewMeasure({ ...newMeasure, ...m })} />
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
              En verdi utenfor grensen blir automatisk et avvik. Uten grenser loggføres bare tallet.
            </div>
          </div>
        )}
        <form onSubmit={addItems} style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "flex-start" }}>
          <textarea
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addItems(e); } }}
            placeholder="Nytt punkt — Enter for å legge til. Lim inn flere linjer for flere punkter."
            rows={1}
            style={{ ...inputStyle, flex: 1, resize: "vertical", fontFamily: "inherit" }}
          />
          <button type="submit" style={{ ...primaryBtnStyle, padding: "8px 12px" }}>Legg til</button>
        </form>
        {error && <div style={{ color: "var(--text-danger)", marginTop: 8 }}>{error}</div>}
      </Card>
    </div>
  );
}

const th = {
  padding: "8px 10px", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)",
  borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", textAlign: "center",
};
const td = { padding: "8px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" };
const pill = { fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: "var(--radius-pill)", whiteSpace: "nowrap" };
function limitText(item) {
  const has = (v) => v !== null && v !== undefined;
  const min = fmtNumber(item.measure_min);
  const max = fmtNumber(item.measure_max);
  if (has(item.measure_min) && has(item.measure_max)) return ` · grense ${min}–${max}`;
  if (has(item.measure_max)) return ` · maks ${max}`;
  if (has(item.measure_min)) return ` · minst ${min}`;
  return " · ingen grense";
}

function MeasureFields({ value, onChange }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
      <Field label="Enhet">
        <input value={value.unit} onChange={(e) => onChange({ unit: e.target.value })} placeholder="°C" style={inputStyle} />
      </Field>
      <Field label="Minst (valgfritt)">
        <input value={value.min} inputMode="decimal" onChange={(e) => onChange({ min: e.target.value })} style={inputStyle} />
      </Field>
      <Field label="Maks (valgfritt)">
        <input value={value.max} inputMode="decimal" onChange={(e) => onChange({ max: e.target.value })} style={inputStyle} />
      </Field>
    </div>
  );
}

const countBadge = {
  marginLeft: 6, fontSize: 11, fontWeight: 700, color: "white", background: "var(--text-danger)",
  borderRadius: "var(--radius-pill)", padding: "1px 7px", verticalAlign: "middle",
};

const chipStyle = {
  background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--radius-pill)",
  padding: "6px 10px", fontSize: 13, cursor: "pointer", color: "var(--text-primary)",
};
