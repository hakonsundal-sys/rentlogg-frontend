import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  Check, ChevronDown, ChevronRight, Clock, Columns3, Download, FileSpreadsheet, FileText,
  Lock, LockOpen, Pencil, Plus, Trash2, X, XCircle,
} from "lucide-react";
import { apiFetch, downloadCsv, downloadPdf } from "../../api";
import { Card, Field, Loading, TabButton, primaryBtnStyle, linkBtnStyle, inputStyle } from "../shared";

// "Timer" — the admin side of Timeregistrering, built to match the Mobile Worker OKV actually works
// in (read through with Håkon 2026-09-23/24). The things taken from it, and why:
//
//  - the timesheet is a PIVOT: one column per lønnsart, so a month can be read and summed down a
//    column. Stacking the lines inside one cell, which is how this started, is not a spreadsheet.
//  - hours belong to an ORDRE, not a building. "Intern tid", "Kjøring" and "Fravær" are orders with
//    no site — which is what makes ferie and sykefravær registrable at all.
//  - approval is a LADDER (Teamleder → Formann → Driftssjef → Administrasjon), not a checkbox, and
//    "Avvis" with a reason is a different act from un-ticking.
//  - the Endringslogg is a tab, because "why does this say 6 hours" is asked months later.
//
// Approval and locking stay distinct: approval is "I have looked at this shift", the lock is "this
// period has been exported, nobody touches it".
//
// Norwegian-only, like every other admin surface.

const STATUS_LABEL = {
  open: "Pågår", closed: "Fullført", auto_closed: "Auto-avsluttet", missing_checkout: "Mangler utstempling",
};
const STATUS_COLOR = {
  open: { bg: "var(--brand-bg)", color: "var(--brand-dark)" },
  closed: { bg: "var(--c-teal)", color: "var(--text-success)" },
  auto_closed: { bg: "var(--surface-2)", color: "var(--text-secondary)" },
  missing_checkout: { bg: "var(--surface-2)", color: "var(--text-danger)" },
};
const BILLING_LABEL = { actual: "Faktisk tid", fixed: "Rammetimer", manual: "Manuelt satt", lines: "Timelinjer" };
const PLANNED_LABEL = {
  ok: "Som planlagt", substitute: "Annen enn planlagt", no_show: "Ingen stempling", unplanned: "Ikke planlagt",
};
const PLANNED_COLOR = {
  ok: { bg: "var(--c-teal)", color: "var(--text-success)" },
  substitute: { bg: "var(--accent-blue-bg)", color: "var(--accent-blue-dark)" },
  no_show: { bg: "var(--surface-2)", color: "var(--text-danger)" },
  unplanned: { bg: "var(--brand-bg)", color: "var(--brand-dark)" },
};
const CATEGORY_LABEL = { arbeid: "Arbeid", fravær: "Fravær", tillegg: "Tillegg" };

function todayInOslo() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date());
}

function shiftDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The period shortcuts Mobile Worker offers. An admin picking "forrige måned" on the 2nd should not
// have to work out two dates to do the thing they do every single month.
function periodPresets() {
  const today = todayInOslo();
  const [y, m] = today.split("-").map(Number);
  const firstThis = `${today.slice(0, 7)}-01`;
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const firstPrev = `${prevY}-${String(prevM).padStart(2, "0")}-01`;
  return [
    { label: "I dag", from: today, to: today },
    { label: "I går", from: shiftDays(today, -1), to: shiftDays(today, -1) },
    { label: "Siste 7 dager", from: shiftDays(today, -6), to: today },
    { label: "Siste 30 dager", from: shiftDays(today, -29), to: today },
    { label: "Denne måned", from: firstThis, to: today },
    { label: "Forrige måned", from: firstPrev, to: shiftDays(firstThis, -1) },
  ];
}

function formatMinutes(minutes) {
  if (minutes == null) return "—";
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  return `${sign}${Math.floor(abs / 60)}t ${String(abs % 60).padStart(2, "0")}m`;
}

// Stored stamps are UTC; every clock time shown or edited here is Oslo wall time — the clock the
// person who stamped it actually read.
function osloTime(stamp) {
  if (!stamp) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(`${String(stamp).replace(" ", "T")}Z`));
}

// "1,5" → 90. Hours in, minutes stored — half-hour frames are ordinary, and a float drifts once a
// month is summed.
function hoursToMinutes(value) {
  const hours = Number(String(value ?? "").trim().replace(",", "."));
  return hours > 0 ? Math.round(hours * 60) : 0;
}

function minutesToHours(minutes) {
  if (!minutes) return "";
  return String(Math.round((minutes / 60) * 100) / 100).replace(".", ",");
}

// "22:00"–"06:00" is a night shift, not an error — same rule as the backend's lineMinutes.
function lineMinutesOf(startTime, endTime) {
  if (!startTime || !endTime) return null;
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff < 0 ? diff + 24 * 60 : diff;
}

// The column layout lives in this browser, not on the server: two admins looking at the same month
// want different columns, and neither should be moving the other's. Wrapped because localStorage
// throws outright in a private window.
const LAYOUT_KEY = "rentlogg_timer_layout";

function readLayout(field, fallback) {
  try {
    const raw = JSON.parse(localStorage.getItem(LAYOUT_KEY) || "{}");
    return field in raw ? raw[field] : fallback;
  } catch {
    return fallback;
  }
}

function writeLayout(layout) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // Storage unavailable — the layout still applies for this session, it just won't persist.
  }
}

function Pill({ label, colors }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: "var(--radius-pill)",
      fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", background: colors.bg, color: colors.color,
    }}>
      {label}
    </span>
  );
}

// The ladder, as one compact cell: a dot per level, filled where somebody has signed. Hovering says
// who. An optional level (Teamleder at OKV) is drawn hollow so it is visibly not blocking anything.
function ApprovalLadder({ approval }) {
  if (!approval?.steps?.length) return <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>—</span>;
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
      {approval.steps.map((s) => (
        <span
          key={s.level_id}
          title={`${s.name}${s.required ? "" : " (valgfritt)"}: ${s.approved ? `godkjent av ${s.approved_by_name}` : "venter"}`}
          style={{
            width: 10, height: 10, borderRadius: "50%",
            background: s.approved ? "var(--text-success)" : "transparent",
            border: `1.5px ${s.required ? "solid" : "dashed"} ${s.approved ? "var(--text-success)" : "var(--border)"}`,
          }}
        />
      ))}
      <span style={{ fontSize: 10, color: "var(--text-secondary)", marginLeft: 3 }}>
        {approval.approved_count}/{approval.required_count}
      </span>
    </div>
  );
}

// "Gita Eglite [2]" — Mobile Worker's own way of writing who signed and at which step, which reads
// far better in a narrow column than a name and a level on two lines.
function signedBy(approval) {
  const done = (approval?.steps || []).filter((s) => s.approved);
  if (done.length === 0) return null;
  const last = done[done.length - 1];
  return `${last.approved_by_name} [${last.step}]`;
}

// Approve / reject for one shift, at the signed-in person's own level. A locked or still-running
// shift says why it cannot be approved instead of offering a dead button.
function ApproveCell({ entry, onToggle, onReject, busy, myLevel }) {
  if (entry.locked) return <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Låst</span>;
  if (!entry.ended_at) return <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Pågår</span>;
  const mine = entry.approval?.steps?.find((s) => s.level_id === myLevel?.id);
  return (
    <div>
      <ApprovalLadder approval={entry.approval} />
      {myLevel && (
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <button
            onClick={() => onToggle(entry, !mine?.approved)}
            disabled={busy}
            title={mine?.approved ? `Du har godkjent som ${myLevel.name} — klikk for å angre` : `Godkjenn som ${myLevel.name}`}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4, cursor: busy ? "default" : "pointer",
              border: mine?.approved ? "1px solid var(--text-success)" : "1px solid var(--border)",
              background: mine?.approved ? "var(--c-teal)" : "var(--surface-0)",
              color: mine?.approved ? "var(--text-success)" : "var(--text-secondary)",
              borderRadius: "var(--radius-pill)", padding: "2px 9px", fontSize: 11, fontWeight: 600,
            }}
          >
            <Check size={11} /> {mine?.approved ? "Godkjent" : "Godkjenn"}
          </button>
          <button
            onClick={() => onReject(entry)}
            disabled={busy}
            title="Avvis og send tilbake"
            style={{
              display: "inline-flex", alignItems: "center", gap: 4, cursor: busy ? "default" : "pointer",
              border: "1px solid var(--border)", background: "var(--surface-0)",
              color: entry.rejected ? "var(--text-danger)" : "var(--text-secondary)",
              borderRadius: "var(--radius-pill)", padding: "2px 9px", fontSize: 11, fontWeight: 600,
            }}
          >
            <XCircle size={11} /> {entry.rejected ? "Avvist" : "Avvis"}
          </button>
        </div>
      )}
      {signedBy(entry.approval) && (
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 3 }}>{signedBy(entry.approval)}</div>
      )}
      {entry.rejected && (
        <div style={{ fontSize: 11, color: "var(--text-danger)", marginTop: 3, maxWidth: 220 }}>
          {entry.rejected_by_name}: {entry.rejection_comment}
        </div>
      )}
    </div>
  );
}

