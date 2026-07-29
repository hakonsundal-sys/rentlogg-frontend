import { useRef } from "react";
import { Camera, CheckCircle2, Circle, X } from "lucide-react";
import { apiFetch, API_URL } from "../api";

function photoUrl(filePath) {
  const filename = filePath.split(/[\\/]/).pop();
  return `${API_URL}/uploads/${filename}`;
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
    </div>
  );
}

function PhotosRow({ photos, onDelete }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, paddingLeft: 4 }}>
      {photos.map((p) => (
        <div key={p.id} style={{ position: "relative" }}>
          <a href={photoUrl(p.file_path)} target="_blank" rel="noreferrer">
            <img src={photoUrl(p.file_path)} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: "var(--radius-sm)" }} />
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
    <div style={{ marginTop: 6 }}>
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
    </div>
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
export default function RunRoomsAndItems({ token, runDetail, editable, editInitials, onChanged, setError }) {
  const fileInputsRef = useRef({});

  function endpointFor(roomRunId, suffix) {
    return roomRunId ? `/rooms/runs/${roomRunId}/${suffix}` : `/checklists/runs/${runDetail.id}/${suffix}`;
  }

  async function toggleItem(roomRunId, item) {
    const done = !item.done;
    try {
      await apiFetch(endpointFor(roomRunId, `items/${item.id}`), {
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
      await apiFetch(endpointFor(roomRunId, "photos"), { token, method: "POST", body: form });
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
      await apiFetch(endpointFor(roomRunId, `photos/${photoId}`), {
        token, method: "DELETE", body: JSON.stringify({ initials: editInitials }),
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

  if (runDetail.rooms?.length > 0) {
    return (
      <>
        {runDetail.rooms.map((room) => {
          const doneCount = room.items.filter((i) => i.done).length;
          const status = room.completed_at ? "FULLFØRT" : room.items.length > 0 ? "PÅGÅR" : "IKKE STARTET";
          const key = `room-${room.roomRunId}`;
          return (
            <div key={room.id} style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{room.name}</span>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999,
                  background: room.completed_at ? "var(--c-teal)" : room.items.length > 0 ? "var(--accent-orange-bg)" : "var(--surface-2)",
                  color: room.completed_at ? "var(--text-success)" : room.items.length > 0 ? "var(--accent-orange-dark)" : "var(--text-muted)",
                }}>
                  {status}
                </span>
              </div>
              {room.items.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-secondary)" }}>
                  {doneCount}/{room.items.length} oppgaver utført
                </div>
              )}
              {room.items.map((item) => (
                <ItemRow
                  key={item.id} item={item} variant="room"
                  onToggle={editable ? (i) => toggleItem(room.roomRunId, i) : null}
                />
              ))}
              {room.photos.length > 0 && (
                <PhotosRow photos={room.photos} onDelete={editable ? (id) => deletePhoto(room.roomRunId, id) : null} />
              )}
              {editable && room.roomRunId && (
                <AddPhotoButton inputRef={inputRefFor(key)} onUpload={(e) => uploadPhoto(room.roomRunId, e)} />
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
        <PhotosRow photos={runDetail.photos} onDelete={editable ? (id) => deletePhoto(null, id) : null} />
      )}
      {editable && (
        <AddPhotoButton inputRef={inputRefFor("flat")} onUpload={(e) => uploadPhoto(null, e)} />
      )}
      <EditedBadge editedAt={runDetail.edited_at} editedBy={runDetail.edited_by_initials} />
    </>
  );
}
