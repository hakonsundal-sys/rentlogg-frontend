import { useCallback, useEffect, useState } from "react";
import { Clock, Download, Lock, LockOpen, Pencil, Plus, Trash2, X } from "lucide-react";
import { apiFetch, downloadCsv } from "../../api";
import { Card, Field, Loading, TabButton, primaryBtnStyle, linkBtnStyle, inputStyle } from "../shared";

// "Timer" — the admin side of the Timeregistrering module. Two views of the same period: the
// stamped shifts themselves (edit, correct, lock, export) and the weekly plan held up against
// them. Only rendered for a company that has the module; the sidebar entry is hidden otherwise
// and the backend 403s regardless (see src/modules.js).
//
// Norwegian-only, like every other admin surface — the localization pass deliberately covers the
// cleaner's screens, which are the ones read by people who don't read Norwegian.

const STATUS_LABEL = {
  open: "Pågår",
  closed: "Fullført",
  auto_closed: "Auto-avsluttet",
  missing_checkout: "Mangler utstempling",
};
const STATUS_COLOR = {
  open: { bg: "var(--accent-orange-bg)", color: "var(--accent-orange-dark)" },
  closed: { bg: "var(--c-teal)", color: "var(--text-success)" },
  auto_closed: { bg: "var(--surface-2)", color: "var(--text-secondary)" },
  missing_checkout: { bg: "var(--surface-2)", color: "var(--text-danger)" },
};
const BILLING_LABEL = { actual: "Faktisk tid", fixed: "Rammetimer", manual: "Manuelt satt" };
const PLANNED_LABEL = {
  ok: "Som planlagt",
  substitute: "Annen enn planlagt",
  no_show: "Ingen stempling",
  unplanned: "Ikke planlagt",
};
const PLANNED_COLOR = {
  ok: { bg: "var(--c-teal)", color: "var(--text-success)" },
  substitute: { bg: "var(--accent-blue-bg)", color: "var(--accent-blue-dark)" },
  no_show: { bg: "var(--surface-2)", color: "var(--text-danger)" },
  unplanned: { bg: "var(--accent-orange-bg)", color: "var(--accent-orange-dark)" },
};

function todayInOslo() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date());
}

function monthStart() {
  return `${todayInOslo().slice(0, 7)}-01`;
}

// Hours are read far more often than they're summed, so everything on this page is written the way
// a person says it out loud ("4t 30m") rather than as a raw minute count or a decimal. The CSV
// carries the decimal column for whatever payroll system reads it next.
function formatMinutes(minutes) {
  if (minutes == null) return "—";
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  return `${sign}${Math.floor(abs / 60)}t ${String(abs % 60).padStart(2, "0")}m`;
}

// The stored stamps are UTC; every clock time shown or edited on this page is Oslo wall time,
// which is what the person who stamped it actually saw.
function osloTime(stamp) {
  if (!stamp) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(`${String(stamp).replace(" ", "T")}Z`));
}

function Pill({ label, colors }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: "var(--radius-pill)",
      fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
      background: colors.bg, color: colors.color,
    }}>
      {label}
    </span>
  );
}

