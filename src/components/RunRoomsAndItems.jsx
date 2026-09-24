import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, Circle, PlayCircle, X } from "lucide-react";
import { API_URL } from "../api";
import { queueableFetch } from "../offlineQueue";
import { ResponsibleBadge } from "./shared";
import { useI18n, useT } from "../i18n";

// See RunDetailModal.jsx's photoUrl for why the token rides in the query string here.
function photoUrl(filePath, token) {
  const filename = filePath.split(/[\\/]/).pop();
  return `${API_URL}/uploads/${filename}?token=${encodeURIComponent(token)}`;
}

// `onToggleApprove` renders a second, independent checkbox for the customer-approval gate
// (see RunRoomsAndItems' own header comment) — deliberately separate from `onToggle`/`item.done`,
// which stays the cleaner's own field throughout: an approver reviews what the cleaner already
// checked, they don't get to change it.
function ItemRow({ item, variant, onToggle, onToggleApprove, onToggleOption }) {
  const t = useT();
  const size = variant === "flat" ? 15 : 13;
  const fontSize = variant === "flat" ? 13 : 12;
  // A flervalg task's whole point is WHICH alternative was used (which soap, say) — a day view or
  // report that only showed the checkmark would drop exactly the information it was ticked to
  // record. Read-only here unless this view is editable, same as the checkmark itself.
  const options = item.options || [];
  const chosen = options.filter((o) => o.selected).map((o) => o.label);
  return (
    <div>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: variant === "flat" ? "6px 0" : "3px 0 3px 4px",
          borderTop: variant === "flat" ? "1px solid var(--border)" : "none",
        }}
      >
        <div
          onClick={onToggle ? () => onToggle(item) : undefined}
          style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, cursor: onToggle ? "pointer" : "default" }}
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
              {t("cleaner.monthly")}
            </span>
          ) : null}
        </div>
        {onToggleApprove && (
          <label
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-secondary)", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            <input type="checkbox" checked={!!item.approved} onChange={() => onToggleApprove(item)} />
            {t("run.approvedCheckbox")}
          </label>
        )}
      </div>
      {options.length > 0 && (
        onToggleOption ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, margin: "2px 0 4px 26px" }}>
            {options.map((option) => (
              <button
                key={option.id}
                onClick={() => onToggleOption(item, option)}
                style={{
                  padding: "3px 8px", borderRadius: "var(--radius-pill)", fontSize: 11, cursor: "pointer",
                  border: option.selected ? "1px solid var(--brand)" : "1px solid var(--border)",
                  background: option.selected ? "var(--brand-bg)" : "var(--surface-0)",
                  color: option.selected ? "var(--brand-dark)" : "var(--text-secondary)",
                  fontWeight: option.selected ? 600 : 400,
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "var(--text-secondary)", margin: "0 0 4px 26px" }}>
            {chosen.length ? t("run.chosenOptions", { options: chosen.join(", ") }) : t("run.noOptionChosen")}
          </div>
        )
      )}
    </div>
  );
}

function PhotosRow({ photos, onDelete, token }) {
  const t = useT();
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
              aria-label={t("cleaner.removePhoto")}
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
  const t = useT();
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
        <Camera size={13} /> {t("cleaner.takePhoto")}
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
  const t = useT();
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        background: "none", border: "1px solid var(--border)",
        padding: "5px 10px", borderRadius: "var(--radius)", fontSize: 12, cursor: "pointer", color: "var(--text-danger)",
      }}
    >
      <X size={13} /> {t("run.undoCompletion")}
    </button>
  );
}

function StartRoomButton({ onClick }) {
  const t = useT();
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        background: "var(--surface-0)", border: "1px solid var(--border)",
        padding: "5px 10px", borderRadius: "var(--radius)", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)",
      }}
    >
      <PlayCircle size={13} /> {t("run.openRoom")}
    </button>
  );
}

// Local text state so typing doesn't fight the runDetail prop on every keystroke — saved on
// blur, matching the same debounce-by-blur pattern used elsewhere for free text (e.g. the room
// interval input in LokasjonerPage). Re-syncs if the underlying note changes from outside
// (onChanged() refetch after another edit lands).
function NoteField({ value, onSave, editable }) {
  const t = useT();
  const [text, setText] = useState(value || "");
  useEffect(() => setText(value || ""), [value]);

  if (!editable) {
    return value?.trim() ? (
      <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
        <strong>{t("run.notePrefix")}</strong> {value}
      </div>
    ) : null;
  }

  return (
    <textarea
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { if (text !== (value || "")) onSave(text); }}
      placeholder={t("run.notePlaceholder")}
      style={{
        width: "100%", minHeight: 40, marginTop: 6, padding: 6, borderRadius: "var(--radius)",
        border: "1px solid var(--border)", background: "var(--surface-0)", color: "var(--text-primary)",
        fontSize: 12, resize: "vertical", boxSizing: "border-box",
      }}
    />
  );
}

