import { useEffect, useRef, useState } from "react";
import { Building2, Trash2, QrCode, Pencil, FileUp } from "lucide-react";
import { apiFetch } from "../../api";
import { Card, AddressAutocomplete } from "../shared";

const WEEKDAYS = [
  { value: 1, label: "Man" },
  { value: 2, label: "Tir" },
  { value: 3, label: "Ons" },
  { value: 4, label: "Tor" },
  { value: 5, label: "Fre" },
  { value: 6, label: "Lør" },
  { value: 0, label: "Søn" },
];

function todayWeekday() {
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date());
  return new Date(`${todayStr}T00:00:00`).getDay();
}

const emptyForm = { name: "", client_id: "", address: "" };

export default function LokasjonerPage({ token, refreshSummary }) {
  const [sites, setSites] = useState([]);
  const [clients, setClients] = useState([]);
  const [cleaners, setCleaners] = useState([]);
  const [schedules, setSchedules] = useState({}); // siteId -> [{id, weekday, assigned_cleaner_id, assigned_cleaner_name}]
  const [rooms, setRooms] = useState({}); // siteId -> [{id, name, interval_days, dueToday, status, lastCleanedAt, itemCount}]
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [expandedSite, setExpandedSite] = useState(null);
  const [expandedRoomsSite, setExpandedRoomsSite] = useState(null);
  const [expandedRoomId, setExpandedRoomId] = useState(null);
  const [roomItems, setRoomItems] = useState({}); // roomId -> [{id, label}]
  const [roomSchedules, setRoomSchedules] = useState({}); // roomId -> [{id, weekday, assigned_cleaner_id, assigned_cleaner_name}]
  const [newRoomName, setNewRoomName] = useState("");
  const [newItemLabel, setNewItemLabel] = useState("");
  const [editingRoomId, setEditingRoomId] = useState(null);
  const [editRoomName, setEditRoomName] = useState("");
  const [editingSiteId, setEditingSiteId] = useState(null);
  const [editSiteForm, setEditSiteForm] = useState(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [importingPdf, setImportingPdf] = useState(false);
  const [importPreview, setImportPreview] = useState(null); // { siteId, rooms: [{name, tasks: [string]}] }
  const pdfInputRef = useRef(null);
  const pdfImportSiteIdRef = useRef(null);

  function loadAll() {
    Promise.all([
      apiFetch("/sites", { token }),
      apiFetch("/clients", { token }),
      apiFetch("/auth/users?role=cleaner", { token }),
    ])
      .then(async ([sitesData, clientsData, cleanersData]) => {
        setSites(sitesData);
        setClients(clientsData);
        setCleaners(cleanersData);
        const scheduleEntries = await Promise.all(
          sitesData.map((s) => apiFetch(`/sites/${s.id}/schedule`, { token }).then((rows) => [s.id, rows]))
        );
        setSchedules(Object.fromEntries(scheduleEntries));
        const roomEntries = await Promise.all(
          sitesData.map((s) => apiFetch(`/sites/${s.id}/rooms`, { token }).then((rows) => [s.id, rows]))
        );
        setRooms(Object.fromEntries(roomEntries));
      })
      .catch((err) => setError(err.message));
  }

  useEffect(loadAll, [token]);

  function refreshRoomsForSite(siteId) {
    apiFetch(`/sites/${siteId}/rooms`, { token }).then((rows) => setRooms((prev) => ({ ...prev, [siteId]: rows })));
  }

  function refreshRoomItems(roomId) {
    apiFetch(`/rooms/${roomId}/items`, { token }).then((rows) => setRoomItems((prev) => ({ ...prev, [roomId]: rows })));
  }

  function refreshRoomSchedule(roomId) {
    apiFetch(`/rooms/${roomId}/schedule`, { token }).then((rows) => setRoomSchedules((prev) => ({ ...prev, [roomId]: rows })));
  }

  async function createRoom(siteId) {
    if (!newRoomName.trim()) return;
    try {
      await apiFetch(`/sites/${siteId}/rooms`, { token, method: "POST", body: JSON.stringify({ name: newRoomName }) });
      setNewRoomName("");
      refreshRoomsForSite(siteId);
    } catch (err) {
      setError(err.message);
    }
  }

  function startEditRoom(room) {
    setEditingRoomId(room.id);
    setEditRoomName(room.name);
  }

  async function saveRoomName(siteId, roomId) {
    if (!editRoomName.trim()) return;
    try {
      await apiFetch(`/rooms/${roomId}`, { token, method: "PATCH", body: JSON.stringify({ name: editRoomName }) });
      setEditingRoomId(null);
      refreshRoomsForSite(siteId);
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteRoom(siteId, roomId) {
    try {
      await apiFetch(`/rooms/${roomId}`, { token, method: "DELETE" });
      if (expandedRoomId === roomId) setExpandedRoomId(null);
      refreshRoomsForSite(siteId);
    } catch (err) {
      setError(err.message);
    }
  }

  function toggleRoomExpand(roomId) {
    if (expandedRoomId === roomId) {
      setExpandedRoomId(null);
      return;
    }
    setExpandedRoomId(roomId);
    setNewItemLabel("");
    refreshRoomItems(roomId);
    refreshRoomSchedule(roomId);
  }

  async function addRoomItem(roomId) {
    if (!newItemLabel.trim()) return;
    try {
      await apiFetch(`/rooms/${roomId}/items`, { token, method: "POST", body: JSON.stringify({ label: newItemLabel }) });
      setNewItemLabel("");
      refreshRoomItems(roomId);
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteRoomItem(roomId, itemId) {
    try {
      await apiFetch(`/rooms/${roomId}/items/${itemId}`, { token, method: "DELETE" });
      refreshRoomItems(roomId);
    } catch (err) {
      setError(err.message);
    }
  }

  async function setRoomIntervalMode(siteId, roomId, days) {
    try {
      await apiFetch(`/rooms/${roomId}`, { token, method: "PATCH", body: JSON.stringify({ interval_days: days }) });
      refreshRoomsForSite(siteId);
      refreshRoomSchedule(roomId);
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleRoomWeekday(siteId, roomId, weekday) {
    const existing = (roomSchedules[roomId] || []).find((s) => s.weekday === weekday);
    try {
      if (existing) {
        await apiFetch(`/rooms/${roomId}/schedule/${weekday}`, { token, method: "DELETE" });
      } else {
        await apiFetch(`/rooms/${roomId}/schedule`, { token, method: "POST", body: JSON.stringify({ weekday }) });
      }
      refreshRoomSchedule(roomId);
      refreshRoomsForSite(siteId);
    } catch (err) {
      setError(err.message);
    }
  }

  async function assignRoomCleaner(roomId, weekday, assigned_cleaner_id) {
    try {
      await apiFetch(`/rooms/${roomId}/schedule`, {
        token, method: "POST",
        body: JSON.stringify({ weekday, assigned_cleaner_id: assigned_cleaner_id || null }),
      });
      refreshRoomSchedule(roomId);
    } catch (err) {
      setError(err.message);
    }
  }

  function triggerPdfImport(siteId) {
    pdfImportSiteIdRef.current = siteId;
    pdfInputRef.current.click();
  }

  async function handlePdfSelected(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const siteId = pdfImportSiteIdRef.current;
    setError("");
    setImportingPdf(true);
    try {
      const form = new FormData();
      form.append("pdf", file);
      const data = await apiFetch(`/sites/${siteId}/rooms/import-pdf`, { token, method: "POST", body: form });
      setImportPreview({
        siteId,
        rooms: data.rooms.map((r) => ({
          name: r.name,
          tasks: [...r.tasks],
          schedule: { weekdays: r.schedule?.weekdays ? [...r.schedule.weekdays] : [], interval_days: r.schedule?.interval_days ?? null },
        })),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setImportingPdf(false);
    }
  }

  function updateImportRoomName(idx, name) {
    setImportPreview((p) => ({ ...p, rooms: p.rooms.map((r, i) => (i === idx ? { ...r, name } : r)) }));
  }

  function updateImportTask(roomIdx, taskIdx, value) {
    setImportPreview((p) => ({
      ...p,
      rooms: p.rooms.map((r, i) => (i === roomIdx ? { ...r, tasks: r.tasks.map((t, j) => (j === taskIdx ? value : t)) } : r)),
    }));
  }

  function removeImportTask(roomIdx, taskIdx) {
    setImportPreview((p) => ({
      ...p,
      rooms: p.rooms.map((r, i) => (i === roomIdx ? { ...r, tasks: r.tasks.filter((_, j) => j !== taskIdx) } : r)),
    }));
  }

  function addImportTask(roomIdx) {
    setImportPreview((p) => ({
      ...p,
      rooms: p.rooms.map((r, i) => (i === roomIdx ? { ...r, tasks: [...r.tasks, ""] } : r)),
    }));
  }

  function removeImportRoom(idx) {
    setImportPreview((p) => ({ ...p, rooms: p.rooms.filter((_, i) => i !== idx) }));
  }

  function toggleImportWeekday(roomIdx, weekday) {
    setImportPreview((p) => ({
      ...p,
      rooms: p.rooms.map((r, i) => {
        if (i !== roomIdx) return r;
        const weekdays = r.schedule.weekdays.includes(weekday)
          ? r.schedule.weekdays.filter((w) => w !== weekday)
          : [...r.schedule.weekdays, weekday];
        return { ...r, schedule: { weekdays, interval_days: null } };
      }),
    }));
  }

  function setImportIntervalMode(roomIdx, days) {
    setImportPreview((p) => ({
      ...p,
      rooms: p.rooms.map((r, i) => (i === roomIdx ? { ...r, schedule: { weekdays: [], interval_days: days } } : r)),
    }));
  }

  function setImportWeekdayMode(roomIdx) {
    setImportPreview((p) => ({
      ...p,
      rooms: p.rooms.map((r, i) => (i === roomIdx ? { ...r, schedule: { weekdays: [], interval_days: null } } : r)),
    }));
  }

  async function confirmImport() {
    try {
      const rooms = importPreview.rooms
        .map((r) => ({
          name: r.name.trim(),
          tasks: r.tasks.map((t) => t.trim()).filter(Boolean),
          schedule: r.schedule.weekdays.length > 0
            ? { weekdays: r.schedule.weekdays }
            : r.schedule.interval_days
            ? { interval_days: r.schedule.interval_days }
            : null,
        }))
        .filter((r) => r.name);
      await apiFetch(`/sites/${importPreview.siteId}/rooms/import-confirm`, {
        token, method: "POST", body: JSON.stringify({ rooms }),
      });
      refreshRoomsForSite(importPreview.siteId);
      setImportPreview(null);
    } catch (err) {
      setError(err.message);
    }
  }

  const clientName = (id) => clients.find((c) => c.id === id)?.name || "—";
  const isScheduledToday = (siteId) => (schedules[siteId] || []).some((s) => s.weekday === todayWeekday());

  async function createSite(e) {
    e.preventDefault();
    setError("");
    try {
      await apiFetch("/sites", {
        token, method: "POST",
        body: JSON.stringify({
          name: form.name, client_id: Number(form.client_id), address: form.address || null,
        }),
      });
      setForm(emptyForm);
      setShowForm(false);
      loadAll();
      refreshSummary?.();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEditSite(site) {
    setEditingSiteId(site.id);
    setEditSiteForm({
      name: site.name || "",
      client_id: site.client_id || "",
      address: site.address || "",
    });
  }

  async function saveEditSite(e, siteId) {
    e.preventDefault();
    setError("");
    try {
      await apiFetch(`/sites/${siteId}`, {
        token, method: "PATCH",
        body: JSON.stringify({
          name: editSiteForm.name, client_id: Number(editSiteForm.client_id), address: editSiteForm.address || null,
        }),
      });
      setEditingSiteId(null);
      loadAll();
      refreshSummary?.();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteSite(id) {
    try {
      await apiFetch(`/sites/${id}`, { token, method: "DELETE" });
      setConfirmDelete(null);
      loadAll();
      refreshSummary?.();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleWeekday(siteId, weekday) {
    const existing = (schedules[siteId] || []).find((s) => s.weekday === weekday);
    try {
      if (existing) {
        await apiFetch(`/sites/${siteId}/schedule/${weekday}`, { token, method: "DELETE" });
      } else {
        await apiFetch(`/sites/${siteId}/schedule`, { token, method: "POST", body: JSON.stringify({ weekday }) });
      }
      const rows = await apiFetch(`/sites/${siteId}/schedule`, { token });
      setSchedules((prev) => ({ ...prev, [siteId]: rows }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function assignCleaner(siteId, weekday, assigned_cleaner_id) {
    try {
      await apiFetch(`/sites/${siteId}/schedule`, {
        token, method: "POST",
        body: JSON.stringify({ weekday, assigned_cleaner_id: assigned_cleaner_id || null }),
      });
      const rows = await apiFetch(`/sites/${siteId}/schedule`, { token });
      setSchedules((prev) => ({ ...prev, [siteId]: rows }));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <input ref={pdfInputRef} type="file" accept="application/pdf" onChange={handlePdfSelected} style={{ display: "none" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Lokasjoner</h1>
          <div style={{ color: "var(--text-secondary)" }}>{sites.length} bygg under oppfølging</div>
        </div>
        <button onClick={() => setShowForm((v) => !v)} style={primaryBtnStyle}>+ Ny lokasjon</button>
      </div>

      {error && <div style={{ color: "var(--text-danger)", marginBottom: 12 }}>{error}</div>}

      {showForm && (
        <Card style={{ marginBottom: 20 }}>
          <form onSubmit={createSite} style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            <input required placeholder="Navn" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            <select required value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} style={inputStyle}>
              <option value="">Velg kunde</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <AddressAutocomplete value={form.address} onChange={(v) => setForm({ ...form, address: v })} inputStyle={inputStyle} style={{ gridColumn: "span 2" }} />
            <button type="submit" style={{ ...primaryBtnStyle, gridColumn: "span 2" }}>Opprett lokasjon</button>
          </form>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {sites.map((site) => (
          <Card key={site.id}>
            {editingSiteId === site.id ? (
              <form onSubmit={(e) => saveEditSite(e, site.id)} style={{ display: "grid", gap: 8 }}>
                <input required placeholder="Navn" value={editSiteForm.name} onChange={(e) => setEditSiteForm({ ...editSiteForm, name: e.target.value })} style={inputStyle} />
                <select required value={editSiteForm.client_id} onChange={(e) => setEditSiteForm({ ...editSiteForm, client_id: e.target.value })} style={inputStyle}>
                  <option value="">Velg kunde</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <AddressAutocomplete value={editSiteForm.address} onChange={(v) => setEditSiteForm({ ...editSiteForm, address: v })} inputStyle={inputStyle} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" style={primaryBtnStyle}>Lagre</button>
                  <button type="button" onClick={() => setEditingSiteId(null)} style={linkBtnStyle}>Avbryt</button>
                </div>
              </form>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                    background: "linear-gradient(135deg, var(--accent-orange), var(--accent-orange-dark))", color: "white",
                  }}>
                    <Building2 size={20} />
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {isScheduledToday(site.id) && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-success)", background: "var(--c-teal)", padding: "3px 8px", borderRadius: 999 }}>
                        I DAG
                      </span>
                    )}
                    <button onClick={() => startEditSite(site)} style={iconBtnStyle}><Pencil size={15} /></button>
                    <button onClick={() => setConfirmDelete(site.id)} style={iconBtnStyle}><Trash2 size={15} /></button>
                  </div>
                </div>

                <div style={{ fontWeight: 600, marginTop: 12 }}>{site.name}</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{clientName(site.client_id)}</div>
                {site.address && <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{site.address}</div>}

                <div style={{ borderTop: "1px solid var(--border)", marginTop: 12, paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
                    <QrCode size={14} /> {rooms[site.id]?.length ?? site.room_count ?? 0} rom
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      onClick={() => setExpandedRoomsSite(expandedRoomsSite === site.id ? null : site.id)}
                      style={linkBtnStyle}
                    >
                      {expandedRoomsSite === site.id ? "Skjul rom" : "Administrer rom"}
                    </button>
                    <button data-site-id={site.id} data-action="toggle-schedule" onClick={() => setExpandedSite(expandedSite === site.id ? null : site.id)} style={linkBtnStyle}>
                      {expandedSite === site.id ? "Skjul plan" : "Ukeplan"}
                    </button>
                  </div>
                </div>
              </>
            )}

            {editingSiteId !== site.id && confirmDelete === site.id && (
              <div style={{ marginTop: 10, fontSize: 13, background: "var(--bg-danger)", padding: 10, borderRadius: "var(--radius)" }}>
                Slette denne lokasjonen? Dette fjerner også historikk og avvik.
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => deleteSite(site.id)} style={{ ...primaryBtnStyle, background: "var(--text-danger)" }}>Ja, slett</button>
                  <button onClick={() => setConfirmDelete(null)} style={linkBtnStyle}>Avbryt</button>
                </div>
              </div>
            )}

            {expandedSite === site.id && (
              <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                  {WEEKDAYS.map((wd) => {
                    const active = (schedules[site.id] || []).some((s) => s.weekday === wd.value);
                    return (
                      <button key={wd.value} onClick={() => toggleWeekday(site.id, wd.value)} style={{
                        padding: "5px 9px", borderRadius: 6, fontSize: 12, cursor: "pointer",
                        border: active ? "1px solid var(--accent-orange)" : "1px solid var(--border)",
                        background: active ? "var(--accent-orange-bg)" : "var(--surface-0)",
                        color: active ? "var(--accent-orange-dark)" : "var(--text-secondary)",
                      }}>
                        {wd.label}
                      </button>
                    );
                  })}
                </div>
                {(schedules[site.id] || []).map((s) => (
                  <div key={s.weekday} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                    <span>{WEEKDAYS.find((w) => w.value === s.weekday)?.label}</span>
                    <select
                      value={s.assigned_cleaner_id || ""}
                      onChange={(e) => assignCleaner(site.id, s.weekday, e.target.value ? Number(e.target.value) : null)}
                      style={{ ...inputStyle, padding: "4px 6px", fontSize: 12, width: 150 }}
                    >
                      <option value="">Ikke tildelt</option>
                      {cleaners.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {expandedRoomsSite === site.id && importPreview?.siteId === site.id && (
              <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                  Forslag fra PDF-import — se over og bekreft
                </div>
                {importPreview.rooms.map((room, roomIdx) => (
                  <div key={roomIdx} style={{ marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <input
                        value={room.name} onChange={(e) => updateImportRoomName(roomIdx, e.target.value)}
                        style={{ ...inputStyle, padding: "4px 6px", fontSize: 12, fontWeight: 600 }}
                      />
                      <button onClick={() => removeImportRoom(roomIdx)} style={iconBtnStyle}><Trash2 size={13} /></button>
                    </div>
                    {room.tasks.map((task, taskIdx) => (
                      <div key={taskIdx} style={{ display: "flex", gap: 4, marginTop: 4, marginLeft: 8 }}>
                        <input
                          value={task} onChange={(e) => updateImportTask(roomIdx, taskIdx, e.target.value)}
                          style={{ ...inputStyle, padding: "3px 6px", fontSize: 12 }}
                        />
                        <button onClick={() => removeImportTask(roomIdx, taskIdx)} style={iconBtnStyle}><Trash2 size={11} /></button>
                      </div>
                    ))}
                    <button onClick={() => addImportTask(roomIdx)} style={{ ...linkBtnStyle, marginLeft: 8, marginTop: 4 }}>
                      + Legg til oppgave
                    </button>

                    <div style={{ marginLeft: 8, marginTop: 6 }}>
                      {room.schedule.interval_days == null ? (
                        <>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {WEEKDAYS.map((wd) => {
                              const active = room.schedule.weekdays.includes(wd.value);
                              return (
                                <button key={wd.value} onClick={() => toggleImportWeekday(roomIdx, wd.value)} style={{
                                  padding: "3px 7px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                                  border: active ? "1px solid var(--accent-orange)" : "1px solid var(--border)",
                                  background: active ? "var(--accent-orange-bg)" : "var(--surface-0)",
                                  color: active ? "var(--accent-orange-dark)" : "var(--text-secondary)",
                                }}>
                                  {wd.label}
                                </button>
                              );
                            })}
                          </div>
                          <button onClick={() => setImportIntervalMode(roomIdx, 7)} style={{ ...linkBtnStyle, marginTop: 4, fontSize: 11 }}>
                            Bruk intervall i stedet
                          </button>
                        </>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 11 }}>Hver</span>
                          <input
                            type="number" min="1" value={room.schedule.interval_days}
                            onChange={(e) => setImportIntervalMode(roomIdx, Number(e.target.value) || 1)}
                            style={{ ...inputStyle, width: 44, padding: "2px 4px", fontSize: 11 }}
                          />
                          <span style={{ fontSize: 11 }}>dag(er)</span>
                          <button onClick={() => setImportWeekdayMode(roomIdx)} style={{ ...linkBtnStyle, fontSize: 11 }}>
                            Bruk ukedager i stedet
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {importPreview.rooms.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>Ingen rom igjen å importere.</div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={confirmImport} style={primaryBtnStyle} disabled={importPreview.rooms.length === 0}>
                    Bekreft import ({importPreview.rooms.length} rom)
                  </button>
                  <button onClick={() => setImportPreview(null)} style={linkBtnStyle}>Avbryt</button>
                </div>
              </div>
            )}

            {expandedRoomsSite === site.id && !importPreview && (
              <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                {(rooms[site.id] || []).map((room) => (
                  <div key={room.id} style={{ marginBottom: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                      {editingRoomId === room.id ? (
                        <div style={{ display: "flex", gap: 4, flex: 1 }}>
                          <input
                            value={editRoomName} onChange={(e) => setEditRoomName(e.target.value)}
                            autoFocus style={{ ...inputStyle, padding: "3px 6px", fontSize: 12 }}
                          />
                          <button onClick={() => saveRoomName(site.id, room.id)} style={linkBtnStyle}>Lagre</button>
                          <button onClick={() => setEditingRoomId(null)} style={linkBtnStyle}>Avbryt</button>
                        </div>
                      ) : (
                        <button onClick={() => toggleRoomExpand(room.id)} style={{ ...linkBtnStyle, color: "var(--text-primary)", fontWeight: 500, textAlign: "left" }}>
                          {room.name} <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>({room.itemCount} oppgaver)</span>
                        </button>
                      )}
                      {editingRoomId !== room.id && (
                        <div style={{ display: "flex", gap: 2 }}>
                          <button onClick={() => startEditRoom(room)} style={iconBtnStyle}><Pencil size={13} /></button>
                          <button onClick={() => deleteRoom(site.id, room.id)} style={iconBtnStyle}><Trash2 size={13} /></button>
                        </div>
                      )}
                    </div>

                    {expandedRoomId === room.id && (
                      <div style={{ marginLeft: 8, marginTop: 6, paddingLeft: 8, borderLeft: "2px solid var(--border)" }}>
                        {(roomItems[room.id] || []).map((item) => (
                          <div key={item.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
                            <span>{item.label}</span>
                            <button onClick={() => deleteRoomItem(room.id, item.id)} style={iconBtnStyle}><Trash2 size={11} /></button>
                          </div>
                        ))}
                        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                          <input
                            value={newItemLabel} onChange={(e) => setNewItemLabel(e.target.value)}
                            placeholder="Ny oppgave" style={{ ...inputStyle, padding: "4px 6px", fontSize: 12 }}
                          />
                          <button onClick={() => addRoomItem(room.id)} style={linkBtnStyle}>+ Legg til</button>
                        </div>

                        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Renholdsplan</div>
                        {room.interval_days == null ? (
                          <>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "6px 0" }}>
                              {WEEKDAYS.map((wd) => {
                                const active = (roomSchedules[room.id] || []).some((s) => s.weekday === wd.value);
                                return (
                                  <button key={wd.value} onClick={() => toggleRoomWeekday(site.id, room.id, wd.value)} style={{
                                    padding: "4px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                                    border: active ? "1px solid var(--accent-orange)" : "1px solid var(--border)",
                                    background: active ? "var(--accent-orange-bg)" : "var(--surface-0)",
                                    color: active ? "var(--accent-orange-dark)" : "var(--text-secondary)",
                                  }}>
                                    {wd.label}
                                  </button>
                                );
                              })}
                            </div>
                            {(roomSchedules[room.id] || []).map((s) => (
                              <div key={s.weekday} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
                                <span>{WEEKDAYS.find((w) => w.value === s.weekday)?.label}</span>
                                <select
                                  value={s.assigned_cleaner_id || ""}
                                  onChange={(e) => assignRoomCleaner(room.id, s.weekday, e.target.value ? Number(e.target.value) : null)}
                                  style={{ ...inputStyle, padding: "3px 5px", fontSize: 11, width: 130 }}
                                >
                                  <option value="">Ikke tildelt</option>
                                  {cleaners.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                              </div>
                            ))}
                            <button onClick={() => setRoomIntervalMode(site.id, room.id, 7)} style={{ ...linkBtnStyle, marginTop: 4 }}>
                              Bruk intervall i stedet
                            </button>
                          </>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                            <span style={{ fontSize: 12 }}>Hver</span>
                            <input
                              type="number" min="1" defaultValue={room.interval_days}
                              onBlur={(e) => setRoomIntervalMode(site.id, room.id, Number(e.target.value) || 1)}
                              style={{ ...inputStyle, width: 50, padding: "3px 5px", fontSize: 12 }}
                            />
                            <span style={{ fontSize: 12 }}>dag(er)</span>
                            <button onClick={() => toggleRoomWeekday(site.id, room.id, todayWeekday())} style={linkBtnStyle}>
                              Bruk ukedager i stedet
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
                  <input
                    value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="Nytt rom" style={{ ...inputStyle, padding: "5px 8px", fontSize: 12, width: 120 }}
                  />
                  <button onClick={() => createRoom(site.id)} style={linkBtnStyle}>+ Legg til rom</button>
                  <button
                    onClick={() => triggerPdfImport(site.id)}
                    disabled={importingPdf}
                    style={{ ...linkBtnStyle, display: "flex", alignItems: "center", gap: 4 }}
                  >
                    <FileUp size={13} />
                    {importingPdf && pdfImportSiteIdRef.current === site.id ? "Analyserer PDF..." : "Importer PDF"}
                  </button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
      {sites.length === 0 && <Card style={{ textAlign: "center", color: "var(--text-secondary)" }}>Ingen lokasjoner ennå.</Card>}
    </div>
  );
}

const primaryBtnStyle = {
  background: "var(--accent-orange)", color: "white", border: "none",
  padding: "9px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const linkBtnStyle = {
  background: "none", border: "none", color: "var(--accent-orange-dark)", fontSize: 12, cursor: "pointer", fontWeight: 500,
};
const iconBtnStyle = {
  background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4,
};
const inputStyle = {
  padding: "8px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
  background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 14, boxSizing: "border-box", width: "100%",
};