export default function TimerPage({ token, user }) {
  const [tab, setTab] = useState("stemplinger");
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(todayInOslo);
  const [siteId, setSiteId] = useState("");
  const [userId, setUserId] = useState("");
  const [data, setData] = useState(null);
  const [planned, setPlanned] = useState(null);
  const [sites, setSites] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editEntry, setEditEntry] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);

  const isAdmin = user?.role === "admin";
  const query = new URLSearchParams({
    from, to, ...(siteId ? { site_id: siteId } : {}), ...(userId ? { user_id: userId } : {}),
  }).toString();

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    const entries = apiFetch(`/time/entries?${query}`, { token });
    const plan = apiFetch(`/time/planned?${query}`, { token });
    Promise.all([entries, plan])
      .then(([e, p]) => {
        setData(e);
        setPlanned(p);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [query, token]);

  useEffect(load, [load]);

  // Sites and staff are only needed to fill the filters and the "registrer time" form, and neither
  // changes while this page is open — fetched once rather than alongside every period change.
  useEffect(() => {
    apiFetch("/sites", { token }).then(setSites).catch(() => {});
    // /auth/users already excludes customers and super_admins — this is the same staff list
    // "Ansatte" renders.
    apiFetch("/auth/users", { token }).then(setStaff).catch(() => {});
  }, [token]);

  function exportCsv() {
    downloadCsv(`/time/entries.csv?${query}`, token, `timer-${from}-${to}.csv`).catch((err) => setError(err.message));
  }

  async function setLocked(locked) {
    const what = userId || siteId ? "utvalget" : "hele perioden";
    if (!window.confirm(locked
      ? `Låse timene for ${what} ${from} – ${to}? Ingen kan endre dem før de låses opp igjen.`
      : `Låse opp timene for ${what} ${from} – ${to}?`)) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch("/time/lock", {
        token, method: "POST",
        body: JSON.stringify({ from, to, locked, ...(userId ? { user_id: userId } : {}), ...(siteId ? { site_id: siteId } : {}) }),
      });
      // A still-running shift is deliberately skipped by the backend rather than frozen at zero
      // hours — worth saying out loud, since the count in front of the admin would otherwise look
      // like the lock silently missed some rows.
      if (locked && result.skipped_open > 0) {
        setError(`${result.changed} stemplinger låst. ${result.skipped_open} pågår fortsatt og ble hoppet over — lås dem når de er avsluttet.`);
      }
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry(entry) {
    if (!window.confirm(`Slette stemplingen for ${entry.user_name} ${entry.work_date}?`)) return;
    setError("");
    try {
      await apiFetch(`/time/entries/${entry.id}`, { token, method: "DELETE" });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const totals = data?.totals || [];
  const grandTotal = totals.reduce((sum, t) => sum + t.minutes, 0);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Timer</h1>
        <div style={{ color: "var(--text-secondary)" }}>
          Stemplet tid per ansatt. Timene starter når renholderen skanner QR-koden.
        </div>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="Fra" style={{ width: 150 }}>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Til" style={{ width: 150 }}>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Lokasjon" style={{ minWidth: 180, flex: 1 }}>
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)} style={inputStyle}>
              <option value="">Alle lokasjoner</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Ansatt" style={{ minWidth: 180, flex: 1 }}>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} style={inputStyle}>
              <option value="">Alle ansatte</option>
              {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={exportCsv} style={{ ...primaryBtnStyle, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Download size={14} /> CSV
            </button>
            <button onClick={() => setShowNew(true)} style={{ ...primaryBtnStyle, background: "var(--surface-0)", color: "var(--text-primary)", border: "1px solid var(--border)", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Plus size={14} /> Registrer
            </button>
          </div>
        </div>
        {isAdmin && (
          <div style={{ display: "flex", gap: 14, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)", alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => setLocked(true)} disabled={busy} style={{ ...linkBtnStyle, display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Lock size={13} /> Lås perioden
            </button>
            <button onClick={() => setLocked(false)} disabled={busy} style={{ ...linkBtnStyle, display: "inline-flex", alignItems: "center", gap: 5 }}>
              <LockOpen size={13} /> Lås opp
            </button>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Låste timer kan verken endres eller slettes — lås når perioden er sendt til lønn.
            </span>
          </div>
        )}
      </Card>

      {error && <div style={{ color: "var(--text-danger)", marginBottom: 12, fontSize: 13 }}>{error}</div>}

      {totals.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
          {totals.map((row) => (
            <Card key={row.user_id}>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{row.user_name}</div>
              <div style={{ fontSize: 22, fontWeight: 600, margin: "2px 0 4px" }}>{formatMinutes(row.minutes)}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {row.entry_count} stemplinger · {row.site_count} lokasjoner
              </div>
              {/* An unfinished or uncorrected row means the total above is not the final number —
                  said here rather than left for whoever notices it in the export. */}
              {(row.open_count > 0 || row.missing_count > 0) && (
                <div style={{ fontSize: 12, color: "var(--text-danger)", marginTop: 4 }}>
                  {row.open_count > 0 && `${row.open_count} pågår`}
                  {row.open_count > 0 && row.missing_count > 0 && " · "}
                  {row.missing_count > 0 && `${row.missing_count} mangler utstempling`}
                </div>
              )}
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
        <TabButton active={tab === "stemplinger"} onClick={() => setTab("stemplinger")}>Stemplinger</TabButton>
        <TabButton active={tab === "plan"} onClick={() => setTab("plan")}>Planlagt mot faktisk</TabButton>
      </div>

      {loading && <Loading />}
      {!loading && tab === "stemplinger" && (
        <EntryTable entries={data?.entries || []} onEdit={setEditEntry} onDelete={removeEntry} />
      )}
      {!loading && tab === "plan" && <PlannedTable rows={planned?.rows || []} />}

      {editEntry && (
        <EntryForm
          token={token} entry={editEntry} sites={sites} staff={staff}
          onClose={() => setEditEntry(null)}
          onSaved={() => { setEditEntry(null); load(); }}
        />
      )}
      {showNew && (
        <EntryForm
          token={token} sites={sites} staff={staff}
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); load(); }}
        />
      )}
    </div>
  );
}

function EntryTable({ entries, onEdit, onDelete }) {
  if (entries.length === 0) {
    return <Card style={{ textAlign: "center", color: "var(--text-secondary)" }}>Ingen stemplinger i perioden.</Card>;
  }
  return (
    <Card style={{ padding: 0, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 12 }}>
            <th style={thStyle}>Dato</th>
            <th style={thStyle}>Ansatt</th>
            <th style={thStyle}>Lokasjon</th>
            <th style={thStyle}>Inn</th>
            <th style={thStyle}>Ut</th>
            <th style={thStyle}>Faktisk</th>
            <th style={thStyle}>Timer</th>
            <th style={thStyle}>Beregning</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle} />
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={tdNowrapStyle}>{e.work_date}</td>
              <td style={tdStyle}>
                {e.user_name}
                {/* Somebody other than the person the weekly plan expected. Blue is "the
                    customer's" elsewhere in the product, but here it's simply the neutral
                    information tone — this is not an error, cleaners cover for each other. */}
                {e.as_planned === false && (
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    planlagt: {e.assigned_cleaner_name || "ingen"}
                  </div>
                )}
              </td>
              <td style={tdStyle}>{e.site_name}</td>
              <td style={tdNowrapStyle}>
                {osloTime(e.started_at)}
                {e.start_gps_verified && <span title="GPS bekreftet på stedet" style={gpsDotStyle} />}
              </td>
              <td style={tdNowrapStyle}>
                {osloTime(e.ended_at) || "—"}
                {e.end_gps_verified && <span title="GPS bekreftet på stedet" style={gpsDotStyle} />}
              </td>
              <td style={{ ...tdNowrapStyle, color: "var(--text-secondary)" }}>{formatMinutes(e.actual_minutes)}</td>
              <td style={{ ...tdNowrapStyle, fontWeight: 600 }}>{formatMinutes(e.minutes)}</td>
              <td style={{ ...tdNowrapStyle, color: "var(--text-secondary)" }}>
                {BILLING_LABEL[e.billing_mode] || "—"}
                {e.billing_mode === "fixed" && e.fixed_minutes != null && (
                  <div style={{ fontSize: 11 }}>ramme {formatMinutes(e.fixed_minutes)}</div>
                )}
              </td>
              <td style={tdStyle}>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <Pill label={STATUS_LABEL[e.status]} colors={STATUS_COLOR[e.status]} />
                  {e.source === "manual" && <Pill label="Manuell" colors={{ bg: "var(--surface-2)", color: "var(--text-secondary)" }} />}
                  {e.locked && <Pill label="Låst" colors={{ bg: "var(--surface-2)", color: "var(--text-secondary)" }} />}
                </div>
                {/* The edit trail, shown rather than merely stored: this is payroll data, and the
                    question three months from now is always "who changed this, and when". */}
                {e.edited_at && (
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                    endret {e.edited_at.slice(0, 10)}{e.edited_by_initials ? ` av ${e.edited_by_initials}` : ""}
                  </div>
                )}
                {e.note && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{e.note}</div>}
              </td>
              <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                {!e.locked && (
                  <>
                    <button onClick={() => onEdit(e)} aria-label="Rediger" style={iconStyle}><Pencil size={14} /></button>
                    <button onClick={() => onDelete(e)} aria-label="Slett" style={iconStyle}><Trash2 size={14} /></button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

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

// One form for both "registrer time i etterkant" and "rett en stempling". Times are entered as
// Oslo wall clock ("07:00"), which is what the person actually worked — the backend converts.
function EntryForm({ token, entry, sites, staff, onClose, onSaved }) {
  const editing = !!entry;
  const [form, setForm] = useState(() => ({
    site_id: entry?.site_id || "",
    user_id: entry?.user_id || "",
    work_date: entry?.work_date || todayInOslo(),
    start_time: osloTime(entry?.started_at) || "",
    end_time: osloTime(entry?.ended_at) || "",
    note: entry?.note || "",
    // Only ever sent when the admin actually types one — an empty field means "use the site's
    // own rule", not "pay zero".
    hours_override: entry?.billing_mode === "manual" && entry?.minutes != null
      ? (entry.minutes / 60).toFixed(2).replace(".", ",")
      : "",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    // Entered as hours because that's how the correction is discussed ("gi henne 2,5 timer"),
    // stored as minutes because that's the only unit that doesn't drift when summed.
    const override = form.hours_override.trim().replace(",", ".");
    if (override && !(Number(override) >= 0)) {
      setSaving(false);
      setError("Timer må være et tall, for eksempel 2,5.");
      return;
    }
    const minutes = override ? Math.round(Number(override) * 60) : null;
    try {
      const body = {
        work_date: form.work_date,
        start_time: form.start_time,
        end_time: form.end_time || "",
        note: form.note,
        minutes,
        ...(editing ? {} : { site_id: Number(form.site_id), user_id: Number(form.user_id) }),
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
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
        padding: 20, width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 17, fontWeight: 600 }}>
            <Clock size={17} /> {editing ? "Rett stempling" : "Registrer timer"}
          </div>
          <button onClick={onClose} aria-label="Lukk" style={iconStyle}><X size={18} /></button>
        </div>

        <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {!editing && (
            <>
              <Field label="Ansatt">
                <select required value={form.user_id} onChange={(e) => set("user_id", e.target.value)} style={inputStyle}>
                  <option value="">Velg ansatt</option>
                  {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
              <Field label="Lokasjon">
                <select required value={form.site_id} onChange={(e) => set("site_id", e.target.value)} style={inputStyle}>
                  <option value="">Velg lokasjon</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            </>
          )}
          {editing && (
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {entry.user_name} — {entry.site_name}
            </div>
          )}
          <Field label="Dato">
            <input required type="date" value={form.work_date} onChange={(e) => set("work_date", e.target.value)} style={inputStyle} />
          </Field>
          <div style={{ display: "flex", gap: 12 }}>
            <Field label="Inn" style={{ flex: 1 }}>
              <input required type="time" value={form.start_time} onChange={(e) => set("start_time", e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Ut" style={{ flex: 1 }}>
              <input type="time" value={form.end_time} onChange={(e) => set("end_time", e.target.value)} style={inputStyle} />
            </Field>
          </div>
          <Field label="Timer å godskrive (valgfritt)">
            <input
              value={form.hours_override} onChange={(e) => set("hours_override", e.target.value)}
              placeholder="Følger lokasjonens regel" style={inputStyle}
            />
          </Field>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: -6 }}>
            La stå tom for å bruke lokasjonens egen regel — faktisk tid, eller rammetimetallet.
            Fylles den ut, merkes stemplingen «Manuelt satt».
          </div>
          <Field label="Notat">
            <input value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="Hvorfor ble dette rettet?" style={inputStyle} />
          </Field>

          {error && <div style={{ color: "var(--text-danger)", fontSize: 13 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ ...primaryBtnStyle, background: "var(--surface-0)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
              Avbryt
            </button>
            <button type="submit" disabled={saving} style={primaryBtnStyle}>
              {saving ? "Lagrer…" : "Lagre"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const thStyle = { padding: "10px 12px", fontWeight: 500, whiteSpace: "nowrap" };
const tdStyle = { padding: "10px 12px", verticalAlign: "top" };
const tdNowrapStyle = { ...tdStyle, whiteSpace: "nowrap" };
const iconStyle = { background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 };
const gpsDotStyle = {
  display: "inline-block", width: 6, height: 6, borderRadius: "50%",
  background: "var(--text-success)", marginLeft: 5, verticalAlign: "middle",
};
