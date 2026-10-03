import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Download, Plus, Trash2, Archive, RotateCcw, ListChecks } from "lucide-react";
import { apiFetch, downloadCsv } from "../../api";
import { Card, Field, Loading, TabButton, inputStyle, primaryBtnStyle, linkBtnStyle, iconBtnStyle } from "../shared";
import SubmissionDetail from "../checklist/SubmissionDetail";
import { addDays, fmtDate, fmtTime, todayOslo, weekdayOfDate, weekdayShort, WEEK_ORDER } from "../checklist/format";

// Sjekklister-modulen, admin-siden: ukeoversikt (hva mangler), logg (hva skjedde) og oppsett av
// selve listene. Norsk-only som resten av admin-flatene.
export default function SjekklisterPage({ token, user }) {
  const [tab, setTab] = useState("oversikt");
  // Klikk på en celle i oversikten åpner loggen filtrert på den lista og den dagen.
  const [logFilter, setLogFilter] = useState(null);

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
        <TabButton active={tab === "logg"} onClick={() => { setLogFilter(null); setTab("logg"); }}>Logg</TabButton>
        <TabButton active={tab === "oppsett"} onClick={() => setTab("oppsett")}>Sjekklister</TabButton>
      </div>
      {tab === "oversikt" && <WeekOverview token={token} onOpenLog={openLog} onSetup={() => setTab("oppsett")} />}
      {tab === "logg" && <AdminLog key={JSON.stringify(logFilter)} token={token} user={user} initialFilter={logFilter} />}
      {tab === "oppsett" && <ListSetup token={token} />}
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
  due: { bg: "var(--surface-0)", color: "var(--text-secondary)", text: "Planlagt" },
  none: { bg: "transparent", color: "var(--text-secondary)", text: "" },
};

function WeekOverview({ token, onOpenLog, onSetup }) {
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
  const doneToday = plannedToday.filter((l) => l.cells[today].count > 0).length;
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
                    {l.on_demand && <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 400 }}>Ved behov</div>}
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
                            {s.text}{c.count > 1 ? ` ×${c.count}` : ""}
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
        «Mangler» vises for planlagte dager som er over uten innsendt utfylling. Lister «ved behov» regnes aldri som manglende.
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  const color = { ok: "var(--text-success)", danger: "var(--text-danger)", warning: "var(--text-warning)" }[tone] || "var(--text-primary)";
  return (
    <Card>
      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </Card>
  );
}

// --- Logg -------------------------------------------------------------------------------------

function AdminLog({ token, user, initialFilter }) {
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
        onBack={() => setOpenId(null)}
        onDelete={user.role === "admin" ? remove : undefined}
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
                        <span style={{ ...pill, color: "var(--text-danger)", background: "var(--c-red)" }}>{r.deviation_count} avvik</span>
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
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{l.item_count} punkter · {scheduleText(l.weekdays)}</div>
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
          <ListEditor key={selectedId} token={token} id={selectedId} onChanged={() => load()} onRemoved={() => load(null)} />
        ) : (
          <Card style={{ color: "var(--text-secondary)", textAlign: "center", padding: 28 }}>
            Velg en sjekkliste til venstre, lag en ny, eller start fra en mal.
          </Card>
        )}
      </div>
    </div>
  );
}

function scheduleText(weekdays) {
  if (!weekdays?.length) return "ved behov";
  if (weekdays.length === 7) return "alle dager";
  if (weekdays.length === 5 && [1, 2, 3, 4, 5].every((d) => weekdays.includes(d))) return "hverdager";
  return WEEK_ORDER.filter((d) => weekdays.includes(d)).map((d) => weekdayShort(d)).join(", ");
}

function ListEditor({ token, id, onChanged, onRemoved }) {
  const [list, setList] = useState(null);
  const [draft, setDraft] = useState(null);
  const [newItem, setNewItem] = useState("");
  const [editing, setEditing] = useState(null); // { id, label, help_text }
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function apply(l) {
    setList(l);
    setDraft({ name: l.name, description: l.description || "", weekdays: l.weekdays });
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
    let l = null;
    for (const label of labels) l = (await call("/items", "POST", { label })) || l;
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
    const l = await call(`/items/${editing.id}`, "PATCH", { label: editing.label, help_text: editing.help_text });
    if (l) { setList(l); setEditing(null); }
  }

  async function deleteItem(item) {
    if (!window.confirm(`Fjerne punktet «${item.label}»? Tidligere utfyllinger beholder det.`)) return;
    const l = await call(`/items/${item.id}`, "DELETE");
    if (l) { setList(l); onChanged(); }
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

  const toggleDay = (d) =>
    setDraft((f) => ({ ...f, weekdays: f.weekdays.includes(d) ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d] }));

  return (
    <div>
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
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
            <button type="submit" style={primaryBtnStyle}>Lagre</button>
            {saved && <span style={{ fontSize: 13, color: "var(--text-success)" }}>Lagret</span>}
            {list.active && (
              <button type="button" onClick={removeList} style={{ ...linkBtnStyle, marginLeft: "auto", color: "var(--text-danger)", display: "inline-flex", gap: 5, alignItems: "center" }}>
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
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" style={{ ...primaryBtnStyle, padding: "6px 12px" }}>Lagre</button>
                  <button type="button" onClick={() => setEditing(null)} style={linkBtnStyle}>Avbryt</button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setEditing({ id: item.id, label: item.label, help_text: item.help_text || "" })}
                style={{ flex: 1, textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "2px 0", color: "inherit" }}
                title="Klikk for å redigere"
              >
                <div style={{ fontSize: 14 }}>{i + 1}. {item.label}</div>
                {item.help_text && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{item.help_text}</div>}
              </button>
            )}
            {editing?.id !== item.id && (
              <button onClick={() => deleteItem(item)} style={iconBtnStyle} aria-label="Fjern punkt"><Trash2 size={15} /></button>
            )}
          </div>
        ))}
        <form onSubmit={addItems} style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "flex-start" }}>
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
const chipStyle = {
  background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--radius-pill)",
  padding: "6px 10px", fontSize: 13, cursor: "pointer", color: "var(--text-primary)",
};
