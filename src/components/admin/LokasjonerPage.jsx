import { useEffect, useState } from "react";
import { Building2, Trash2, QrCode } from "lucide-react";
import { apiFetch } from "../../api";
import { Card } from "../shared";

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

const emptyForm = { name: "", client_id: "", address: "", room_count: "" };

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
  const [confirmDelete, setConfirmDelete] = useState(null);

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
          room_count: form.room_count ? Number(form.room_count) : 0,
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
            <input placeholder="Adresse" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} style={inputStyle} />
            <input type="number" min="0" placeholder="Antall rom" value={form.room_count} onChange={(e) => setForm({ ...form, room_count: e.target.value })} style={inputStyle} />
            <button type="submit" style={{ ...primaryBtnStyle, gridColumn: "span 2" }}>Opprett lokasjon</button>
          </form>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {sites.map((site) => (
          <Card key={site.id}>
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

            {confirmDelete === site.id && (
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

            {expandedRoomsSite === site.id && (
              <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                {(rooms[site.id] || []).map((room) => (
                  <div key={room.id} style={{ marginBottom: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                      <button onClick={() => toggleRoomExpand(room.id)} style={{ ...linkBtnStyle, color: "var(--text-primary)", fontWeight: 500, textAlign: "left" }}>
                        {room.name} <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>({room.itemCount} oppgaver)</span>
                      </button>
                      <button onClick={() => deleteRoom(site.id, room.id)} style={iconBtnStyle}><Trash2 size={13} /></button>
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

                <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                  <input
                    value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="Nytt rom" style={{ ...inputStyle, padding: "5px 8px", fontSize: 12 }}
                  />
                  <button onClick={() => createRoom(site.id)} style={linkBtnStyle}>+ Legg til rom</button>
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