export default function TimerPage({ token, user }) {
  // "Timer" is the daily work; "Registre" is the master data behind it — the split Mobile Worker
  // makes with its own Registre menu, in the tab shape Ansatte/Opplæring already uses here.
  const [section, setSection] = useState("timer");
  const [tab, setTab] = useState("timeliste");
  const [registerTab, setRegisterTab] = useState("ordrer");
  const preset = periodPresets()[4];
  const [from, setFrom] = useState(preset.from);
  const [to, setTo] = useState(preset.to);
  const [siteId, setSiteId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [userId, setUserId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [approval, setApproval] = useState("");
  // Column layout is per browser, not per company: two admins looking at the same month want
  // different columns, and neither should be changing the other's screen.
  const [hidden, setHidden] = useState(() => readLayout("hidden", BASE_COLUMNS.filter((c) => c.off).map((c) => c.key)));
  const [groupBy, setGroupBy] = useState(() => readLayout("groupBy", null));
  const [sortBy, setSortBy] = useState(() => readLayout("sortBy", null));
  const [data, setData] = useState(null);
  const [planned, setPlanned] = useState(null);
  const [sites, setSites] = useState([]);
  const [orders, setOrders] = useState([]);
  const [teams, setTeams] = useState([]);
  const [groups, setGroups] = useState([]);
  const [staff, setStaff] = useState([]);
  const [types, setTypes] = useState([]);
  const [levels, setLevels] = useState({ levels: [], users: [], mine: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editEntry, setEditEntry] = useState(null);
  const [rejectEntry, setRejectEntry] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);

  const isAdmin = user?.role === "admin";
  const filters = {
    ...(siteId ? { site_id: siteId } : {}),
    ...(orderId ? { order_id: orderId } : {}),
    ...(userId ? { user_id: userId } : {}),
    ...(teamId ? { team_id: teamId } : {}),
    ...(groupId ? { employee_group_id: groupId } : {}),
  };
  const query = new URLSearchParams({ from, to, ...filters, ...(approval ? { approval } : {}) }).toString();
  // Filtering the plan comparison by approval would be meaningless — it is about whether somebody
  // turned up, not whether the hours have been signed off.
  const plannedQuery = new URLSearchParams({ from, to, ...filters }).toString();

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([
      apiFetch(`/time/entries?${query}`, { token }),
      apiFetch(`/time/planned?${plannedQuery}`, { token }),
    ])
      .then(([e, p]) => { setData(e); setPlanned(p); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [query, plannedQuery, token]);

  useEffect(load, [load]);

  // Reference data for the filters and the registration form; none of it changes while the page is
  // open, so it is fetched once rather than alongside every period change.
  useEffect(() => {
    apiFetch("/sites", { token }).then(setSites).catch(() => {});
    apiFetch("/auth/users", { token }).then(setStaff).catch(() => {});
    apiFetch("/time/types", { token }).then(setTypes).catch(() => {});
    apiFetch("/time/orders", { token }).then(setOrders).catch(() => {});
    apiFetch("/time/approval-levels", { token }).then(setLevels).catch(() => {});
    apiFetch("/time/registers/teams", { token }).then(setTeams).catch(() => {});
    apiFetch("/time/registers/employee-groups", { token }).then(setGroups).catch(() => {});
  }, [token]);

  // The chosen layout follows the person, not the period — re-picking columns every morning would
  // make the picker worse than no picker.
  useEffect(() => writeLayout({ hidden, groupBy, sortBy }), [hidden, groupBy, sortBy]);

  // Three formats off the same rows, for three different readers: the CSV and the spreadsheet for
  // whoever moves hours into payroll, the PDF for whoever wants the month on paper.
  function exportAs(extension) {
    downloadPdf(`/time/entries.${extension}?${query}`, token, `timer-${from}-${to}.${extension}`)
      .catch((err) => setError(err.message));
  }

  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const toggleApproval = (entry, approved) =>
    run(() => apiFetch(`/time/entries/${entry.id}/approve`, { token, method: "POST", body: JSON.stringify({ approved }) }));

  const rejectWithComment = (entry, comment) =>
    run(async () => {
      await apiFetch(`/time/entries/${entry.id}/reject`, { token, method: "POST", body: JSON.stringify({ comment }) });
      setRejectEntry(null);
    });

  // "Alle samtidig" — everything on screen, or one employee's rows from the Ansattvisning. Signs at
  // the caller's own level only; the ladder is what decides when a shift is actually done.
  async function approveBulk(approved, forUserId = null) {
    const who = forUserId ? staff.find((s) => s.id === forUserId)?.name : null;
    const scope = who ? `alle timene for ${who}` : Object.keys(filters).length ? "timene i utvalget" : "alle timene";
    if (!window.confirm(`${approved ? "Godkjenne" : "Fjerne din godkjenning på"} ${scope} ${from} – ${to}?`)) return;
    setNotice("");
    await run(async () => {
      const result = await apiFetch("/time/approve", {
        token, method: "POST",
        body: JSON.stringify({ from, to, approved, ...filters, ...(forUserId ? { user_id: forUserId } : {}) }),
      });
      const skipped = [];
      if (result.skipped_open) skipped.push(`${result.skipped_open} pågår fortsatt`);
      if (result.skipped_locked) skipped.push(`${result.skipped_locked} er låst`);
      setNotice(
        `${result.changed} ${approved ? `signert som ${result.level}` : "satt tilbake til venter"}.` +
        (skipped.length ? ` Hoppet over: ${skipped.join(", ")}.` : "")
      );
    });
  }

  async function setLocked(locked) {
    const what = Object.keys(filters).length ? "utvalget" : "hele perioden";
    if (!window.confirm(locked
      ? `Låse timene for ${what} ${from} – ${to}? Ingen kan endre, godkjenne eller avvise dem før de låses opp igjen.`
      : `Låse opp timene for ${what} ${from} – ${to}?`)) return;
    setNotice("");
    await run(async () => {
      const result = await apiFetch("/time/lock", {
        token, method: "POST", body: JSON.stringify({ from, to, locked, ...filters }),
      });
      setNotice(
        `${result.changed} stemplinger ${locked ? "låst" : "låst opp"}.` +
        (locked && result.skipped_open ? ` ${result.skipped_open} pågår fortsatt og ble hoppet over.` : "")
      );
    });
  }

  function removeEntry(entry) {
    if (!window.confirm(`Slette stemplingen for ${entry.user_name} ${entry.work_date}?`)) return;
    run(() => apiFetch(`/time/entries/${entry.id}`, { token, method: "DELETE" }));
  }

  const totals = data?.totals || [];
  const entries = data?.entries || [];
  const grandTotal = totals.reduce((sum, t) => sum + t.minutes, 0);
  const pendingTotal = totals.reduce((sum, t) => sum + t.approvable_count, 0);
  // Only the arts actually used in this period become columns — the full list is fifteen, and a
  // month of ordinary cleaning uses three of them.
  const usedTypes = useMemo(() => {
    const seen = new Map();
    for (const entry of entries) {
      for (const line of entry.lines || []) {
        const key = line.type_code || line.type_name || "—";
        if (!seen.has(key)) seen.set(key, { key, code: line.type_code, name: line.type_name, kind: line.kind });
      }
    }
    return [...seen.values()];
  }, [entries]);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Timer</h1>
        <div style={{ color: "var(--text-secondary)" }}>
          Stemplet tid per ansatt. Timene starter når renholderen skanner QR-koden.
        </div>
      </div>

      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: 20, overflowX: "auto" }}>
        <TabButton active={section === "timer"} onClick={() => setSection("timer")}>Timer</TabButton>
        <TabButton active={section === "registre"} onClick={() => setSection("registre")}>Registre</TabButton>
      </div>

      {section === "registre" ? (
        <RegisterSection
          token={token} isAdmin={isAdmin} tab={registerTab} setTab={setRegisterTab}
          orders={orders} setOrders={setOrders} sites={sites} staff={staff}
          types={types} setTypes={setTypes} levels={levels} setLevels={setLevels}
        />
      ) : (
      <>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {periodPresets().map((p) => {
            const active = p.from === from && p.to === to;
            return (
              <button
                key={p.label}
                onClick={() => { setFrom(p.from); setTo(p.to); }}
                style={{
                  padding: "4px 11px", borderRadius: 999, fontSize: 12, cursor: "pointer",
                  border: active ? "1px solid var(--brand)" : "1px solid var(--border)",
                  background: active ? "var(--brand-bg)" : "var(--surface-0)",
                  color: active ? "var(--brand-dark)" : "var(--text-secondary)",
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="Fra" style={{ width: 140 }}>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Til" style={{ width: 140 }}>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Ordre" style={{ minWidth: 175, flex: 1 }}>
            <select value={orderId} onChange={(e) => setOrderId(e.target.value)} style={inputStyle}>
              <option value="">Alle ordrer</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>{o.number ? `${o.number} ` : ""}{o.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Lokasjon" style={{ minWidth: 160, flex: 1 }}>
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)} style={inputStyle}>
              <option value="">Alle lokasjoner</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Ansatt" style={{ minWidth: 160, flex: 1 }}>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} style={inputStyle}>
              <option value="">Alle ansatte</option>
              {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          {teams.length > 0 && (
            <Field label="Team" style={{ minWidth: 145 }}>
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)} style={inputStyle}>
                <option value="">Alle team</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
          )}
          {groups.length > 0 && (
            <Field label="Ansattgruppe" style={{ minWidth: 150 }}>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} style={inputStyle}>
                <option value="">Alle grupper</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Godkjenning" style={{ minWidth: 135 }}>
            <select value={approval} onChange={(e) => setApproval(e.target.value)} style={inputStyle}>
              <option value="">Alle</option>
              <option value="pending">Ikke godkjent</option>
              <option value="approved">Godkjent</option>
            </select>
          </Field>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => exportAs("xlsx")} style={{ ...primaryBtnStyle, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <FileSpreadsheet size={14} /> Excel
            </button>
            <button onClick={() => exportAs("pdf")} style={secondaryBtnStyle}>
              <FileText size={14} /> PDF
            </button>
            <button onClick={() => exportAs("csv")} style={secondaryBtnStyle}>
              <Download size={14} /> CSV
            </button>
            <button onClick={() => setShowNew(true)} style={secondaryBtnStyle}>
              <Plus size={14} /> Legg til
            </button>
            {tab === "timeliste" && (
              <ColumnMenu
                usedTypes={usedTypes} hidden={hidden} setHidden={setHidden}
                groupBy={groupBy} setGroupBy={setGroupBy} sortBy={sortBy} setSortBy={setSortBy}
              />
            )}
          </div>
        </div>

        <div style={{
          display: "flex", gap: 14, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)",
          alignItems: "center", flexWrap: "wrap",
        }}>
          {levels.mine ? (
            <>
              <button onClick={() => approveBulk(true)} disabled={busy} style={{ ...linkBtnStyle, display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Check size={13} /> Godkjenn alle i utvalget som {levels.mine.name}{pendingTotal > 0 ? ` (${pendingTotal})` : ""}
              </button>
              <button onClick={() => approveBulk(false)} disabled={busy} style={{ ...linkBtnStyle, color: "var(--text-secondary)" }}>
                Fjern min godkjenning
              </button>
            </>
          ) : (
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Du er ikke tildelt et godkjenningsnivå, så du kan ikke godkjenne timer.
              {isAdmin && " Tildel deg selv under «Godkjenningsnivåer»."}
            </span>
          )}
          {isAdmin && (
            <>
              <span style={{ color: "var(--border)" }}>|</span>
              <button onClick={() => setLocked(true)} disabled={busy} style={{ ...linkBtnStyle, display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Lock size={13} /> Lås perioden
              </button>
              <button onClick={() => setLocked(false)} disabled={busy} style={{ ...linkBtnStyle, display: "inline-flex", alignItems: "center", gap: 5 }}>
                <LockOpen size={13} /> Lås opp
              </button>
            </>
          )}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.5 }}>
          Godkjenning går nivå for nivå — en vakt er ferdig godkjent når alle påkrevde nivåer har signert.
          Låsing er admins, og gjøres når perioden er sendt til lønn.
        </div>
      </Card>

      {error && <div style={{ color: "var(--text-danger)", marginBottom: 12, fontSize: 13 }}>{error}</div>}
      {notice && (
        <div style={{
          marginBottom: 12, fontSize: 13, padding: "8px 12px", borderRadius: "var(--radius)",
          background: "var(--sidebar-active-bg)", color: "var(--text-primary)",
        }}>
          {notice}
        </div>
      )}

      {totals.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
          {totals.map((row) => (
            <Card key={row.user_id}>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{row.user_name}</div>
              <div style={{ fontSize: 22, fontWeight: 600, margin: "2px 0 4px" }}>{formatMinutes(row.minutes)}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {row.entry_count} stemplinger · {row.site_count} lokasjoner
              </div>
              {(row.open_count > 0 || row.missing_count > 0) && (
                <div style={{ fontSize: 12, color: "var(--text-danger)", marginTop: 4 }}>
                  {row.open_count > 0 && `${row.open_count} pågår`}
                  {row.open_count > 0 && row.missing_count > 0 && " · "}
                  {row.missing_count > 0 && `${row.missing_count} mangler utstempling`}
                </div>
              )}
              <div style={{ fontSize: 12, marginTop: 4, color: row.approvable_count > 0 ? "var(--status-progress-dark)" : "var(--text-success)" }}>
                {row.approvable_count > 0 ? `${row.approvable_count} venter godkjenning` : "Alt godkjent"}
              </div>
            </Card>
          ))}
          <Card style={{ background: "var(--sidebar-active-bg)" }}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Totalt i perioden</div>
            <div style={{ fontSize: 22, fontWeight: 600, margin: "2px 0 4px" }}>{formatMinutes(grandTotal)}</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{totals.length} ansatte</div>
          </Card>
        </div>
      )}

      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: 16, overflowX: "auto" }}>
        <TabButton active={tab === "timeliste"} onClick={() => setTab("timeliste")}>Timeliste</TabButton>
        <TabButton active={tab === "ansatte"} onClick={() => setTab("ansatte")}>Ansattvisning</TabButton>
        <TabButton active={tab === "logg"} onClick={() => setTab("logg")}>Endringslogg</TabButton>
        <TabButton active={tab === "plan"} onClick={() => setTab("plan")}>Planlagt mot faktisk</TabButton>
        <TabButton active={tab === "ugyldige"} onClick={() => setTab("ugyldige")}>Ugyldige data</TabButton>
      </div>

      {loading && ["timeliste", "ansatte", "plan"].includes(tab) && <Loading />}
      {!loading && tab === "timeliste" && (
        <EntryTable
          entries={entries} usedTypes={usedTypes} busy={busy} myLevel={levels.mine}
          hidden={hidden} groupBy={groupBy} sortBy={sortBy}
          onEdit={setEditEntry} onDelete={removeEntry} onToggleApproval={toggleApproval} onReject={setRejectEntry}
        />
      )}
      {!loading && tab === "ansatte" && (
        <UserView
          totals={totals} entries={entries} busy={busy} myLevel={levels.mine}
          onApproveUser={(id) => approveBulk(true, id)}
          onToggleApproval={toggleApproval} onReject={setRejectEntry} onEdit={setEditEntry}
        />
      )}
      {tab === "logg" && <LogTab token={token} from={from} to={to} filters={filters} />}
      {!loading && tab === "plan" && <PlannedTable rows={planned?.rows || []} />}
      {tab === "ugyldige" && (
        <AttentionTab token={token} from={from} to={to} filters={filters} onEdit={setEditEntry} />
      )}

      </>
      )}

      {(editEntry || showNew) && (
        <EntryForm
          token={token} entry={editEntry} sites={sites} orders={orders} staff={staff} types={types}
          onClose={() => { setEditEntry(null); setShowNew(false); }}
          onSaved={() => { setEditEntry(null); setShowNew(false); load(); }}
        />
      )}
      {rejectEntry && (
        <RejectDialog
          entry={rejectEntry} busy={busy}
          onClose={() => setRejectEntry(null)}
          onReject={(comment) => rejectWithComment(rejectEntry, comment)}
        />
      )}
    </div>
  );
}

// --- Registre ------------------------------------------------------------------------------------

// The master data behind the hours, kept out of the daily work. Mobile Worker groups the same
// things under its own "Registre" menu (Timearter, Tilleggstype, Godkjenningsnivå, Avdeling …);
// with four working views and four registers, one flat row of eight tabs was the problem.
//
// Timearter and Tilleggstyper are one table split by kind, listed apart because that is how OKV
// already thinks of them — hours you work versus supplements you earn.
function RegisterSection({ token, isAdmin, tab, setTab, orders, setOrders, sites, staff, types, setTypes, levels, setLevels }) {
  const registers = [
    { id: "ordrer", label: "Ordrer" },
    { id: "timearter", label: "Timearter", adminOnly: true },
    { id: "tillegg", label: "Tilleggstyper", adminOnly: true },
    { id: "nivaa", label: "Godkjenningsnivå", adminOnly: true },
    { id: "team", label: "Team" },
    { id: "grupper", label: "Ansattgrupper" },
  ].filter((r) => isAdmin || !r.adminOnly);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        {registers.map((r) => {
          const active = tab === r.id;
          return (
            <button
              key={r.id}
              onClick={() => setTab(r.id)}
              style={{
                padding: "7px 14px", borderRadius: 999, fontSize: 13, cursor: "pointer",
                border: active ? "1px solid var(--brand)" : "1px solid var(--border)",
                background: active ? "var(--brand-bg)" : "var(--surface-0)",
                color: active ? "var(--brand-dark)" : "var(--text-secondary)",
                fontWeight: active ? 600 : 400,
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {tab === "ordrer" && (
        <OrdersTab token={token} orders={orders} sites={sites} staff={staff} onChanged={setOrders} />
      )}
      {tab === "timearter" && <TimeTypesTab token={token} types={types} onChanged={setTypes} kind="hours" />}
      {tab === "tillegg" && <TimeTypesTab token={token} types={types} onChanged={setTypes} kind="supplement" />}
      {tab === "nivaa" && <LevelsTab token={token} levels={levels} onChanged={setLevels} />}
      {tab === "team" && (
        <StaffRegisterTab
          token={token} register="teams" heading="Team"
          blurb="Team er hvor folk fysisk jobber — Bergen, Rørvik, Nortura Malvik. Det er ikke det
                 samme som avdeling, som er enheten de lønnes under, og begge filtrerer timelista."
        />
      )}
      {tab === "grupper" && (
        <StaffRegisterTab
          token={token} register="employee-groups" heading="Ansattgruppe"
          blurb="Ansattgruppe er hva slags ansatte det er — Renhold, Teamleder/Ledelse. Brukes til å
                 skille ut én type ansatte i timelista."
        />
      )}
    </div>
  );
}

// --- Timeliste (pivot, med kolonnevelger) --------------------------------------------------------

// Every column the timesheet can show, in Mobile Worker's own order and vocabulary. `key` is what
// the picker stores, `value` pulls it off a row. The lønnsart columns are appended at runtime —
// only the arts actually used in the period become columns, because the full list is fifteen and a
// month of ordinary cleaning uses three.
const BASE_COLUMNS = [
  { key: "work_date", label: "Fra dato", nowrap: true, value: (e) => e.work_date, sort: (e) => e.work_date },
  { key: "user_name", label: "Ansattnavn", value: (e) => e.user_name, sort: (e) => e.user_name },
  { key: "employee_number", label: "Ansattnummer", nowrap: true, off: true, value: (e) => e.employee_number || "—" },
  { key: "week", label: "Fra uke", nowrap: true, off: true, value: (e) => isoWeek(e.work_date) },
  { key: "order", label: "Ordre", value: (e) => [e.order_number, e.order_name].filter(Boolean).join(" ") || "—", sort: (e) => e.order_name || "" },
  { key: "project", label: "Prosjekt", off: true, value: (e) => e.project_name || "—", sort: (e) => e.project_name || "" },
  { key: "site_name", label: "Lokasjon", value: (e) => e.site_name || "—", sort: (e) => e.site_name || "" },
  { key: "start", label: "Fra tid", nowrap: true, value: (e) => osloTime(e.started_at), sort: (e) => e.started_at || "" },
  { key: "end", label: "Til tid", nowrap: true, value: (e) => osloTime(e.ended_at) || "—" },
  { key: "note", label: "Beskrivelse", off: true, value: (e) => e.note || "" },
  { key: "plassering", label: "Plassering", off: true, value: (e) => (e.start_gps_verified ? "Bekreftet på stedet" : e.started_at ? "Ikke bekreftet" : "") },
  { key: "created", label: "Opprettet", nowrap: true, off: true, value: (e) => (e.created_at || "").slice(0, 16) },
  { key: "edited", label: "Endret", nowrap: true, off: true, value: (e) => (e.edited_at ? `${e.edited_at.slice(0, 16)} ${e.edited_by_initials || ""}`.trim() : "") },
  { key: "source", label: "Kilde", nowrap: true, off: true, value: (e) => (e.source === "manual" ? "Manuelt" : "QR") },
];

// Everything after the lønnsart columns. Kept apart so the arts always land in the middle, the way
// they do in Mobile Worker.
const TAIL_COLUMNS = [
  { key: "minutes", label: "Sum arbeidede timer", align: "right", nowrap: true, bold: true, sum: (e) => e.minutes || 0, value: (e) => formatMinutes(e.minutes), sort: (e) => e.minutes || 0 },
  { key: "billing", label: "Beregning", off: true, nowrap: true, value: (e) => BILLING_LABEL[e.billing_mode] || "" },
  { key: "approval", label: "Godkjenning", value: null },
  { key: "status", label: "Status", value: null },
  { key: "actions", label: "", value: null },
];

// ISO week, which is what "Fra uke" means to a Norwegian payroll office.
function isoWeek(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const fDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fDay + 3);
  return 1 + Math.round((d - firstThursday) / (7 * 86400000));
}

function EntryTable({
  entries, usedTypes, onEdit, onDelete, onToggleApproval, onReject, busy, myLevel,
  hidden, groupBy, sortBy,
}) {
  if (entries.length === 0) {
    return <Card style={{ textAlign: "center", color: "var(--text-secondary)" }}>Ingen stemplinger i utvalget.</Card>;
  }

  const typeColumns = usedTypes.map((t) => ({
    key: `art:${t.key}`,
    label: t.name || t.key,
    title: t.code || "",
    align: "right",
    nowrap: true,
    isType: true,
    type: t,
    sum: (e) => sumOfType(e, t),
    value: (e) => {
      const v = sumOfType(e, t);
      return v ? (t.kind === "supplement" ? `${v} stk` : formatMinutes(v)) : null;
    },
  }));

  const columns = [...BASE_COLUMNS, ...typeColumns, ...TAIL_COLUMNS].filter((c) => !hidden.includes(c.key));

  // Grouping mirrors Mobile Worker's "Gruppert etter": the rows stay in one table, with a subtotal
  // band per group. Sorting is applied inside each group so the two can be used together.
  const sorted = [...entries];
  const sortCol = columns.find((c) => c.key === sortBy?.key);
  if (sortCol) {
    const get = sortCol.sort || sortCol.sum || sortCol.value;
    sorted.sort((a, b) => {
      const av = get(a) ?? "";
      const bv = get(b) ?? "";
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "nb");
      return sortBy.desc ? -cmp : cmp;
    });
  }

  const groupCol = BASE_COLUMNS.find((c) => c.key === groupBy);
  const groups = groupCol
    ? [...sorted.reduce((m, e) => {
        const k = String(groupCol.value(e) ?? "—");
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(e);
        return m;
      }, new Map())].map(([name, rows]) => ({ name, rows }))
    : [{ name: null, rows: sorted }];

  const sumFor = (rows, col) => (col.sum ? rows.reduce((s, e) => s + col.sum(e), 0) : null);
  const renderSum = (col, total) =>
    total == null ? "" : col.isType && col.type.kind === "supplement" ? `${total} stk` : formatMinutes(total);

  return (
    <Card style={{ padding: 0, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 260 + columns.length * 88 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 12 }}>
            {columns.map((c) => (
              <th key={c.key} style={{ ...thStyle, textAlign: c.align || "left" }} title={c.title || ""}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.name ?? "alle"}>
              {group.name != null && (
                <tr style={{ background: "var(--surface-2)", fontWeight: 600 }}>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }} colSpan={columns.length}>
                    {groupCol.label}: {group.name} — {group.rows.length} stemplinger,{" "}
                    {formatMinutes(group.rows.reduce((s, e) => s + (e.minutes || 0), 0))}
                  </td>
                </tr>
              )}
              {group.rows.map((e) => (
                <tr key={e.id} style={{ borderTop: "1px solid var(--border)" }}>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      style={{
                        ...(c.nowrap ? tdNowrapStyle : tdStyle),
                        textAlign: c.align || "left",
                        fontWeight: c.bold ? 600 : 400,
                      }}
                    >
                      {renderCell(c, e, { onEdit, onDelete, onToggleApproval, onReject, busy, myLevel })}
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
          {/* The row the pivot exists for: each lønnsart summed down its own column. */}
          <tr style={{ borderTop: "2px solid var(--border)", background: "var(--sidebar-active-bg)", fontWeight: 600 }}>
            {columns.map((c, i) => (
              <td key={c.key} style={{ ...tdNowrapStyle, textAlign: c.align || "left" }}>
                {i === 0 ? `Sum (${entries.length})` : renderSum(c, sumFor(entries, c))}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

function sumOfType(entry, type) {
  return (entry.lines || [])
    .filter((l) => (l.type_code || l.type_name || "—") === type.key)
    .reduce((s, l) => s + (type.kind === "supplement" ? l.quantity || 0 : l.minutes || 0), 0);
}

function renderCell(column, e, handlers) {
  if (column.key === "approval") {
    return (
      <ApproveCell entry={e} onToggle={handlers.onToggleApproval} onReject={handlers.onReject} busy={handlers.busy} myLevel={handlers.myLevel} />
    );
  }
  if (column.key === "status") {
    return (
      <>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <Pill label={STATUS_LABEL[e.status]} colors={STATUS_COLOR[e.status]} />
          {e.source === "manual" && <Pill label="Manuell" colors={{ bg: "var(--surface-2)", color: "var(--text-secondary)" }} />}
          {e.locked && <Pill label="Låst" colors={{ bg: "var(--surface-2)", color: "var(--text-secondary)" }} />}
        </div>
        {e.note && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{e.note}</div>}
      </>
    );
  }
  if (column.key === "actions") {
    return e.locked ? null : (
      <span style={{ whiteSpace: "nowrap" }}>
        <button onClick={() => handlers.onEdit(e)} aria-label="Rediger" style={iconStyle}><Pencil size={14} /></button>
        <button onClick={() => handlers.onDelete(e)} aria-label="Slett" style={iconStyle}><Trash2 size={14} /></button>
      </span>
    );
  }
  if (column.key === "user_name") {
    return (
      <>
        {e.user_name}
        {/* Somebody other than the person the weekly plan expected. Information, not an error —
            cleaners cover for each other here as a matter of course. */}
        {e.as_planned === false && (
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            planlagt: {e.assigned_cleaner_name || "ingen"}
          </div>
        )}
      </>
    );
  }
  if (column.key === "start" || column.key === "end") {
    const verified = column.key === "start" ? e.start_gps_verified : e.end_gps_verified;
    return (
      <>
        {column.value(e)}
        {verified && <span title="GPS bekreftet på stedet" style={gpsDotStyle} />}
      </>
    );
  }
  const value = column.value(e);
  return value ?? <span style={{ color: "var(--border)" }}>·</span>;
}

// --- Kolonnevelger -------------------------------------------------------------------------------

// Mobile Worker puts grouping, three levels of sorting and column visibility behind one "Kolonner"
// button per grid. One level of sorting here rather than three: the pivot already groups, and two
// tie-breakers below a group heading is a control nobody reaches for.
function ColumnMenu({ usedTypes, hidden, setHidden, groupBy, setGroupBy, sortBy, setSortBy }) {
  const [open, setOpen] = useState(false);
  const all = [
    ...BASE_COLUMNS,
    ...usedTypes.map((t) => ({ key: `art:${t.key}`, label: t.name || t.key })),
    ...TAIL_COLUMNS.filter((c) => c.label),
  ];
  const groupable = BASE_COLUMNS.filter((c) => ["user_name", "order", "project", "site_name", "week", "work_date"].includes(c.key));

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} style={secondaryBtnStyle}>
        <Columns3 size={14} /> Kolonner
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{
            position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 41, width: 260,
            background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)", padding: 12, maxHeight: 420, overflowY: "auto",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 }}>
              Gruppert etter
            </div>
            <select value={groupBy || ""} onChange={(e) => setGroupBy(e.target.value || null)} style={{ ...inputStyle, fontSize: 13, padding: "6px 8px" }}>
              <option value="">Ingen gruppering</option>
              {groupable.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>

            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", margin: "12px 0 6px" }}>
              Sortert etter
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <select
                value={sortBy?.key || ""}
                onChange={(e) => setSortBy(e.target.value ? { key: e.target.value, desc: sortBy?.desc || false } : null)}
                style={{ ...inputStyle, fontSize: 13, padding: "6px 8px", flex: 1 }}
              >
                <option value="">Standard</option>
                {all.filter((c) => c.key !== "actions").map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <button
                onClick={() => setSortBy(sortBy ? { ...sortBy, desc: !sortBy.desc } : null)}
                disabled={!sortBy}
                title="Snu rekkefølgen"
                style={{ ...secondaryBtnStyle, padding: "6px 10px", opacity: sortBy ? 1 : 0.4 }}
              >
                {sortBy?.desc ? "↓" : "↑"}
              </button>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", margin: "12px 0 6px" }}>
              Vis kolonne
            </div>
            {all.map((c) => (
              <label key={c.key} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, padding: "3px 0", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!hidden.includes(c.key)}
                  onChange={(e) => setHidden(e.target.checked ? hidden.filter((k) => k !== c.key) : [...hidden, c.key])}
                />
                {c.label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// --- Ansattvisning -------------------------------------------------------------------------------

function UserView({ totals, entries, onApproveUser, onToggleApproval, onReject, onEdit, busy, myLevel }) {
  const [openUserId, setOpenUserId] = useState(null);
  const entriesByUser = useMemo(() => {
    const map = new Map();
    for (const entry of entries) {
      if (!map.has(entry.user_id)) map.set(entry.user_id, []);
      map.get(entry.user_id).push(entry);
    }
    return map;
  }, [entries]);

  if (totals.length === 0) {
    return <Card style={{ textAlign: "center", color: "var(--text-secondary)" }}>Ingen timer i utvalget.</Card>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {totals.map((row) => {
        const open = openUserId === row.user_id;
        const userEntries = entriesByUser.get(row.user_id) || [];
        return (
          <Card key={row.user_id} style={{ padding: 0 }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              gap: 12, padding: 16, flexWrap: "wrap",
            }}>
              <button
                onClick={() => setOpenUserId(open ? null : row.user_id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, background: "none", border: "none",
                  cursor: "pointer", padding: 0, color: "var(--text-primary)", textAlign: "left",
                }}
              >
                {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>{row.user_name}</span>
                  <span style={{ display: "block", fontSize: 12, color: "var(--text-secondary)" }}>
                    {row.entry_count} stemplinger · {row.site_count} lokasjoner
                  </span>
                </span>
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 20, fontWeight: 600 }}>{formatMinutes(row.minutes)}</div>
                  <div style={{ fontSize: 12, color: row.approvable_count > 0 ? "var(--status-progress-dark)" : "var(--text-success)" }}>
                    {row.approvable_count > 0 ? `${row.approvable_count} venter godkjenning` : "Alt godkjent"}
                  </div>
                </div>
                <button
                  onClick={() => onApproveUser(row.user_id)}
                  disabled={busy || row.approvable_count === 0 || !myLevel}
                  title={myLevel ? `Godkjenn som ${myLevel.name}` : "Du er ikke tildelt et godkjenningsnivå"}
                  style={{
                    ...primaryBtnStyle, display: "inline-flex", alignItems: "center", gap: 6,
                    opacity: busy || row.approvable_count === 0 || !myLevel ? 0.45 : 1,
                    cursor: busy || row.approvable_count === 0 || !myLevel ? "default" : "pointer",
                  }}
                >
                  <Check size={14} /> Godkjenn alle
                </button>
              </div>
            </div>

            {/* The per-lønnsart split: "7t 30m" is not what goes to payroll, "6t ordinær +
                1t 30m overtid 50 %" is. Lunsj shows here too, outside the paid total — leaving it
                out would make the person's own clock look wrong. */}
            {row.types.length > 0 && (
              <div style={{ padding: "0 16px 16px", display: "flex", gap: 10, flexWrap: "wrap" }}>
                {row.types.map((t) => (
                  <div key={t.code || t.name} style={{
                    border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "6px 12px", minWidth: 128,
                  }}>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{t.name || "Uten lønnsart"}</div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>
                      {t.kind === "supplement" ? `${t.quantity} stk` : formatMinutes(t.minutes)}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{t.code || ""}</div>
                  </div>
                ))}
              </div>
            )}

            {open && (
              <div style={{ borderTop: "1px solid var(--border)", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 12 }}>
                      <th style={thStyle}>Dato</th>
                      <th style={thStyle}>Ordre</th>
                      <th style={thStyle}>Inn</th>
                      <th style={thStyle}>Ut</th>
                      <th style={thStyle}>Timer</th>
                      <th style={thStyle}>Godkjenning</th>
                      <th style={thStyle} />
                    </tr>
                  </thead>
                  <tbody>
                    {userEntries.map((e) => (
                      <tr key={e.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={tdNowrapStyle}>{e.work_date}</td>
                        <td style={tdStyle}>{e.order_name || e.site_name || "—"}</td>
                        <td style={tdNowrapStyle}>{osloTime(e.started_at)}</td>
                        <td style={tdNowrapStyle}>{osloTime(e.ended_at) || "—"}</td>
                        <td style={{ ...tdNowrapStyle, fontWeight: 600 }}>{formatMinutes(e.minutes)}</td>
                        <td style={tdStyle}>
                          <ApproveCell entry={e} onToggle={onToggleApproval} onReject={onReject} busy={busy} myLevel={myLevel} />
                        </td>
                        <td style={tdStyle}>
                          {!e.locked && (
                            <button onClick={() => onEdit(e)} aria-label="Rediger" style={iconStyle}><Pencil size={14} /></button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// --- Endringslogg --------------------------------------------------------------------------------

// Append-only, and read far more often than it is written: this is where "why does this say 6 hours
// when she was there 8" is answered, months after anybody remembers.
const ACTION_LABEL = {
  stamped_in: "Stemplet inn", stamped_out: "Stemplet ut", auto_closed: "Auto-avsluttet",
  created: "Registrert", edited: "Endret", approved: "Godkjent", rejected: "Avvist",
  approval_cleared: "Godkjenning fjernet", locked: "Låst", unlocked: "Låst opp",
};

function LogTab({ token, from, to, filters }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const query = new URLSearchParams({ from, to, ...filters }).toString();

  useEffect(() => {
    setRows(null);
    apiFetch(`/time/log?${query}`, { token }).then(setRows).catch((err) => setError(err.message));
  }, [query, token]);

  if (error) return <div style={{ color: "var(--text-danger)", fontSize: 13 }}>{error}</div>;
  if (!rows) return <Loading />;
  if (rows.length === 0) {
    return <Card style={{ textAlign: "center", color: "var(--text-secondary)" }}>Ingen hendelser i perioden.</Card>;
  }

  return (
    <Card style={{ padding: 0, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 820 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 12 }}>
            <th style={thStyle}>Tid</th>
            <th style={thStyle}>Hendelse</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Gjelder</th>
            <th style={thStyle}>Utført av</th>
            <th style={thStyle}>Kommentar</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={tdNowrapStyle}>{String(r.at).slice(0, 16)}</td>
              <td style={tdNowrapStyle}>{ACTION_LABEL[r.action] || r.action}</td>
              <td style={tdStyle}>{r.status || "—"}</td>
              <td style={tdStyle}>
                {r.entry_user_name}
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  {r.work_date} · {r.order_name || r.site_name || "—"}
                </div>
              </td>
              {/* No user means the app did it on its own — an auto-close when she stamped in
                  somewhere else, or a shift left open into a new day. */}
              <td style={tdStyle}>{r.user_name || <span style={{ color: "var(--text-muted)" }}>automatisk</span>}</td>
              <td style={tdStyle}>{r.comment || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// --- Planlagt mot faktisk ------------------------------------------------------------------------

function PlannedTable({ rows }) {
  if (rows.length === 0) {
    return <Card style={{ textAlign: "center", color: "var(--text-secondary)" }}>Ingen planlagte dager i perioden.</Card>;
  }
  return (
    <Card style={{ padding: 0, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 760 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 12 }}>
            <th style={thStyle}>Dato</th>
            <th style={thStyle}>Lokasjon</th>
            <th style={thStyle}>Planlagt renholder</th>
            <th style={thStyle}>Faktisk</th>
            <th style={thStyle}>Rammetimer</th>
            <th style={thStyle}>Stemplet</th>
            <th style={thStyle}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.site_id}-${row.date}-${row.status}`} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={tdNowrapStyle}>{row.date}</td>
              <td style={tdStyle}>{row.site_name}</td>
              <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{row.assigned_cleaner_name || "—"}</td>
              <td style={tdStyle}>{row.actual_names.join(", ") || "—"}</td>
              <td style={{ ...tdNowrapStyle, color: "var(--text-secondary)" }}>
                {row.planned_minutes != null ? formatMinutes(row.planned_minutes) : "—"}
              </td>
              <td style={{ ...tdNowrapStyle, fontWeight: 600 }}>
                {row.actual_minutes != null ? formatMinutes(row.actual_minutes) : "—"}
              </td>
              <td style={tdStyle}><Pill label={PLANNED_LABEL[row.status]} colors={PLANNED_COLOR[row.status]} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// --- Ordrer --------------------------------------------------------------------------------------

const ORDER_KIND_LABEL = { customer: "Kunde", internal: "Internt", absence: "Fravær" };

// The order book. A customer order is a building with a QR code; an internal or absence order has
// no site at all, and is the only way hours that are not spent at a customer can be registered.
function OrdersTab({ token, orders, sites, staff, onChanged }) {
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", number: "", kind: "internal", cost_center: "", manager_id: "" });

  async function call(fn) {
    setError("");
    try {
      onChanged(await fn());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const unfiled = sites.filter((s) => !orders.some((o) => o.id === s.order_id));

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          Ordren er det timene føres på. En kundeordre henger sammen med en lokasjon og fylles av
          QR-stemplinger. En intern- eller fraværsordre har ingen lokasjon — det er den som gjør det
          mulig å føre møtetid, kjøring, ferie og sykefravær i det hele tatt.
        </div>
        <button onClick={() => setShowNew((v) => !v)} style={{ ...secondaryBtnStyle, marginTop: 12 }}>
          <Plus size={14} /> Ny ordre
        </button>
        {showNew && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusyId("new");
              await call(() => apiFetch("/time/orders", { token, method: "POST", body: JSON.stringify(form) }));
              setForm({ name: "", number: "", kind: "internal", cost_center: "", manager_id: "" });
              setShowNew(false);
            }}
            style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 }}
          >
            <Field label="Nummer" style={{ width: 110 }}>
              <input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} placeholder="1014" style={inputStyle} />
            </Field>
            <Field label="Navn" style={{ width: 210 }}>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Type" style={{ width: 130 }}>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} style={inputStyle}>
                <option value="customer">Kunde</option>
                <option value="internal">Internt</option>
                <option value="absence">Fravær</option>
              </select>
            </Field>
            <Field label="Kostnadssted" style={{ width: 140 }}>
              <input value={form.cost_center} onChange={(e) => setForm({ ...form, cost_center: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Ordreansvarlig" style={{ width: 175 }}>
              <select value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })} style={inputStyle}>
                <option value="">Ingen</option>
                {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
            <button type="submit" disabled={busyId === "new"} style={{ ...primaryBtnStyle, marginBottom: 8 }}>Lagre</button>
          </form>
        )}
      </Card>

      {error && <div style={{ color: "var(--text-danger)", marginBottom: 12, fontSize: 13 }}>{error}</div>}
      {unfiled.length > 0 && (
        <Card style={{ marginBottom: 16, fontSize: 13 }}>
          <strong>{unfiled.length} lokasjoner er ikke lagt under en ordre</strong> — timer stemplet der får
          ingen ordre og blir stående tomme i lønnseksporten: {unfiled.map((s) => s.name).join(", ")}.
        </Card>
      )}

      <Card style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 820 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 12 }}>
              <th style={thStyle}>Nr.</th>
              <th style={thStyle}>Ordre</th>
              <th style={thStyle}>Prosjekt</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Kunde</th>
              <th style={thStyle}>Kostnadssted</th>
              <th style={thStyle}>Lokasjoner</th>
              <th style={thStyle}>Kan føres uten lokasjon</th>
              <th style={thStyle} />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} style={{ borderTop: "1px solid var(--border)", opacity: o.active ? 1 : 0.5 }}>
                <td style={tdNowrapStyle}>{o.number || "—"}</td>
                <td style={tdStyle}>{o.name}</td>
                <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{o.project_name || "—"}</td>
                <td style={tdNowrapStyle}>{ORDER_KIND_LABEL[o.kind] || o.kind}</td>
                <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{o.client_name || "—"}</td>
                <td style={tdStyle}>
                  <input
                    defaultValue={o.cost_center || ""} disabled={busyId === o.id}
                    onBlur={(e) => e.target.value !== (o.cost_center || "") && call(() =>
                      apiFetch(`/time/orders/${o.id}`, { token, method: "PATCH", body: JSON.stringify({ cost_center: e.target.value }) }))}
                    style={{ ...inputStyle, fontSize: 13, padding: "5px 8px", width: 120 }}
                  />
                </td>
                <td style={tdNowrapStyle}>{o.site_count}</td>
                <td style={tdStyle}>
                  <input
                    type="checkbox" checked={o.allows_manual} disabled={busyId === o.id}
                    onChange={(e) => call(() =>
                      apiFetch(`/time/orders/${o.id}`, { token, method: "PATCH", body: JSON.stringify({ allows_manual: e.target.checked }) }))}
                  />
                </td>
                <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                  {!o.active && <span style={{ fontSize: 11, color: "var(--text-secondary)", marginRight: 8 }}>skjult</span>}
                  <button
                    onClick={() => {
                      if (!window.confirm(`Fjerne ordren «${o.name}»? Timer som allerede er ført på den blir stående.`)) return;
                      setBusyId(o.id);
                      call(async () => {
                        await apiFetch(`/time/orders/${o.id}`, { token, method: "DELETE" });
                        return apiFetch("/time/orders?all=1", { token });
                      });
                    }}
                    aria-label="Fjern" style={iconStyle}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// --- Godkjenningsnivåer --------------------------------------------------------------------------

// Who may approve is an org-chart question, not a role question: a person with no level cannot
// approve even as an admin, and each person signs at exactly one level.
function LevelsTab({ token, levels, onChanged }) {
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");

  async function call(fn) {
    setError("");
    try {
      await fn();
      onChanged(await apiFetch("/time/approval-levels", { token }));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          En vakt klatrer opp stigen og er ferdig godkjent når alle <strong>påkrevde</strong> nivåer har
          signert. Et valgfritt nivå kan signere, men holder ingenting igjen — nyttig for et nivå som
          ofte er bortreist.
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            call(() => apiFetch("/time/approval-levels", { token, method: "POST", body: JSON.stringify({ name: newName }) }));
            setNewName("");
          }}
          style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "flex-end" }}
        >
          <Field label="Nytt nivå" style={{ width: 220 }}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Kvalitet" style={inputStyle} />
          </Field>
          <button type="submit" style={{ ...primaryBtnStyle, marginBottom: 8 }}>Legg til</button>
        </form>
      </Card>

      {error && <div style={{ color: "var(--text-danger)", marginBottom: 12, fontSize: 13 }}>{error}</div>}

      <Card style={{ padding: 0, marginBottom: 16, overflowX: "auto" }}>
        <div style={{ padding: "12px 16px", fontWeight: 600, fontSize: 14 }}>Nivåer</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 520 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 12 }}>
              <th style={thStyle}>Steg</th>
              <th style={thStyle}>Navn</th>
              <th style={thStyle}>Påkrevd</th>
              <th style={thStyle}>Personer</th>
              <th style={thStyle} />
            </tr>
          </thead>
          <tbody>
            {levels.levels.map((l) => (
              <tr key={l.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={tdNowrapStyle}>
                  <input
                    type="number" defaultValue={l.step} min={1}
                    onBlur={(e) => Number(e.target.value) !== l.step && call(() =>
                      apiFetch(`/time/approval-levels/${l.id}`, { token, method: "PATCH", body: JSON.stringify({ step: Number(e.target.value) }) }))}
                    style={{ ...inputStyle, fontSize: 13, padding: "5px 8px", width: 64 }}
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    defaultValue={l.name}
                    onBlur={(e) => e.target.value !== l.name && call(() =>
                      apiFetch(`/time/approval-levels/${l.id}`, { token, method: "PATCH", body: JSON.stringify({ name: e.target.value }) }))}
                    style={{ ...inputStyle, fontSize: 13, padding: "5px 8px" }}
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    type="checkbox" checked={l.required}
                    onChange={(e) => call(() =>
                      apiFetch(`/time/approval-levels/${l.id}`, { token, method: "PATCH", body: JSON.stringify({ required: e.target.checked }) }))}
                  />
                </td>
                <td style={tdNowrapStyle}>{l.user_count}</td>
                <td style={tdStyle}>
                  <button
                    onClick={() => {
                      if (!window.confirm(`Fjerne nivået «${l.name}»? Signaturer som allerede er gitt på det blir stående.`)) return;
                      call(() => apiFetch(`/time/approval-levels/${l.id}`, { token, method: "DELETE" }));
                    }}
                    aria-label="Fjern" style={iconStyle}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card style={{ padding: 0, overflowX: "auto" }}>
        <div style={{ padding: "12px 16px", fontWeight: 600, fontSize: 14 }}>Hvem signerer hvor</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 460 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 12 }}>
              <th style={thStyle}>Ansatt</th>
              <th style={thStyle}>Nivå</th>
            </tr>
          </thead>
          <tbody>
            {levels.users.map((u) => (
              <tr key={u.user_id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={tdStyle}>{u.user_name}</td>
                <td style={tdStyle}>
                  <select
                    value={u.level_id || ""}
                    onChange={(e) => call(() =>
                      apiFetch(`/time/approval-levels/users/${u.user_id}`, {
                        token, method: "PATCH", body: JSON.stringify({ level_id: e.target.value ? Number(e.target.value) : null }),
                      }))}
                    style={{ ...inputStyle, fontSize: 13, padding: "5px 8px", width: 200 }}
                  >
                    <option value="">Kan ikke godkjenne</option>
                    {levels.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// --- Lønnsarter ----------------------------------------------------------------------------------

function TimeTypesTab({ token, types, onChanged, kind = "hours" }) {
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ kind, code: "", name: "", counts_as_work: true });

  async function call(path, options, id) {
    setBusyId(id ?? "new");
    setError("");
    try {
      onChanged(await apiFetch(path, { token, ...options }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  // Hours split into work and absence, because they are read for different reasons; supplements
  // are their own register entirely.
  const groups = kind === "supplement"
    ? [["Tilleggstyper", types.filter((t) => t.kind === "supplement")]]
    : [
        ["Arbeid", types.filter((t) => t.kind === "hours" && t.category !== "fravær")],
        ["Fravær", types.filter((t) => t.category === "fravær")],
      ];

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          Lønnsartene timene føres på. <strong>Koden</strong> er det Unimicro leser ved import, så den må
          stemme med lønnssystemet. Endrer du en kode, beholder allerede førte timer sin gamle — hver
          linje tar vare på sin egen. Arter som ikke <em>teller som arbeid</em> (lunsj, og alle tillegg)
          eksporteres, men holdes utenfor «sum arbeidede timer». Ferie og sykefravær teller med — det
          er en tidssum, ikke en lønnssum, og hvem som betaler avgjøres av koden i Unimicro.
        </div>
        <button onClick={() => setShowNew((v) => !v)} style={{ ...secondaryBtnStyle, marginTop: 12 }}>
          <Plus size={14} /> {kind === "supplement" ? "Ny tilleggstype" : "Ny timeart"}
        </button>
        {showNew && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!form.code.trim() || !form.name.trim()) return;
              await call("/time/types", { method: "POST", body: JSON.stringify(form) });
              setForm({ kind, code: "", name: "", counts_as_work: true });
              setShowNew(false);
            }}
            style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 }}
          >
            <Field label="Kode (til lønn)" style={{ width: 200 }}>
              <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="T.OVERTID 50 %" style={inputStyle} />
            </Field>
            <Field label="Navn" style={{ width: 190 }}>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Overtid 50 %" style={inputStyle} />
            </Field>
            {form.kind === "hours" && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, paddingBottom: 8 }}>
                <input type="checkbox" checked={form.counts_as_work} onChange={(e) => setForm({ ...form, counts_as_work: e.target.checked })} />
                Teller som arbeidstid
              </label>
            )}
            <button type="submit" disabled={busyId === "new"} style={{ ...primaryBtnStyle, marginBottom: 8 }}>Lagre</button>
          </form>
        )}
      </Card>

      {error && <div style={{ color: "var(--text-danger)", marginBottom: 12, fontSize: 13 }}>{error}</div>}

      {groups.filter(([, list]) => list.length > 0).map(([heading, list]) => (
        <Card key={heading} style={{ padding: 0, marginBottom: 16, overflowX: "auto" }}>
          <div style={{ padding: "12px 16px", fontWeight: 600, fontSize: 14 }}>{heading}</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 620 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 12 }}>
                <th style={thStyle}>Kode</th>
                <th style={thStyle}>Navn</th>
                {heading !== "Tillegg / annet" && <th style={thStyle}>Teller som arbeid</th>}
                {heading === "Arbeid" && <th style={thStyle}>Standard</th>}
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} style={{ borderTop: "1px solid var(--border)", opacity: t.active ? 1 : 0.5 }}>
                  <td style={tdStyle}>
                    <input
                      defaultValue={t.code} disabled={busyId === t.id}
                      onBlur={(e) => e.target.value !== t.code && call(`/time/types/${t.id}`, { method: "PATCH", body: JSON.stringify({ code: e.target.value }) }, t.id)}
                      style={{ ...inputStyle, fontSize: 13, padding: "5px 8px" }}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      defaultValue={t.name} disabled={busyId === t.id}
                      onBlur={(e) => e.target.value !== t.name && call(`/time/types/${t.id}`, { method: "PATCH", body: JSON.stringify({ name: e.target.value }) }, t.id)}
                      style={{ ...inputStyle, fontSize: 13, padding: "5px 8px" }}
                    />
                  </td>
                  {heading !== "Tillegg / annet" && (
                    <td style={tdStyle}>
                      <input
                        type="checkbox" checked={t.counts_as_work} disabled={busyId === t.id}
                        onChange={(e) => call(`/time/types/${t.id}`, { method: "PATCH", body: JSON.stringify({ counts_as_work: e.target.checked }) }, t.id)}
                      />
                    </td>
                  )}
                  {heading === "Arbeid" && (
                    <td style={tdStyle}>
                      {/* The art a QR stamping becomes. Exactly one, so it is a radio. */}
                      <input
                        type="radio" name="default-type" checked={t.is_default} disabled={busyId === t.id || !t.active}
                        onChange={() => call(`/time/types/${t.id}`, { method: "PATCH", body: JSON.stringify({ is_default: true }) }, t.id)}
                      />
                    </td>
                  )}
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    {!t.active && <span style={{ fontSize: 11, color: "var(--text-secondary)", marginRight: 8 }}>skjult</span>}
                    <button
                      onClick={async () => {
                        if (!window.confirm(`Fjerne «${t.name}»? Den forsvinner fra nedtrekkslistene, men blir stående på timene som allerede bruker den.`)) return;
                        setBusyId(t.id);
                        try {
                          await apiFetch(`/time/types/${t.id}`, { token, method: "DELETE" });
                          onChanged(await apiFetch("/time/types?all=1", { token }));
                        } catch (err) {
                          setError(err.message);
                        } finally {
                          setBusyId(null);
                        }
                      }}
                      aria-label="Fjern" style={iconStyle}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}

// --- Avvis ---------------------------------------------------------------------------------------

// The reason is required: a rejection without one just moves the confusion to the person who has to
// fix it. Rejecting also strips every signature the shift already had — they were given for hours
// that are about to change.
function RejectDialog({ entry, onClose, onReject, busy }) {
  const [comment, setComment] = useState("");
  return (
    <div onClick={onClose} style={modalBackdropStyle}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...modalStyle, maxWidth: 460 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 17, fontWeight: 600 }}>
            <XCircle size={17} /> Avvis timen
          </div>
          <button onClick={onClose} aria-label="Lukk" style={iconStyle}><X size={18} /></button>
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
          {entry.user_name} — {entry.work_date} — {entry.order_name || entry.site_name} — {formatMinutes(entry.minutes)}
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); if (comment.trim()) onReject(comment.trim()); }}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <Field label="Hvorfor avvises den?">
            <textarea
              required autoFocus value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder="Du har ført 8 timer, men var her bare til 14. Ring meg."
              style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
            />
          </Field>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Alle signaturer på vakta fjernes, og den går tilbake til «venter».
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={secondaryBtnStyle}>Avbryt</button>
            <button type="submit" disabled={busy || !comment.trim()} style={primaryBtnStyle}>Avvis</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Registrering / retting ----------------------------------------------------------------------

function emptyHoursLine(types) {
  const first = types.find((t) => t.kind === "hours");
  return { key: Math.random(), time_type_id: first?.id || "", start_time: "", end_time: "", hours: "", description: "" };
}

function emptySupplementLine(types) {
  const first = types.find((t) => t.kind === "supplement");
  return { key: Math.random(), time_type_id: first?.id || "", quantity: "1", description: "" };
}

// The registration form, in the shape OKV already fills in daily. An order is now the required
// dimension and the location is optional — which is what makes ferie, sykefravær and intern tid
// registrable. The same form corrects an existing shift.
function EntryForm({ token, entry, sites, orders, staff, types, onClose, onSaved }) {
  const editing = !!entry;
  const hoursTypes = types.filter((t) => t.kind === "hours");
  const supplementTypes = types.filter((t) => t.kind === "supplement");

  const [form, setForm] = useState(() => ({
    order_id: entry?.order_id || "",
    site_id: entry?.site_id || "",
    user_id: entry?.user_id || "",
    work_date: entry?.work_date || todayInOslo(),
    start_time: osloTime(entry?.started_at) || "",
    end_time: osloTime(entry?.ended_at) || "",
    note: entry?.note || "",
  }));
  const [hourLines, setHourLines] = useState(() =>
    (entry?.lines || []).filter((l) => l.kind !== "supplement").map((l) => ({
      key: l.id, time_type_id: l.time_type_id || "",
      start_time: l.start_time || "", end_time: l.end_time || "",
      hours: l.start_time && l.end_time ? "" : minutesToHours(l.minutes),
      description: l.description || "",
    }))
  );
  const [supplementLines, setSupplementLines] = useState(() =>
    (entry?.lines || []).filter((l) => l.kind === "supplement").map((l) => ({
      key: l.id, time_type_id: l.time_type_id || "", quantity: String(l.quantity ?? 1), description: l.description || "",
    }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedOrder = orders.find((o) => String(o.id) === String(form.order_id));
  // A customer order is a building, so it needs one; an internal or absence order has none, and
  // offering the picker there would just invite a wrong answer.
  const needsSite = selectedOrder ? !selectedOrder.allows_manual : true;
  const sitesForOrder = selectedOrder ? sites.filter((s) => s.order_id === selectedOrder.id || !s.order_id) : sites;

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function patchLine(setter, key, patch) {
    setter((list) => list.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  // Live total, so whoever fills this in sees the number that reaches payroll before saving rather
  // than after. Mirrors the backend: fra/til wins over a typed quantity, and an art that does not
  // count as work is left out.
  const previewMinutes = hourLines.reduce((sum, line) => {
    const type = hoursTypes.find((t) => t.id === Number(line.time_type_id));
    if (type && !type.counts_as_work) return sum;
    return sum + (lineMinutesOf(line.start_time, line.end_time) ?? hoursToMinutes(line.hours));
  }, 0);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const lines = [
      ...hourLines
        .filter((l) => l.time_type_id && (lineMinutesOf(l.start_time, l.end_time) != null || hoursToMinutes(l.hours) > 0))
        .map((l) => ({
          time_type_id: Number(l.time_type_id),
          start_time: l.start_time || null, end_time: l.end_time || null,
          minutes: lineMinutesOf(l.start_time, l.end_time) != null ? undefined : hoursToMinutes(l.hours),
          description: l.description,
        })),
      ...supplementLines
        .filter((l) => l.time_type_id && Number(String(l.quantity).replace(",", ".")) > 0)
        .map((l) => ({
          time_type_id: Number(l.time_type_id),
          quantity: Number(String(l.quantity).replace(",", ".")),
          description: l.description,
        })),
    ];
    try {
      const body = {
        work_date: form.work_date,
        start_time: form.start_time,
        end_time: form.end_time || "",
        note: form.note,
        ...(lines.length ? { lines } : {}),
        ...(editing ? {} : {
          user_id: Number(form.user_id),
          ...(form.order_id ? { order_id: Number(form.order_id) } : {}),
          ...(form.site_id ? { site_id: Number(form.site_id) } : {}),
        }),
      };
      await apiFetch(editing ? `/time/entries/${entry.id}` : "/time/entries", {
        token, method: editing ? "PATCH" : "POST", body: JSON.stringify(body),
      });
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} style={modalBackdropStyle}>
      <div onClick={(e) => e.stopPropagation()} style={modalStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 17, fontWeight: 600 }}>
            <Clock size={17} /> {editing ? "Rett stempling" : "Legg til timer"}
          </div>
          <button onClick={onClose} aria-label="Lukk" style={iconStyle}><X size={18} /></button>
        </div>

        <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {editing ? (
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {entry.user_name} — {entry.order_name || entry.site_name}
              {entry.approval?.approved_count > 0 && (
                <div style={{ color: "var(--brand-dark)", marginTop: 4 }}>
                  {entry.approval.approved_count} nivå har signert. Lagrer du en endring, fjernes alle
                  signaturene og vakta går tilbake til «venter».
                </div>
              )}
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Field label="Ansattnavn" style={{ flex: 1, minWidth: 190 }}>
                  <select required value={form.user_id} onChange={(e) => set("user_id", e.target.value)} style={inputStyle}>
                    <option value="">Velg ansatt</option>
                    {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </Field>
                <Field label="Ordre" style={{ flex: 1, minWidth: 190 }}>
                  <select required value={form.order_id} onChange={(e) => { set("order_id", e.target.value); set("site_id", ""); }} style={inputStyle}>
                    <option value="">Velg ordre</option>
                    {orders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.number ? `${o.number} ` : ""}{o.name}{o.kind !== "customer" ? ` (${ORDER_KIND_LABEL[o.kind]})` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              {needsSite && (
                <Field label="Lokasjon">
                  <select required value={form.site_id} onChange={(e) => set("site_id", e.target.value)} style={inputStyle}>
                    <option value="">Velg lokasjon</option>
                    {sitesForOrder.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
              )}
              {selectedOrder && !needsSite && (
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: -6 }}>
                  «{selectedOrder.name}» føres uten lokasjon — det er slik intern tid, kjøring og fravær registreres.
                </div>
              )}
            </>
          )}

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Field label="Dato" style={{ flex: 1, minWidth: 150 }}>
              <input required type="date" value={form.work_date} onChange={(e) => set("work_date", e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Fra tid" style={{ width: 110 }}>
              <input required type="time" value={form.start_time} onChange={(e) => set("start_time", e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Til tid" style={{ width: 110 }}>
              <input type="time" value={form.end_time} onChange={(e) => set("end_time", e.target.value)} style={inputStyle} />
            </Field>
          </div>

          <Field label="Timebeskrivelse">
            <input value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="Hva gjelder det?" style={inputStyle} />
          </Field>

          <LineSection
            title="Legg til timer"
            onAdd={() => setHourLines((l) => [...l, emptyHoursLine(types)])}
            empty={hourLines.length === 0}
            emptyText="Uten linjer føres hele vakta som ordinær tid."
          >
            {hourLines.map((line) => (
              <div key={line.key} style={lineRowStyle}>
                <select
                  value={line.time_type_id}
                  onChange={(e) => patchLine(setHourLines, line.key, { time_type_id: e.target.value })}
                  style={{ ...inputStyle, flex: "2 1 165px", fontSize: 13, padding: "6px 8px" }}
                >
                  {["arbeid", "fravær"].map((cat) => {
                    const list = hoursTypes.filter((t) => (t.category || "arbeid") === cat);
                    if (list.length === 0) return null;
                    return (
                      <optgroup key={cat} label={CATEGORY_LABEL[cat]}>
                        {list.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </optgroup>
                    );
                  })}
                </select>
                <input
                  type="time" value={line.start_time} aria-label="Fra"
                  onChange={(e) => patchLine(setHourLines, line.key, { start_time: e.target.value })}
                  style={{ ...inputStyle, flex: "0 1 103px", fontSize: 13, padding: "6px 8px" }}
                />
                <input
                  type="time" value={line.end_time} aria-label="Til"
                  onChange={(e) => patchLine(setHourLines, line.key, { end_time: e.target.value })}
                  style={{ ...inputStyle, flex: "0 1 103px", fontSize: 13, padding: "6px 8px" }}
                />
                {/* Either fra/til or a bare number of hours — the same either/or the backend takes,
                    so the field goes dead the moment the times make it redundant. */}
                <input
                  value={line.hours} placeholder="antall" aria-label="Antall timer"
                  disabled={lineMinutesOf(line.start_time, line.end_time) != null}
                  onChange={(e) => patchLine(setHourLines, line.key, { hours: e.target.value })}
                  style={{ ...inputStyle, flex: "0 1 70px", fontSize: 13, padding: "6px 8px" }}
                />
                <input
                  value={line.description} placeholder="beskrivelse"
                  onChange={(e) => patchLine(setHourLines, line.key, { description: e.target.value })}
                  style={{ ...inputStyle, flex: "1 1 110px", fontSize: 13, padding: "6px 8px" }}
                />
                <button type="button" onClick={() => setHourLines((l) => l.filter((x) => x.key !== line.key))} aria-label="Fjern linje" style={iconStyle}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </LineSection>

          <LineSection
            title="Legg til tillegg/annet"
            onAdd={() => setSupplementLines((l) => [...l, emptySupplementLine(types)])}
            empty={supplementLines.length === 0}
            emptyText="Ingen tillegg."
          >
            {supplementLines.map((line) => (
              <div key={line.key} style={lineRowStyle}>
                <select
                  value={line.time_type_id}
                  onChange={(e) => patchLine(setSupplementLines, line.key, { time_type_id: e.target.value })}
                  style={{ ...inputStyle, flex: "2 1 190px", fontSize: 13, padding: "6px 8px" }}
                >
                  {supplementTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <input
                  value={line.quantity} aria-label="Antall"
                  onChange={(e) => patchLine(setSupplementLines, line.key, { quantity: e.target.value })}
                  style={{ ...inputStyle, flex: "0 1 80px", fontSize: 13, padding: "6px 8px" }}
                />
                <input
                  value={line.description} placeholder="beskrivelse"
                  onChange={(e) => patchLine(setSupplementLines, line.key, { description: e.target.value })}
                  style={{ ...inputStyle, flex: "1 1 130px", fontSize: 13, padding: "6px 8px" }}
                />
                <button type="button" onClick={() => setSupplementLines((l) => l.filter((x) => x.key !== line.key))} aria-label="Fjern linje" style={iconStyle}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </LineSection>

          {hourLines.length > 0 && (
            <div style={{ fontSize: 13, textAlign: "right" }}>
              Sum arbeidede timer: <strong>{formatMinutes(previewMinutes)}</strong>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                Lønnsarter som ikke teller som arbeidstid (lunsj) er holdt utenfor. Ferie og
                sykefravær teller med, slik som i Mobile Worker.
              </div>
            </div>
          )}

          {error && <div style={{ color: "var(--text-danger)", fontSize: 13 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={secondaryBtnStyle}>Avslutte</button>
            <button type="submit" disabled={saving} style={primaryBtnStyle}>
              {saving ? "Lagrer…" : "Legg til og avslutt"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LineSection({ title, onAdd, children, empty, emptyText }) {
  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
        <button type="button" onClick={onAdd} aria-label={title} style={{ ...secondaryBtnStyle, padding: "5px 10px" }}>
          <Plus size={14} />
        </button>
      </div>
      {empty
        ? <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{emptyText}</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>}
    </div>
  );
}

const thStyle = { padding: "10px 12px", fontWeight: 500, whiteSpace: "nowrap" };
const tdStyle = { padding: "10px 12px", verticalAlign: "top" };
const tdNowrapStyle = { ...tdStyle, whiteSpace: "nowrap" };
const iconStyle = { background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 };
const lineRowStyle = { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" };
const secondaryBtnStyle = {
  ...primaryBtnStyle, background: "var(--surface-0)", color: "var(--text-primary)",
  border: "1px solid var(--border)", display: "inline-flex", alignItems: "center", gap: 6,
};
const gpsDotStyle = {
  display: "inline-block", width: 6, height: 6, borderRadius: "50%",
  background: "var(--text-success)", marginLeft: 5, verticalAlign: "middle",
};
const modalBackdropStyle = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex",
  alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50,
};
const modalStyle = {
  background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
  padding: 20, width: "100%", maxWidth: 660, maxHeight: "90vh", overflowY: "auto",
};

// --- Ugyldige data -------------------------------------------------------------------------------

const REASON_COLOR = {
  // The only fault on this screen that pays the same hour twice.
  overlap: "var(--text-danger)",
  missing_checkout: "var(--text-danger)",
  no_order: "var(--text-danger)",
  no_lines: "var(--text-danger)",
  no_employee_number: "var(--brand-dark)",
  open: "var(--text-secondary)",
  rejected: "var(--brand-dark)",
  not_approved: "var(--text-secondary)",
};

// Mobile Worker keeps a screen for registrations that cannot go anywhere. This answers the same
// question in Rentlogg's terms: what in this period would silently break or distort a payroll
// export? Every reason listed is something a person has to fix — none of it can be guessed.
function AttentionTab({ token, from, to, filters, onEdit }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const query = new URLSearchParams({ from, to, ...filters }).toString();

  useEffect(() => {
    setData(null);
    apiFetch(`/time/attention?${query}`, { token }).then(setData).catch((err) => setError(err.message));
  }, [query, token]);

  if (error) return <div style={{ color: "var(--text-danger)", fontSize: 13 }}>{error}</div>;
  if (!data) return <Loading />;

  return (
    <div>
      {data.missing_employee_numbers.length > 0 && (
        <Card style={{ marginBottom: 16, borderLeft: "3px solid var(--brand)" }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {data.missing_employee_numbers.length === 1
              ? "1 ansatt mangler ansattnummer"
              : `${data.missing_employee_numbers.length} ansatte mangler ansattnummer`}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            Unimicro matcher ansatte på nummer, ikke navn — timene deres kan ikke importeres før dette
            er satt. Settes under <strong>Ansatte</strong>: {data.missing_employee_numbers.map((u) => u.name).join(", ")}.
          </div>
        </Card>
      )}

      {data.problems.length === 0 ? (
        <Card style={{ textAlign: "center", color: "var(--text-success)" }}>
          Ingenting å rydde i — alle {data.checked} stemplingene i perioden er klare.
        </Card>
      ) : (
        <Card style={{ padding: 0, overflowX: "auto" }}>
          <div style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-secondary)" }}>
            {data.problems.length} av {data.checked} stemplinger trenger noe. Sortert etter hvor hardt
            de bryter eksporten.
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 760 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 12 }}>
                <th style={thStyle}>Dato</th>
                <th style={thStyle}>Ansatt</th>
                <th style={thStyle}>Ordre</th>
                <th style={thStyle}>Timer</th>
                <th style={thStyle}>Hva mangler</th>
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {data.problems.map(({ entry, reasons }) => (
                <tr key={entry.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={tdNowrapStyle}>{entry.work_date}</td>
                  <td style={tdStyle}>{entry.user_name}</td>
                  <td style={tdStyle}>{entry.order_name || entry.site_name || "—"}</td>
                  <td style={{ ...tdNowrapStyle, fontWeight: 600 }}>{formatMinutes(entry.minutes)}</td>
                  <td style={tdStyle}>
                    {reasons.map((r) => (
                      <div key={r.code} style={{ fontSize: 12, color: REASON_COLOR[r.code] || "var(--text-secondary)" }}>
                        {r.text}
                      </div>
                    ))}
                  </td>
                  <td style={tdStyle}>
                    {!entry.locked && (
                      <button onClick={() => onEdit(entry)} aria-label="Rediger" style={iconStyle}><Pencil size={14} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// --- Team og ansattgrupper -----------------------------------------------------------------------

// One component for both registers — they differ only in their endpoint and their heading, and two
// copies would drift. Assigning people is done here too, since a register nobody is in filters
// nothing.
function StaffRegisterTab({ token, register, heading, blurb }) {
  const [rows, setRows] = useState([]);
  const [staff, setStaff] = useState([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const field = register === "teams" ? "team_id" : "employee_group_id";

  const reload = useCallback(() => {
    apiFetch(`/time/registers/${register}`, { token }).then(setRows).catch((err) => setError(err.message));
    apiFetch("/time/staff", { token }).then(setStaff).catch(() => {});
  }, [register, token]);

  useEffect(reload, [reload]);

  async function call(fn) {
    setError("");
    try {
      await fn();
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>{blurb}</div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            call(() => apiFetch(`/time/registers/${register}`, { token, method: "POST", body: JSON.stringify({ name }) }));
            setName("");
          }}
          style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "flex-end" }}
        >
          <Field label={`Nytt ${heading.toLowerCase()}`} style={{ width: 240 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          </Field>
          <button type="submit" style={{ ...primaryBtnStyle, marginBottom: 8 }}>Legg til</button>
        </form>
      </Card>

      {error && <div style={{ color: "var(--text-danger)", marginBottom: 12, fontSize: 13 }}>{error}</div>}

      <Card style={{ padding: 0, marginBottom: 16, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 420 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 12 }}>
              <th style={thStyle}>Navn</th>
              <th style={thStyle}>Personer</th>
              <th style={thStyle} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={tdStyle}>
                  <input
                    defaultValue={r.name}
                    onBlur={(e) => e.target.value !== r.name && call(() =>
                      apiFetch(`/time/registers/${register}/${r.id}`, { token, method: "PATCH", body: JSON.stringify({ name: e.target.value }) }))}
                    style={{ ...inputStyle, fontSize: 13, padding: "5px 8px" }}
                  />
                </td>
                <td style={tdNowrapStyle}>{r.user_count}</td>
                <td style={tdStyle}>
                  <button
                    onClick={() => {
                      if (!window.confirm(`Fjerne «${r.name}»? De ${r.user_count} personene beholder alt annet — de blir bare stående uten.`)) return;
                      call(() => apiFetch(`/time/registers/${register}/${r.id}`, { token, method: "DELETE" }));
                    }}
                    aria-label="Fjern" style={iconStyle}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card style={{ padding: 0, overflowX: "auto" }}>
        <div style={{ padding: "12px 16px", fontWeight: 600, fontSize: 14 }}>Hvem er hvor</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 420 }}>
          <tbody>
            {staff.map((u) => (
              <tr key={u.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={tdStyle}>{u.name}</td>
                <td style={tdStyle}>
                  <select
                    value={u[field] || ""}
                    onChange={(e) => call(() =>
                      apiFetch(`/time/staff/${u.id}`, {
                        token, method: "PATCH",
                        body: JSON.stringify({ [field]: e.target.value ? Number(e.target.value) : null }),
                      }))}
                    style={{ ...inputStyle, fontSize: 13, padding: "5px 8px", width: 220 }}
                  >
                    <option value="">Ingen</option>
                    {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
