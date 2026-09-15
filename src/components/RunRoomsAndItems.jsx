import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, Circle, PlayCircle, X } from "lucide-react";
import { API_URL } from "../api";
import { queueableFetch } from "../offlineQueue";

// See RunDetailModal.jsx's photoUrl for why the token rides in the query string here.
function photoUrl(filePath, token) {
  const filename = filePath.split(/[\\/]/).pop();
  return `${API_URL}/uploads/${filename}?token=${encodeURIComponent(token)}`;
}

function ItemRow({ item, variant, onToggle }) {
  const size = variant === "flat" ? 15 : 13;
  const fontSize = variant === "flat" ? 13 : 12;
  return (
    <div
      onClick={onToggle ? () => onToggle(item) : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: variant === "flat" ? "6px 0" : "3px 0 3px 4px",
        borderTop: variant === "flat" ? "1px solid var(--border)" : "none",
        cursor: onToggle ? "pointer" : "default",
      }}
    >
      {item.done
        ? <CheckCircle2 size={size} style={{ color: "var(--text-success)" }} />
        : <Circle size={size} style={{ color: "var(--text-muted)" }} />}
      <span style={{
        fontSize, textDecoration: item.done ? "line-through" : "none",
        color: item.done ? "var(--text-secondary)" : "var(--text-primary)",
      }}>
        {item.label}
      </span>
      {item.monthly ? (
        <span style={{
          fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: "var(--radius-pill)",
          background: "var(--surface-2)", color: "var(--text-secondary)", whiteSpace: "nowrap",
        }}>
          Månedlig
        </span>
      ) : null}
    </div>
  );
}

function PhotosRow({ photos, onDelete, token }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, paddingLeft: 4 }}>
      {photos.map((p) => (
        <div key={p.id} style={{ position: "relative" }}>
          <a href={photoUrl(p.file_path, token)} target="_blank" rel="noreferrer">
            <img src={photoUrl(p.file_path, token)} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: "var(--radius-sm)" }} />
          </a>
          {onDelete && (
            <button
              onClick={() => onDelete(p.id)}
              aria-label="Fjern bilde"
              style={{
                position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%",
                background: "rgba(0,0,0,0.65)", color: "white", border: "none",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function AddPhotoButton({ inputRef, onUpload }) {
  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" onChange={onUpload} style={{ display: "none" }} />
      <button
        onClick={() => inputRef.current?.click()}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "var(--surface-0)", border: "1px solid var(--border)",
          padding: "5px 10px", borderRadius: "var(--radius)", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)",
        }}
      >
        <Camera size={13} /> Ta bilde
      </button>
    </>
  );
}

function CompleteButton({ onClick, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        background: "var(--text-success)", color: "white", border: "none",
        padding: "5px 10px", borderRadius: "var(--radius)", fontSize: 12, cursor: "pointer",
      }}
    >
      <CheckCircle2 size={13} /> {label}
    </button>
  );
}

function UndoButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        background: "none", border: "1px solid var(--border)",
        padding: "5px 10px", borderRadius: "var(--radius)", fontSize: 12, cursor: "pointer", color: "var(--text-danger)",
      }}
    >
      <X size={13} /> Angre fullføring
    </button>
  );
}

function StartRoomButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        background: "var(--surface-0)", border: "1px solid var(--border)",
        padding: "5px 10px", borderRadius: "var(--radius)", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)",
      }}
    >
      <PlayCircle size={13} /> Åpne rom
    </button>
  );
}

// Local text state so typing doesn't fight the runDetail prop on every keystroke — saved on
// blur, matching the same debounce-by-blur pattern used elsewhere for free text (e.g. the room
// interval input in LokasjonerPage). Re-syncs if the underlying note changes from outside
// (onChanged() refetch after another edit lands).
function NoteField({ value, onSave, editable }) {
  const [text, setText] = useState(value || "");
  useEffect(() => setText(value || ""), [value]);

  if (!editable) {
    return value?.trim() ? (
      <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
        <strong>Notat:</strong> {value}
      </div>
    ) : null;
  }

  return (
    <textarea
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { if (text !== (value || "")) onSave(text); }}
      placeholder="Notat (valgfritt)"
      style={{
        width: "100%", minHeight: 40, marginTop: 6, padding: 6, borderRadius: "var(--radius)",
        border: "1px solid var(--border)", background: "var(--surface-0)", color: "var(--text-primary)",
        fontSize: 12, resize: "vertical", boxSizing: "border-box",
      }}
    />
  );
}

function EditedBadge({ editedAt, editedBy }) {
  if (!editedAt) return null;
  return (
    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4, fontStyle: "italic" }}>
      Redigert i etterkant: {editedAt.slice(0, 16)} av {editedBy}
    </div>
  );
}