function EditedBadge({ editedAt, editedBy }) {
  const t = useT();
  if (!editedAt) return null;
  return (
    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4, fontStyle: "italic" }}>
      {t("run.editedAfterwards", { date: editedAt.slice(0, 16), name: editedBy })}
    </div>
  );
}

// Shared by DashboardPage (admin), CleanerHistoryView (cleaner), and SiteHistoryView (customer,
// always editable=false) — one place for the room/flat-checklist item+photo rendering that
// otherwise would've been triplicated. `editable` reveals item-toggle/photo upload/delete
// controls, gated by `editInitials` being sent with every mutation so the backend can stamp
// edited_at/edited_by_initials when the run was already completed (a genuine retroactive edit).
export default function RunRoomsAndItems({ token, runDetail, editable, editInitials, onChanged, setError, onReportDeviation, userRole }) {
  const { t, tn } = useI18n();
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

  // Ticking an alternative also ticks its task (and clearing the last one unticks it), matching
  // both the cleaner's live view and the backend's own rule — a flervalg task can't be "utført"
  // with no answer recorded.
  async function toggleItemOption(roomRunId, item, option) {
    const selected = !option.selected;
    const nextDone = item.options.some((o) => (o.id === option.id ? selected : o.selected));
    try {
      await queueableFetch(`/rooms/runs/${roomRunId}/items/${item.id}/options/${option.id}`, {
        token, method: "PATCH", body: JSON.stringify({ selected, initials: editInitials }),
      });
      if (nextDone !== !!item.done) {
        await queueableFetch(`/rooms/runs/${roomRunId}/items/${item.id}`, {
          token, method: "PATCH", body: JSON.stringify({ done: nextDone, initials: editInitials }),
        });
      }
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleApprove(roomRunId, item) {
    const approved = !item.approved;
    try {
      await queueableFetch(endpointFor(roomRunId, `items/${item.id}/approve`), {
        token, method: "PATCH", body: JSON.stringify({ approved }),
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
    if (!window.confirm(t("cleaner.confirmRemovePhoto"))) return;
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
      setError(t("cleaner.nameRequiredRoom"));
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

  // The customer's (or admin/manager's, as the escape hatch if the customer is unreachable)
  // sign-off on a requires_approval room — this is what actually sets completed_at, see
  // POST /rooms/runs/:runId/approve's own comment on the backend.
  async function approveRoom(roomRunId) {
    if (!editInitials?.trim()) {
      setError(t("run.nameRequiredApproveRoom"));
      return;
    }
    try {
      await queueableFetch(`/rooms/runs/${roomRunId}/approve`, {
        token, method: "POST", body: JSON.stringify({ initials: editInitials.trim() }),
      });
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  // Same sign-off as approveRoom, applied to every room awaiting the customer's approval in this
  // run at once — one shared "Fullt navn" entry (the field above the room list) covers all of
  // them, so this is a loop over the same endpoint rather than a separate bulk route. Approves
  // sequentially and keeps going on a per-room failure so one bad room doesn't block the rest;
  // any failures are reported together at the end.
  async function approveAllRooms(roomRunIds) {
    if (!editInitials?.trim()) {
      setError(t("run.nameRequiredApproveAll"));
      return;
    }
    const initials = editInitials.trim();
    const failures = [];
    for (const roomRunId of roomRunIds) {
      try {
        await queueableFetch(`/rooms/runs/${roomRunId}/approve`, {
          token, method: "POST", body: JSON.stringify({ initials }),
        });
      } catch (err) {
        failures.push(err.message);
      }
    }
    onChanged();
    if (failures.length > 0) setError(`${failures.length} rom kunne ikke godkjennes: ${failures.join(", ")}`);
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
    if (!window.confirm(t("run.confirmReopen"))) return;
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
      setError(t("cleaner.nameRequiredVisit"));
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
    const approvableRoomRunIds = runDetail.rooms
      .filter((room) => {
        const awaitingApproval = room.requires_approval && room.ready_for_approval_at && !room.completed_at;
        return editable && awaitingApproval && ["customer", "admin", "manager"].includes(userRole);
      })
      .map((room) => room.roomRunId);

    return (
      <>
        {approvableRoomRunIds.length > 1 && (
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
            <CompleteButton
              onClick={() => approveAllRooms(approvableRoomRunIds)}
              label={t("run.approveAllRooms", { count: approvableRoomRunIds.length })}
            />
          </div>
        )}
        {runDetail.rooms.map((room) => {
          const doneCount = room.items.filter((i) => i.done).length;
          const awaitingApproval = room.requires_approval && room.ready_for_approval_at && !room.completed_at;
          const status = room.completed_at
            ? t("run.status.completed")
            : awaitingApproval
              ? t("run.status.awaiting")
              : room.items.length > 0
                ? t("run.status.inProgress")
                : t("run.status.notStarted");
          const key = `room-${room.roomRunId}`;
          const canEditThisRoom = editable && (userRole !== "customer" || room.responsible === "customer");
          // Who may act on the approval gate itself — the customer (the whole point of the
          // feature) plus admin/manager as a fallback if the customer's approver is unreachable
          // (see the backend route's own comment on POST /runs/:runId/approve).
          const canApproveThisRoom = editable && awaitingApproval && ["customer", "admin", "manager"].includes(userRole);
          return (
            <div key={room.id} id={`room-${room.id}`} style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                  {room.name}
                  {userRole === "customer" && <ResponsibleBadge responsible={room.responsible} perspective="customer" />}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999,
                  background: room.completed_at ? "var(--c-teal)" : awaitingApproval ? "var(--accent-blue-bg)" : room.items.length > 0 ? "var(--status-progress-bg)" : "var(--surface-2)",
                  color: room.completed_at ? "var(--text-success)" : awaitingApproval ? "var(--accent-blue-dark)" : room.items.length > 0 ? "var(--status-progress-dark)" : "var(--text-muted)",
                }}>
                  {status}
                </span>
              </div>
              {room.items.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 8 }}>
                  {tn("run.itemsDone", room.items.length, { done: doneCount, total: room.items.length })}
                  {canEditThisRoom && doneCount < room.items.length && (
                    <button
                      onClick={() => completeAllRoomItems(room.roomRunId)}
                      style={{
                        background: "none", border: "none", padding: 0, margin: 0,
                        color: "var(--brand-dark)", fontSize: 12, fontWeight: 500, cursor: "pointer",
                      }}
                    >
                      {t("run.tickAll")}
                    </button>
                  )}
                </div>
              )}
              {room.items.map((item) => (
                <ItemRow
                  key={item.id} item={item} variant="room"
                  onToggle={canEditThisRoom ? (i) => toggleItem(room.roomRunId, i) : null}
                  onToggleApprove={canApproveThisRoom ? (i) => toggleApprove(room.roomRunId, i) : null}
                  onToggleOption={canEditThisRoom ? (i, option) => toggleItemOption(room.roomRunId, i, option) : null}
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
              {(canEditThisRoom || canApproveThisRoom) && room.roomRunId && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 6, flexWrap: "wrap" }}>
                  {canEditThisRoom && <AddPhotoButton inputRef={inputRefFor(key)} onUpload={(e) => uploadPhoto(room.roomRunId, e)} />}
                  {canEditThisRoom && !room.completed_at && !awaitingApproval && (
                    <CompleteButton
                      onClick={() => completeRoom(room.roomRunId)}
                      label={room.requires_approval ? t("run.sendForApproval") : t("cleaner.completeRoom")}
                    />
                  )}
                  {canApproveThisRoom && (
                    <CompleteButton onClick={() => approveRoom(room.roomRunId)} label={t("run.approveRoom")} />
                  )}
                  {canEditThisRoom && room.completed_at && userRole !== "customer" && (
                    <UndoButton onClick={() => reopenRoom(room.id)} />
                  )}
                </div>
              )}
              {awaitingApproval && !canApproveThisRoom && (
                <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-secondary)", fontStyle: "italic" }}>
                  {t("run.sentForApprovalBy", { name: room.signed_initials })}
                </div>
              )}
              {room.approved_at && (
                <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-secondary)" }}>
                  {t("run.approvedBy", { name: room.approved_by_initials, date: room.approved_at.slice(0, 16) })}
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
                    <AlertTriangle size={13} /> {t("cleaner.reportDeviation")}
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
      <div style={{ marginTop: 16, fontWeight: 600, fontSize: 13 }}>{t("cleaner.checklist")}</div>
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
          {!runDetail.completed_at && <CompleteButton onClick={completeFlatRun} label={t("run.completeVisit")} />}
        </div>
      )}
      <EditedBadge editedAt={runDetail.edited_at} editedBy={runDetail.edited_by_initials} />
    </>
  );
}
