import { useEffect, useRef, useState } from "react";
import {
  QrCode, MapPin, Camera, AlertTriangle, CheckCircle2, Circle, ChevronLeft, ShieldCheck, DoorOpen,
} from "lucide-react";
import { apiFetch } from "../api";
import { Card, StatusBadge } from "./shared";

function getPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000 }
    );
  });
}

const ROOM_STATUS_LABEL = { missing: "IKKE STARTET", in_progress: "PÅGÅR", completed: "FERDIG" };

export default function CleanerView({ token }) {
  const [sites, setSites] = useState([]);
  const [run, setRun] = useState(null);
  const [rooms, setRooms] = useState(null); // null = not room-enabled site (or not yet loaded)
  const [expandedRoomId, setExpandedRoomId] = useState(null);
  const [roomRun, setRoomRun] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [showDeviationForm, setShowDeviationForm] = useState(false);
  const [deviationText, setDeviationText] = useState("");
  const [photoCount, setPhotoCount] = useState(0);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);
  const roomFileInputRef = useRef(null);

  useEffect(() => {
    apiFetch("/sites", { token }).then(setSites).catch((err) => setError(err.message));
  }, [token]);

  async function scan() {
    setError("");
    setScanning(true);
    try {
      const unfinished = sites.filter((s) => s.status !== "ok");
      const pool = unfinished.length ? unfinished : sites;
      if (!pool.length) throw new Error("Ingen lokasjoner tilgjengelig");
      const site = pool[Math.floor(Math.random() * pool.length)];

      const position = await getPosition();
      const checkin = await apiFetch(`/sites/checkin/${site.qr_token}`, {
        token, method: "POST", body: JSON.stringify(position || {}),
      });
      const fullRun = await apiFetch(`/checklists/runs/${checkin.runId}`, { token });
      setRun({ ...fullRun, site: checkin.site, gps_verified: checkin.gps_verified });
      setPhotoCount(0);
      setShowDeviationForm(false);
      setExpandedRoomId(null);
      setRoomRun(null);

      const siteRooms = await apiFetch(`/sites/${checkin.site.id}/rooms`, { token });
      setRooms(siteRooms);
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }

  function refreshRooms() {
    if (!run) return;
    apiFetch(`/sites/${run.site.id}/rooms`, { token }).then(setRooms).catch(() => {});
  }

  async function openRoom(room) {
    setError("");
    try {
      const data = await apiFetch(`/rooms/${room.id}/checkin`, { token, method: "POST" });
      setRoomRun(data);
      setExpandedRoomId(room.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleRoomItem(item) {
    const done = !item.done;
    setRoomRun((r) => ({ ...r, items: r.items.map((i) => (i.id === item.id ? { ...i, done } : i)) }));
    try {
      await apiFetch(`/rooms/runs/${roomRun.id}/items/${item.id}`, { token, method: "PATCH", body: JSON.stringify({ done }) });
    } catch (err) {
      setError(err.message);
    }
  }

  async function uploadRoomPhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append("photo", file);
    form.append("kind", "general");
    try {
      await apiFetch(`/rooms/runs/${roomRun.id}/photos`, { token, method: "POST", body: form });
    } catch (err) {
      setError(err.message);
    } finally {
      e.target.value = "";
    }
  }

  async function completeRoom() {
    try {
      await apiFetch(`/rooms/runs/${roomRun.id}/complete`, { token, method: "POST" });
      setExpandedRoomId(null);
      setRoomRun(null);
      refreshRooms();
    } catch (err) {
      setError(err.message);
    }
  }

  async function bulkCompleteAllDue() {
    try {
      await apiFetch(`/sites/${run.site.id}/rooms/complete-all-due`, { token, method: "POST" });
      refreshRooms();
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitDeviation() {
    if (!deviationText.trim()) return;
    try {
      await apiFetch("/deviations", {
        token, method: "POST",
        body: JSON.stringify({ site_id: run.site.id, run_id: run.id, description: deviationText, priority: "medium" }),
      });
      setDeviationText("");
      setShowDeviationForm(false);
      setRun((r) => ({ ...r, site: { ...r.site, status: "deviation" } }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function uploadPhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append("photo", file);
    form.append("kind", "general");
    try {
      await apiFetch(`/checklists/runs/${run.id}/photos`, { token, method: "POST", body: form });
      setPhotoCount((c) => c + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      e.target.value = "";
    }
  }

  async function complete() {
    if (rooms && rooms.length > 0) {
      const incompleteDue = rooms.filter((r) => r.dueToday && r.status !== "completed");
      if (incompleteDue.length > 0) {
        const proceed = window.confirm(`${incompleteDue.length} rom er ikke fullført ennå — avslutte likevel?`);
        if (!proceed) return;
      }
    }
    try {
      await apiFetch(`/checklists/runs/${run.id}/complete`, { token, method: "POST" });
      setRun(null);
      setRooms(null);
      apiFetch("/sites", { token }).then(setSites).catch(() => {});
    } catch (err) {
      setError(err.message);
    }
  }

  if (!run) {
    return (
      <Card style={{ textAlign: "center", padding: 40 }}>
        <QrCode size={40} style={{ margin: "0 auto 12px", color: "var(--text-secondary)" }} />
        <div style={{ marginBottom: 16, color: "var(--text-secondary)" }}>Skann QR-koden ved lokasjonen for å starte oppdraget</div>
        {error && <div style={{ color: "var(--text-danger)", fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <button onClick={scan} disabled={scanning} style={{
          background: "var(--accent-orange)", color: "white", border: "none",
          padding: "10px 20px", borderRadius: "var(--radius)", fontSize: 14, cursor: "pointer",
        }}>
          {scanning ? "Skanner..." : "Simuler QR-skann"}
        </button>
      </Card>
    );
  }

  const isRoomEnabled = rooms && rooms.length > 0;
  const doneCount = run.items.filter((i) => i.done).length;
  const dueRooms = isRoomEnabled ? rooms.filter((r) => r.dueToday) : [];
  const notPlannedRooms = isRoomEnabled ? rooms.filter((r) => !r.dueToday) : [];
  const dueDoneCount = dueRooms.filter((r) => r.status === "completed").length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button onClick={() => { setRun(null); setRooms(null); }} style={{
          display: "flex", alignItems: "center", gap: 4, background: "none", border: "none",
          color: "var(--text-secondary)", fontSize: 13, cursor: "pointer",
        }}>
          <ChevronLeft size={16} /> Tilbake
        </button>
        <StatusBadge status={run.site.status} />
      </div>

      {error && <div style={{ color: "var(--text-danger)", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 2 }}>{run.site.name}</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>{run.site.address || ""}</div>
        {run.gps_verified ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-success)" }}>
            <ShieldCheck size={15} /> Posisjon bekreftet
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
            <MapPin size={15} /> Posisjon ikke bekreftet
          </div>
        )}
      </Card>

      {isRoomEnabled ? (
        <>
          <Card style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 500 }}>Dagens plan</div>
            <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>{dueDoneCount} av {dueRooms.length} rom ferdig</div>
          </Card>

          {dueRooms.length > 0 && dueDoneCount < dueRooms.length && (
            <button onClick={bulkCompleteAllDue} style={{
              width: "100%", background: "var(--accent-orange)", color: "white", border: "none",
              padding: "12px", borderRadius: "var(--radius)", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 16,
            }}>
              Huk av alle dagens oppgaver ({dueRooms.length})
            </button>
          )}

          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>Rom å gjøre i dag</div>
          {dueRooms.map((room) => (
            <RoomRow key={room.id} room={room} expanded={expandedRoomId === room.id} onOpen={() => openRoom(room)} />
          ))}
          {dueRooms.length === 0 && <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>Ingen rom planlagt i dag.</div>}

          {expandedRoomId && roomRun && (
            <Card style={{ margin: "12px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontWeight: 500 }}>{rooms.find((r) => r.id === expandedRoomId)?.name}</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  {roomRun.items.filter((i) => i.done).length}/{roomRun.items.length}
                </div>
              </div>
              {roomRun.items.map((item) => (
                <div key={item.id} onClick={() => toggleRoomItem(item)} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                  borderTop: "1px solid var(--border)", cursor: "pointer",
                }}>
                  {item.done ? <CheckCircle2 size={16} style={{ color: "var(--text-success)" }} /> : <Circle size={16} style={{ color: "var(--text-muted)" }} />}
                  <span style={{ fontSize: 13, textDecoration: item.done ? "line-through" : "none", color: item.done ? "var(--text-secondary)" : "var(--text-primary)" }}>
                    {item.label}
                  </span>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <input ref={roomFileInputRef} type="file" accept="image/*" capture="environment" onChange={uploadRoomPhoto} style={{ display: "none" }} />
                <button onClick={() => roomFileInputRef.current.click()} style={{
                  display: "flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "center",
                  background: "var(--surface-0)", border: "1px solid var(--border)",
                  padding: "8px", borderRadius: "var(--radius)", fontSize: 12, cursor: "pointer",
                }}>
                  <Camera size={14} /> Ta bilde
                </button>
                <button onClick={completeRoom} style={{
                  flex: 1, background: "var(--text-success)", color: "white", border: "none",
                  padding: "8px", borderRadius: "var(--radius)", fontSize: 12, cursor: "pointer",
                }}>
                  Fullfør rom
                </button>
              </div>
            </Card>
          )}

          {notPlannedRooms.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", margin: "16px 0 8px" }}>Ikke planlagt i dag</div>
              {notPlannedRooms.map((room) => (
                <RoomRow key={room.id} room={room} expanded={expandedRoomId === room.id} onOpen={() => openRoom(room)} muted />
              ))}
            </>
          )}
        </>
      ) : (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontWeight: 500 }}>Sjekkliste</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{doneCount}/{run.items.length}</div>
          </div>
          {run.items.map((item) => (
            <div key={item.id} onClick={() => toggleItem(item)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 0",
              borderTop: "1px solid var(--border)", cursor: "pointer",
            }}>
              {item.done ? <CheckCircle2 size={18} style={{ color: "var(--text-success)" }} /> : <Circle size={18} style={{ color: "var(--text-muted)" }} />}
              <span style={{ fontSize: 14, textDecoration: item.done ? "line-through" : "none", color: item.done ? "var(--text-secondary)" : "var(--text-primary)" }}>
                {item.label}
              </span>
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={uploadPhoto} style={{ display: "none" }} />
            <button onClick={() => fileInputRef.current.click()} style={{
              display: "flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "center",
              background: "var(--surface-0)", border: "1px solid var(--border)",
              padding: "10px", borderRadius: "var(--radius)", fontSize: 13, cursor: "pointer",
            }}>
              <Camera size={16} /> Ta bilde{photoCount > 0 ? ` (${photoCount})` : ""}
            </button>
            <button onClick={() => setShowDeviationForm((v) => !v)} style={{
              display: "flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "center",
              background: "var(--bg-danger)", color: "var(--text-danger)", border: "1px solid var(--border-danger)",
              padding: "10px", borderRadius: "var(--radius)", fontSize: 13, cursor: "pointer",
            }}>
              <AlertTriangle size={16} /> Meld avvik
            </button>
          </div>

          {showDeviationForm && (
            <div style={{ marginTop: 12 }}>
              <textarea
                value={deviationText}
                onChange={(e) => setDeviationText(e.target.value)}
                placeholder="Beskriv avviket..."
                style={{
                  width: "100%", minHeight: 70, padding: 10, borderRadius: "var(--radius)",
                  border: "1px solid var(--border)", background: "var(--surface-2)",
                  color: "var(--text-primary)", fontSize: 14, resize: "vertical", boxSizing: "border-box",
                }}
              />
              <button onClick={submitDeviation} style={{
                marginTop: 8, background: "var(--accent-orange)", color: "white",
                border: "none", padding: "8px 16px", borderRadius: "var(--radius)", fontSize: 13, cursor: "pointer",
              }}>
                Send avvik
              </button>
            </div>
          )}
        </Card>
      )}

      {!showDeviationForm && isRoomEnabled && (
        <button onClick={() => setShowDeviationForm(true)} style={{
          display: "flex", alignItems: "center", gap: 6, justifyContent: "center", width: "100%",
          background: "var(--bg-danger)", color: "var(--text-danger)", border: "1px solid var(--border-danger)",
          padding: "10px", borderRadius: "var(--radius)", fontSize: 13, cursor: "pointer", marginTop: 12,
        }}>
          <AlertTriangle size={16} /> Meld avvik
        </button>
      )}
      {showDeviationForm && isRoomEnabled && (
        <Card style={{ marginTop: 12 }}>
          <textarea
            value={deviationText}
            onChange={(e) => setDeviationText(e.target.value)}
            placeholder="Beskriv avviket..."
            style={{
              width: "100%", minHeight: 70, padding: 10, borderRadius: "var(--radius)",
              border: "1px solid var(--border)", background: "var(--surface-2)",
              color: "var(--text-primary)", fontSize: 14, resize: "vertical", boxSizing: "border-box",
            }}
          />
          <button onClick={submitDeviation} style={{
            marginTop: 8, background: "var(--accent-orange)", color: "white",
            border: "none", padding: "8px 16px", borderRadius: "var(--radius)", fontSize: 13, cursor: "pointer",
          }}>
            Send avvik
          </button>
        </Card>
      )}

      <button onClick={complete} style={{
        marginTop: 16, width: "100%", background: "var(--text-success)", color: "white",
        border: "none", padding: "10px", borderRadius: "var(--radius)", fontSize: 14, cursor: "pointer",
      }}>
        {isRoomEnabled ? "Avslutt besøk" : "Fullfør oppdrag"}
      </button>
    </div>
  );
}

function RoomRow({ room, expanded, onOpen, muted }) {
  return (
    <div onClick={onOpen} style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 12px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
      marginBottom: 6, cursor: "pointer", opacity: muted ? 0.6 : 1,
      background: expanded ? "var(--surface-0)" : "var(--surface-1)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <DoorOpen size={15} style={{ color: "var(--text-secondary)" }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{room.name}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {muted
              ? (room.lastCleanedAt ? `Sist ${room.lastCleanedAt.slice(0, 10)}` : "Aldri rengjort")
              : `${room.itemCount} oppgaver`}
          </div>
        </div>
      </div>
      {!muted && (
        <span style={{
          fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 999, whiteSpace: "nowrap",
          background: room.status === "completed" ? "var(--c-teal)" : "var(--accent-orange-bg)",
          color: room.status === "completed" ? "var(--text-success)" : "var(--accent-orange-dark)",
        }}>
          {ROOM_STATUS_LABEL[room.status]}
        </span>
      )}
    </div>
  );
}