// Shared by DashboardPage (admin), CleanerHistoryView (cleaner), and SiteHistoryView (customer,
// always editable=false) — one place for the room/flat-checklist item+photo rendering that
// otherwise would've been triplicated. `editable` reveals item-toggle/photo upload/delete
// controls, gated by `editInitials` being sent with every mutation so the backend can stamp
// edited_at/edited_by_initials when the run was already completed (a genuine retroactive edit).
export default function RunRoomsAndItems({ token, runDetail, editable, editInitials, onChanged, setError, onReportDeviation, userRole }) {
  const fileInputsRef = useRef({});

  function endpointFor(roomRunId, suffix) {
    return roomRunId ? `/rooms/runs/${roomRunId}/${suffix}` : `/checklists/runs/${runDetail.id}/${suffix}`;
  }

  // Lets a room's every remaining item get checked off in one tap instead of one at a time —
  // same shortcut the cleaner's own live "Dagens plan" already has per-room, just not previously
  // wired up in this shared day-detail view any of its callers (admin, cleaner history, customer)
  // used.
  async function completeAllRoomItems(roomRunId) {
    try {
      await queueableFetch(endpointFor(roomRunId, "items/complete-all"), {
        token, method: "POST", body: JSON.stringify({ initials: editInitials }),
      });
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleItem(roomRunId, item) {
    const done = !item.done;
    try {
      await queueableFetch(endpointFor(roomRunId, `items/${item.id}`), {
        token, method: "PATCH", body: JSON.stringify({ done, initials: editInitials }),
      });
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function uploadPhoto(roomRunId, e) {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append("photo", file);
    form.append("kind", "general");
    form.append("initials", editInitials || "");
    try {
      await queueableFetch(endpointFor(roomRunId, "photos"), { token, method: "POST", body: form });
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      e.target.value = "";
    }
  }

  async function deletePhoto(roomRunId, photoId) {
    if (!window.confirm("Fjerne bildet?")) return;
    try {
      await queueableFetch(endpointFor(roomRunId, `photos/${photoId}`), {
        token, method: "DELETE", body: JSON.stringify({ initials: editInitials }),
      });
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveNote(roomRunId, note) {
    try {
      await queueableFetch(endpointFor(roomRunId, "note"), {
        token, method: "PATCH", body: JSON.stringify({ note, initials: editInitials }),
      });
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  function inputRefFor(key) {
    if (!fileInputsRef.current[key]) fileInputsRef.current[key] = { current: null };
    return fileInputsRef.current[key];
  }

  // Checking off every item does not itself mark a room/visit as done — that's a deliberate,
  // separate signed action (matches the live flow's "Fullfør rom"/"Fullfør besøk" buttons), so
  // retroactively fixing a missed task still needs this explicit step, with the same name
  // validation used everywhere else a completion gets signed.
  async function completeRoom(roomRunId) {
    if (!editInitials?.trim()) {
      setError("Skriv inn navnet ditt for å fullføre rommet.");
      return;
    }
    try {
      await queueableFetch(`/rooms/runs/${roomRunId}/complete`, {
        token, method: "POST", body: JSON.stringify({ initials: editInitials.trim() }),
      });
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  // A room with no roomRunId yet has nothing to click at all — "IKKE STARTET" was previously a
  // dead end when opening a day retroactively (see GET /checklists/site/:siteId/date/:date),
  // since only the live check-in flow (always "today") could ever create a room_run. This lets
  // that same creation happen for whichever day is actually being viewed, current or past.
  async function startRoom(roomId) {
    try {
      await queueableFetch(`/rooms/${roomId}/checkin-date`, {
        token, method: "POST", body: JSON.stringify({ date: runDetail.started_at.slice(0, 10) }),
      });
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  // Undo for a room completed by mistake — e.g. a cleaner's bulk "Fullfør alle" catching a room
  // it shouldn't have. Only works for today's run server-side (see POST /rooms/:id/reopen), so
  // this is a no-op with a clear error if used on a past day's already-completed room.
  async function reopenRoom(roomId) {
    if (!window.confirm("Angre fullføring av dette rommet?")) return;
    try {
      await queueableFetch(`/rooms/${roomId}/reopen`, {
        token, method: "POST", body: JSON.stringify({ resetItems: true }),
      });
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function completeFlatRun() {
    if (!editInitials?.trim()) {
      setError("Skriv inn navnet ditt for å fullføre besøket.");
      return;
    }
    try {
      await queueableFetch(`/checklists/runs/${runDetail.id}/complete`, {
        token, method: "POST", body: JSON.stringify({ initials: editInitials.trim() }),
      });
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  if (runDetail.rooms?.length > 0) {
    return (
      <>
        {runDetail.rooms.map((room) => {
          const doneCount = room.items.filter((i) => i.done).length;
          const status = room.completed_at ? "FULLFØRT" : room.items.length > 0 ? "PÅGÅR" : "IKKE STARTET";
          const key = `room-${room.roomRunId}`;
          const canEditThisRoom = editable && (userRole !== "customer" || room.responsible === "customer");
          return (
            <div key={room.id} id={`room-${room.id}`} style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                  {room.name}
                  {userRole === "customer" && (
                    <span style={{
                      fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 999,
                      background: room.responsible === "customer" ? "var(--accent-orange-bg)" : "var(--surface-2)",
                      color: room.responsible === "customer" ? "var(--accent-orange-dark)" : "var(--text-muted)",
                      whiteSpace: "nowrap",
                    }}>
                      {room.responsible === "customer" ? "Dere" : "Renholder"}
                    </span>
                  )}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999,
                  background: room.completed_at ? "var(--c-teal)" : room.items.length > 0 ? "var(--accent-orange-bg)" : "var(--surface-2)",
                  color: room.completed_at ? "var(--text-success)" : room.items.length > 0 ? "var(--accent-orange-dark)" : "var(--text-muted)",
                }}>
                  {status}
                </span>
              </div>
              {room.items.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 8 }}>
                  {doneCount}/{room.items.length} oppgaver utført
                  {canEditThisRoom && doneCount < room.items.length && (
                    <button
                      onClick={() => completeAllRoomItems(room.roomRunId)}
                      style={{
                        background: "none", border: "none", padding: 0, margin: 0,
                        color: "var(--accent-orange-dark)", fontSize: 12, fontWeight: 500, cursor: "pointer",
                      }}
                    >
                      Huk av alle
                    </button>
                  )}
                </div>
              )}
              {room.items.map((item) => (
                <ItemRow
                  key={item.id} item={item} variant="room"
                  onToggle={canEditThisRoom ? (i) => toggleItem(room.roomRunId, i) : null}
                />
              ))}
              {room.photos.length > 0 && (
                <PhotosRow photos={room.photos} onDelete={canEditThisRoom ? (id) => deletePhoto(room.roomRunId, id) : null} token={token} />
              )}
              {room.roomRunId && (
                <NoteField
                  value={room.note}
                  editable={canEditThisRoom}
                  onSave={(note) => saveNote(room.roomRunId, note)}
                />
              )}
              {canEditThisRoom && room.roomRunId && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 6, flexWrap: "wrap" }}>
                  <AddPhotoButton inputRef={inputRefFor(key)} onUpload={(e) => uploadPhoto(room.roomRunId, e)} />
                  {!room.completed_at && (
                    <CompleteButton onClick={() => completeRoom(room.roomRunId)} label="Fullfør rom" />
                  )}
                  {room.completed_at && userRole !== "customer" && (
                    <UndoButton onClick={() => reopenRoom(room.id)} />
                  )}
                </div>
              )}
              {canEditThisRoom && !room.roomRunId && (
                <div style={{ marginTop: 6 }}>
                  <StartRoomButton onClick={() => startRoom(room.id)} />
                </div>
              )}
              {onReportDeviation && (
                <div style={{ marginTop: 6 }}>
                  <button
                    onClick={() => onReportDeviation(room)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      background: "none", border: "1px solid var(--border)",
                      padding: "5px 10px", borderRadius: "var(--radius)", fontSize: 12, cursor: "pointer", color: "var(--text-danger)",
                    }}
                  >
                    <AlertTriangle size={13} /> Meld avvik
                  </button>
                </div>
              )}
              <EditedBadge editedAt={room.edited_at} editedBy={room.edited_by_initials} />
            </div>
          );
        })}
      </>
    );
  }

  return (
    <>
      <div style={{ marginTop: 16, fontWeight: 600, fontSize: 13 }}>Sjekkliste</div>
      {runDetail.items.map((item) => (
        <ItemRow
          key={item.id} item={item} variant="flat"
          onToggle={editable ? (i) => toggleItem(null, i) : null}
        />
      ))}
      {runDetail.photos?.length > 0 && (
        <PhotosRow photos={runDetail.photos} onDelete={editable ? (id) => deletePhoto(null, id) : null} token={token} />
      )}
      <NoteField value={runDetail.note} editable={editable} onSave={(note) => saveNote(null, note)} />
      {editable && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 8 }}>
          <AddPhotoButton inputRef={inputRefFor("flat")} onUpload={(e) => uploadPhoto(null, e)} />
          {!runDetail.completed_at && <CompleteButton onClick={completeFlatRun} label="Fullfør besøk" />}
        </div>
      )}
      <EditedBadge editedAt={runDetail.edited_at} editedBy={runDetail.edited_by_initials} />
    </>
  );
}
