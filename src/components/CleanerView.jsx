import { useEffect, useRef, useState } from "react";
import {
  QrCode, MapPin, Camera, AlertTriangle, CheckCircle2, Circle, ChevronLeft, ShieldCheck, DoorOpen, Keyboard, X, History, Clock, FileText, Save,
} from "lucide-react";
import { apiFetch, API_URL } from "../api";
import { queueableFetch, subscribeQueue, useQueueStatus, isNetworkError } from "../offlineQueue";
import { Card, StatusBadge, DocumentsList } from "./shared";
import QrScanner from "./QrScanner";
import CleanerHistoryView from "./CleanerHistoryView";

function tabBtnStyle(active) {
  return {
    padding: "6px 14px", borderRadius: 999, fontSize: 13, cursor: "pointer",
    border: active ? "1px solid var(--accent-orange)" : "1px solid var(--border)",
    background: active ? "var(--accent-orange-bg)" : "var(--surface-0)",
    color: active ? "var(--accent-orange-dark)" : "var(--text-secondary)",
    display: "inline-flex", alignItems: "center",
  };
}

const deviationSelectStyle = {
  padding: "7px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
  background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 13,
};

function photoUrl(filePath) {
  const filename = filePath.split(/[\\/]/).pop();
  return `${API_URL}/uploads/${filename}`;
}

// Prefers the site's own coordinates (exact) over its free-text address (geocoded by Maps at
// open time) — falls back to address since not every site has lat/lng set.
function mapUrlFor(site) {
  if (site.latitude != null && site.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${site.latitude},${site.longitude}`;
  }
  if (site.address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.address)}`;
  }
  return null;
}

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


// The QR image encodes a full check-in URL (.../checkin/<token>); accept either that or a
// bare token typed into the manual-entry fallback.
function extractQrToken(scannedText) {
  const text = (scannedText || "").trim();
  try {
    const url = new URL(text);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || null;
  } catch {
    return text || null;
  }
}

const ROOM_STATUS_LABEL = { missing: "IKKE STARTET", in_progress: "PÅGÅR", completed: "FERDIG" };

const ONBOARDING_DISMISSED_KEY = "rentlogg_onboarding_dismissed";
function isOnboardingDismissed() {
  try {
    return !!localStorage.getItem(ONBOARDING_DISMISSED_KEY);
  } catch {
    return false;
  }
}

export default function CleanerView({ token, user }) {
  const [run, setRun] = useState(null);
  const [rooms, setRooms] = useState(null); // null = not room-enabled site (or not yet loaded)
  const [expandedRoomId, setExpandedRoomId] = useState(null);
  const [roomRun, setRoomRun] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [showDeviationForm, setShowDeviationForm] = useState(false);
  const [deviationText, setDeviationText] = useState("");
  const [deviationPhoto, setDeviationPhoto] = useState(null);
  const [deviationRoomId, setDeviationRoomId] = useState("");
  const [deviationTasks, setDeviationTasks] = useState([]);
  const [deviationTaskLabel, setDeviationTaskLabel] = useState("");
  const [deviationPriority, setDeviationPriority] = useState("medium");
  const [photoCount, setPhotoCount] = useState(0);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingRoomPhoto, setUploadingRoomPhoto] = useState(false);
  const [error, setError] = useState("");
  const [undoAction, setUndoAction] = useState(null); // { label, onUndo }
  const [initials, setInitials] = useState(() => user?.name || "");
  const [viewTab, setViewTab] = useState("today");
  const [documents, setDocuments] = useState([]);
  const [showDocuments, setShowDocuments] = useState(false);
  const [pendingRoomPhotos, setPendingRoomPhotos] = useState([]); // photos queued offline: { tempId, previewUrl }
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboardingDismissed());
  const fileInputRef = useRef(null);
  const roomFileInputRef = useRef(null);
  const deviationFileInputRef = useRef(null);
  const undoTimeoutRef = useRef(null);
  const initialsInputRef = useRef(null);
  const { pendingCount, flushNow } = useQueueStatus();

  useEffect(() => {
    function goOnline() { setIsOnline(true); }
    function goOffline() { setIsOnline(false); }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Reconciles a queued room photo once it actually reaches the server: drop the local blob
  // preview and pull the real, server-confirmed photo list so it shows with a real id (needed
  // for delete to work).
  useEffect(() => {
    const unsubscribe = subscribeQueue((event) => {
      if (event.type !== "success" && event.type !== "failed") return;
      let wasPendingPhoto = false;
      setPendingRoomPhotos((list) => {
        const match = list.find((p) => p.tempId === event.tempId);
        if (match) {
          wasPendingPhoto = true;
          URL.revokeObjectURL(match.previewUrl);
        }
        return list.filter((p) => p.tempId !== event.tempId);
      });
      // Only refetch when the flushed item was actually one of this room's pending photos —
      // otherwise any unrelated queued mutation flushing (e.g. an item toggle from a different
      // room) would re-POST checkin here too, for no reason.
      if (wasPendingPhoto && event.type === "success" && expandedRoomId) {
        apiFetch(`/rooms/${expandedRoomId}/checkin`, { token, method: "POST" }).then(setRoomRun).catch(() => {});
      }
    });
    return unsubscribe;
  }, [expandedRoomId, token]);

  function showUndo(label, onUndo) {
    clearTimeout(undoTimeoutRef.current);
    setUndoAction({ label, onUndo });
    undoTimeoutRef.current = setTimeout(() => setUndoAction(null), 15000);
  }

  // Jumps to and highlights the signature field when a "fullfør" action is blocked on it —
  // the field itself lives up in the visit-info card, potentially far from whichever room's
  // "Fullfør rom" button the cleaner just tapped, so the plain error text alone was easy to miss.
  function focusInitials() {
    initialsInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    initialsInputRef.current?.focus();
  }

  async function performUndo() {
    if (!undoAction) return;
    clearTimeout(undoTimeoutRef.current);
    const { onUndo } = undoAction;
    setUndoAction(null);
    try {
      await onUndo();
    } catch (err) {
      setError(err.message);
    }
  }

  async function checkInWithToken(qrToken) {
    setError("");
    setScanning(true);
    try {
      const position = await getPosition();
      const checkin = await apiFetch(`/sites/checkin/${qrToken}`, {
        token, method: "POST", body: JSON.stringify(position || {}),
      });
      const fullRun = await apiFetch(`/checklists/runs/${checkin.runId}`, { token });
      setRun({ ...fullRun, site: checkin.site, gps_verified: checkin.gps_verified });
      setPhotoCount(0);
      setShowDeviationForm(false);
      setExpandedRoomId(null);
      setRoomRun(null);
      clearTimeout(undoTimeoutRef.current);
      setUndoAction(null);

      const siteRooms = await apiFetch(`/sites/${checkin.site.id}/rooms`, { token });
      setRooms(siteRooms);

      setShowDocuments(false);
      apiFetch(`/sites/${checkin.site.id}/documents`, { token }).then(setDocuments).catch(() => setDocuments([]));
    } catch (err) {
      // Check-in needs the server's checklist back to render anything, so it can't just be
      // queued like the in-visit mutations below — give a clear reason instead of a raw
      // "Failed to fetch" when there's simply no connection yet.
      setError(isNetworkError(err) ? "Ingen nettforbindelse. Prøv igjen når du har dekning." : err.message);
    } finally {
      setScanning(false);
    }
  }

  function handleQrScanned(scannedText) {
    setShowScanner(false);
    const qrToken = extractQrToken(scannedText);
    if (!qrToken) {
      setError("Kunne ikke lese QR-koden. Prøv igjen.");
      return;
    }
    checkInWithToken(qrToken);
  }

  function submitManualCode(e) {
    e.preventDefault();
    if (!manualCode.trim()) return;
    setShowManualEntry(false);
    checkInWithToken(extractQrToken(manualCode));
    setManualCode("");
  }

  function refreshRooms() {
    if (!run) return;
    apiFetch(`/sites/${run.site.id}/rooms`, { token }).then(setRooms).catch(() => {});
  }

  async function openRoom(room) {
    setError("");
    setPendingRoomPhotos([]);
    try {
      const data = await apiFetch(`/rooms/${room.id}/checkin`, { token, method: "POST" });
      setRoomRun(data);
      setExpandedRoomId(room.id);
    } catch (err) {
      // Same reasoning as checkInWithToken — opening a room needs its item list back to render
      // at all, so this can't be handed to the offline queue.
      setError(isNetworkError(err) ? "Ingen nettforbindelse. Prøv igjen når du har dekning." : err.message);
    }
  }

  // Tapping the already-open room again just closes it — any note text already saved on blur
  // when the tap moved focus away from the textarea, same as switching straight to another room.
  function toggleRoom(room) {
    if (expandedRoomId === room.id) {
      setExpandedRoomId(null);
      setRoomRun(null);
      return;
    }
    openRoom(room);
  }

  async function toggleRoomItem(item) {
    const done = !item.done;
    setRoomRun((r) => ({ ...r, items: r.items.map((i) => (i.id === item.id ? { ...i, done } : i)) }));
    try {
      await queueableFetch(`/rooms/runs/${roomRun.id}/items/${item.id}`, { token, method: "PATCH", body: JSON.stringify({ done }) });
    } catch (err) {
      setError(err.message);
    }
  }

  async function markAllRoomItems() {
    setRoomRun((r) => ({ ...r, items: r.items.map((i) => ({ ...i, done: true })) }));
    try {
      await queueableFetch(`/rooms/runs/${roomRun.id}/items/complete-all`, { token, method: "POST" });
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
    const previewUrl = URL.createObjectURL(file);
    setUploadingRoomPhoto(true);
    try {
      const result = await queueableFetch(`/rooms/runs/${roomRun.id}/photos`, { token, method: "POST", body: form });
      if (result.queued) {
        setPendingRoomPhotos((p) => [...p, { tempId: result.tempId, previewUrl }]);
      } else {
        setRoomRun((r) => ({ ...r, photos: [...(r.photos || []), result] }));
        URL.revokeObjectURL(previewUrl);
      }
    } catch (err) {
      setError(err.message);
      URL.revokeObjectURL(previewUrl);
    } finally {
      setUploadingRoomPhoto(false);
      e.target.value = "";
    }
  }

  async function deleteRoomPhoto(photoId) {
    if (!window.confirm("Fjerne bildet?")) return;
    try {
      await queueableFetch(`/rooms/runs/${roomRun.id}/photos/${photoId}`, { token, method: "DELETE" });
      setRoomRun((r) => ({ ...r, photos: r.photos.filter((p) => p.id !== photoId) }));
    } catch (err) {
      setError(err.message);
    }
  }

  function updateRoomNoteLocal(note) {
    setRoomRun((r) => ({ ...r, note }));
  }

  async function saveRoomNote() {
    try {
      await queueableFetch(`/rooms/runs/${roomRun.id}/note`, { token, method: "PATCH", body: JSON.stringify({ note: roomRun.note || "" }) });
    } catch (err) {
      setError(err.message);
    }
  }

  // Explicit "Lagre"-knapp ved siden av "Ta bilde" — lagrer notatet med en gang (ikke avhengig av
  // at feltet mister fokus) og lukker romkortet, siden man da er ferdig med rommet for nå uten
  // nødvendigvis å fullføre det.
  async function saveRoomNoteAndClose() {
    await saveRoomNote();
    setExpandedRoomId(null);
    setRoomRun(null);
  }

  async function completeRoom() {
    setError("");
    if (!initials.trim()) {
      setError("Skriv inn navnet ditt for å fullføre rommet.");
      focusInitials();
      return;
    }
    const roomId = expandedRoomId;
    const roomName = rooms.find((r) => r.id === roomId)?.name || "Rom";
    try {
      await queueableFetch(`/rooms/runs/${roomRun.id}/complete`, { token, method: "POST", body: JSON.stringify({ initials: initials.trim() }) });
      setExpandedRoomId(null);
      setRoomRun(null);
      refreshRooms();
      showUndo(`${roomName} fullført`, async () => {
        await queueableFetch(`/rooms/${roomId}/reopen`, { token, method: "POST" });
        refreshRooms();
      });
    } catch (err) {
      setError(err.message);
    }
  }

  async function bulkCompleteAllDue() {
    setError("");
    if (!initials.trim()) {
      setError("Skriv inn navnet ditt for å fullføre oppgavene.");
      focusInitials();
      return;
    }
    const roomIds = rooms.filter((r) => r.dueToday && r.status !== "completed").map((r) => r.id);
    if (roomIds.length === 0) return;
    if (!window.confirm(`Fullføre alle ${roomIds.length} gjenstående rom for i dag?`)) return;
    try {
      await queueableFetch(`/sites/${run.site.id}/rooms/complete-all-due`, { token, method: "POST", body: JSON.stringify({ initials: initials.trim() }) });
      refreshRooms();
      showUndo(`${roomIds.length} rom fullført`, async () => {
        await Promise.all(
          roomIds.map((id) => queueableFetch(`/rooms/${id}/reopen`, { token, method: "POST", body: JSON.stringify({ resetItems: true }) }))
        );
        refreshRooms();
      });
    } catch (err) {
      setError(err.message);
    }
  }

  // Populates the task dropdown for whichever room is picked, mirroring the same
  // room/task-scoping the customer-facing "Meld avvik" form already offers — so a deviation
  // filed from a room-based site can actually say which of the (often dozens of) rooms it's
  // about, instead of relying on the cleaner remembering to mention it in the free text.
  async function onDeviationRoomChange(roomId) {
    setDeviationRoomId(roomId);
    setDeviationTaskLabel("");
    if (!roomId) {
      setDeviationTasks([]);
      return;
    }
    try {
      setDeviationTasks(await apiFetch(`/rooms/${roomId}/items`, { token }));
    } catch {
      setDeviationTasks([]);
    }
  }

  async function submitDeviation() {
    if (!deviationText.trim()) return;
    if (!initials.trim()) {
      setError("Skriv inn navnet ditt for å melde avvik.");
      focusInitials();
      return;
    }
    try {
      const deviation = await queueableFetch("/deviations", {
        token, method: "POST",
        body: JSON.stringify({
          site_id: run.site.id, run_id: run.id,
          room_id: deviationRoomId || null, room_task_label: deviationTaskLabel || null,
          description: deviationText, priority: deviationPriority,
          initials: initials.trim(),
        }),
      });
      if (deviation.queued) {
        if (deviationPhoto) {
          setError("Avviket er lagret og sendes når du får nett igjen. Legg til bildet på nytt etterpå — det kan ikke kobles til avviket før det er sendt inn.");
        }
      } else if (deviationPhoto) {
        const form = new FormData();
        form.append("photo", deviationPhoto);
        await queueableFetch(`/deviations/${deviation.id}/photos`, { token, method: "POST", body: form });
      }
      setDeviationText("");
      setDeviationPhoto(null);
      setDeviationRoomId("");
      setDeviationTasks([]);
      setDeviationTaskLabel("");
      setDeviationPriority("medium");
      setShowDeviationForm(false);
      setRun((r) => ({ ...r, site: { ...r.site, status: "deviation" } }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleItem(item) {
    const done = !item.done;
    setRun((r) => ({ ...r, items: r.items.map((i) => (i.id === item.id ? { ...i, done } : i)) }));
    try {
      await queueableFetch(`/checklists/runs/${run.id}/items/${item.id}`, { token, method: "PATCH", body: JSON.stringify({ done }) });
    } catch (err) {
      setError(err.message);
    }
  }

  function updateRunNoteLocal(note) {
    setRun((r) => ({ ...r, note }));
  }

  async function saveRunNote() {
    try {
      await queueableFetch(`/checklists/runs/${run.id}/note`, { token, method: "PATCH", body: JSON.stringify({ note: run.note || "" }) });
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
    setPhotoCount((c) => c + 1);
    setUploadingPhoto(true);
    try {
      await queueableFetch(`/checklists/runs/${run.id}/photos`, { token, method: "POST", body: form });
    } catch (err) {
      setPhotoCount((c) => Math.max(0, c - 1));
      setError(err.message);
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  }

  async function complete() {
    setError("");
    if (!initials.trim()) {
      setError("Skriv inn navnet ditt for å fullføre besøket.");
      focusInitials();
      return;
    }
    if (rooms && rooms.length > 0) {
      const incompleteDue = rooms.filter((r) => r.dueToday && r.status !== "completed");
      if (incompleteDue.length > 0) {
        const proceed = window.confirm(`${incompleteDue.length} rom er ikke fullført ennå — avslutte likevel?`);
        if (!proceed) return;
      }
    }
    try {
      await queueableFetch(`/checklists/runs/${run.id}/complete`, { token, method: "POST", body: JSON.stringify({ initials: initials.trim() }) });
      setRun(null);
      setRooms(null);
      clearTimeout(undoTimeoutRef.current);
      setUndoAction(null);
    } catch (err) {
      setError(err.message);
    }
  }

  const viewTabs = (
    <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
      <button onClick={() => setViewTab("today")} style={tabBtnStyle(viewTab === "today")}>I dag</button>
      <button onClick={() => setViewTab("history")} style={tabBtnStyle(viewTab === "history")}>
        <History size={13} style={{ marginRight: 4 }} /> Tidligere
      </button>
    </div>
  );

  const offlineBanner = (!isOnline || pendingCount > 0) && (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8,
      background: "var(--surface-0)", border: "1px solid var(--border)",
      borderRadius: "var(--radius)", padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "var(--text-secondary)",
    }}>
      <span>
        {!isOnline
          ? "Ingen nettforbindelse — endringer lagres lokalt og sendes automatisk."
          : `${pendingCount} endring${pendingCount === 1 ? "" : "er"} venter på å sendes.`}
      </span>
      {pendingCount > 0 && (
        <button onClick={flushNow} style={{
          background: "none", border: "none", color: "var(--accent-orange-dark)",
          fontWeight: 600, cursor: "pointer", fontSize: 13,
        }}>
          Prøv igjen nå
        </button>
      )}
    </div>
  );

  if (viewTab === "history") {
    return (
      <div>
        {viewTabs}
        <CleanerHistoryView token={token} user={user} initials={initials} />
      </div>
    );
  }

  if (!run) {
    if (showScanner) {
      return (
        <div>
          {viewTabs}
          {offlineBanner}
          <QrScanner onScan={handleQrScanned} onCancel={() => setShowScanner(false)} />
          {error && <div style={{ color: "var(--text-danger)", fontSize: 13, marginTop: 12 }}>{error}</div>}
        </div>
      );
    }
    return (
      <div>
        {viewTabs}
        {offlineBanner}
        {showOnboarding && (
          <Card style={{ marginBottom: 12, fontSize: 13 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Kom i gang</div>
            <div style={{ color: "var(--text-secondary)", lineHeight: 1.7 }}>
              1. Skann QR-koden ved lokasjonen<br />
              2. Huk av rom og oppgaver etter hvert som du gjør dem<br />
              3. Skriv navnet ditt og trykk «Fullfør»
            </div>
            <button
              onClick={() => {
                try { localStorage.setItem(ONBOARDING_DISMISSED_KEY, "1"); } catch { /* ignore */ }
                setShowOnboarding(false);
              }}
              style={{
                marginTop: 10, background: "none", border: "none", color: "var(--accent-orange-dark)",
                fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0,
              }}
            >
              Skjønner, skjul
            </button>
          </Card>
        )}
        <Card style={{ textAlign: "center", padding: 40 }}>
        <QrCode size={40} style={{ margin: "0 auto 12px", color: "var(--text-secondary)" }} />
        <div style={{ marginBottom: 16, color: "var(--text-secondary)" }}>Skann QR-koden ved lokasjonen for å starte oppdraget</div>
        {error && <div style={{ color: "var(--text-danger)", fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <button onClick={() => { setError(""); setShowScanner(true); }} disabled={scanning} style={{
          background: "var(--accent-orange)", color: "white", border: "none",
          padding: "10px 20px", borderRadius: "var(--radius)", fontSize: 14, cursor: "pointer",
        }}>
          {scanning ? "Sjekker inn..." : "Skann QR-kode"}
        </button>
        <div style={{ marginTop: 14 }}>
          <button onClick={() => setShowManualEntry((v) => !v)} style={{
            display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none",
            color: "var(--text-secondary)", fontSize: 13, cursor: "pointer",
          }}>
            <Keyboard size={14} /> Skriv inn kode manuelt
          </button>
        </div>
        {showManualEntry && (
          <form onSubmit={submitManualCode} style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "center" }}>
            <input
              value={manualCode} onChange={(e) => setManualCode(e.target.value)}
              placeholder="QR-kode" autoFocus
              style={{
                padding: "8px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
                background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 13, width: 180,
              }}
            />
            <button type="submit" disabled={scanning} style={{
              background: "var(--accent-orange)", color: "white", border: "none",
              padding: "8px 14px", borderRadius: "var(--radius)", fontSize: 13, cursor: "pointer",
            }}>
              Sjekk inn
            </button>
          </form>
        )}
        </Card>
      </div>
    );
  }

  const isRoomEnabled = rooms && rooms.length > 0;
  const doneCount = run.items.filter((i) => i.done).length;
  const dueRooms = isRoomEnabled ? rooms.filter((r) => r.dueToday) : [];
  const notPlannedRooms = isRoomEnabled ? rooms.filter((r) => !r.dueToday) : [];
  const dueDoneCount = dueRooms.filter((r) => r.status === "completed").length;

  // Rendered inline right under whichever RoomRow was tapped, instead of always popping up in a
  // fixed spot above the whole list — so opening a room near the bottom doesn't jump the view.
  function renderExpandedRoom(room) {
    return (
      <Card style={{ marginTop: 6, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 500 }}>{room.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {roomRun.items.filter((i) => i.done).length}/{roomRun.items.length}
            </div>
            {roomRun.items.length > 0 && roomRun.items.some((i) => !i.done) && (
              <button onClick={markAllRoomItems} style={{
                background: "none", border: "none", color: "var(--accent-orange-dark)",
                fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0,
              }}>
                Merk alle
              </button>
            )}
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
            {item.monthly ? (
              <span style={{
                fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: "var(--radius-pill)",
                background: "var(--surface-2)", color: "var(--text-secondary)", whiteSpace: "nowrap",
              }}>
                Månedlig
              </span>
            ) : null}
          </div>
        ))}
        {(roomRun.photos?.length > 0 || pendingRoomPhotos.length > 0) && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            {roomRun.photos.map((p) => (
              <div key={p.id} style={{ position: "relative" }}>
                <a href={photoUrl(p.file_path)} target="_blank" rel="noreferrer">
                  <img src={photoUrl(p.file_path)} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: "var(--radius-sm)" }} />
                </a>
                <button
                  onClick={() => deleteRoomPhoto(p.id)}
                  aria-label="Fjern bilde"
                  style={{
                    position: "absolute", top: -8, right: -8, width: 28, height: 28, borderRadius: "50%",
                    background: "rgba(0,0,0,0.65)", color: "white", border: "none",
                    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {pendingRoomPhotos.map((p) => (
              <div key={p.tempId} style={{ position: "relative" }} title="Venter på nett — sendes automatisk">
                <img src={p.previewUrl} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: "var(--radius-sm)", opacity: 0.55 }} />
                <div style={{
                  position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Clock size={18} style={{ color: "white", filter: "drop-shadow(0 0 2px rgba(0,0,0,0.8))" }} />
                </div>
              </div>
            ))}
          </div>
        )}
        <textarea
          value={roomRun.note || ""}
          onChange={(e) => updateRoomNoteLocal(e.target.value)}
          onBlur={saveRoomNote}
          placeholder="Notat for dette rommet (valgfritt)"
          style={{
            width: "100%", minHeight: 50, marginTop: 12, padding: 8, borderRadius: "var(--radius)",
            border: "1px solid var(--border)", background: "var(--surface-0)", color: "var(--text-primary)",
            fontSize: 13, resize: "vertical", boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input ref={roomFileInputRef} type="file" accept="image/*" onChange={uploadRoomPhoto} style={{ display: "none" }} />
            <button onClick={() => roomFileInputRef.current.click()} disabled={uploadingRoomPhoto} style={{
              display: "flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "center",
              background: "var(--surface-0)", border: "1px solid var(--border)",
              padding: "12px", borderRadius: "var(--radius)", fontSize: 14,
              cursor: uploadingRoomPhoto ? "default" : "pointer", opacity: uploadingRoomPhoto ? 0.6 : 1,
            }}>
              <Camera size={16} /> {uploadingRoomPhoto ? "Laster opp..." : "Ta bilde"}
            </button>
            <button onClick={saveRoomNoteAndClose} style={{
              display: "flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "center",
              background: "var(--surface-0)", border: "1px solid var(--border)",
              padding: "12px", borderRadius: "var(--radius)", fontSize: 14, cursor: "pointer",
            }}>
              <Save size={16} /> Lagre
            </button>
          </div>
          <button onClick={completeRoom} style={{
            background: "var(--text-success)", color: "white", border: "none",
            padding: "12px", borderRadius: "var(--radius)", fontSize: 14, cursor: "pointer",
          }}>
            Fullfør rom
          </button>
        </div>
      </Card>
    );
  }

  return (
    <div>
      {viewTabs}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button onClick={() => { setRun(null); setRooms(null); clearTimeout(undoTimeoutRef.current); setUndoAction(null); }} style={{
          display: "flex", alignItems: "center", gap: 4, background: "none", border: "none",
          color: "var(--text-secondary)", fontSize: 13, cursor: "pointer",
        }}>
          <ChevronLeft size={16} /> Tilbake
        </button>
        <StatusBadge status={run.site.status} />
      </div>

      {offlineBanner}

      {error && <div style={{ color: "var(--text-danger)", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {undoAction && (
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "var(--sidebar-active-bg)", border: "1px solid var(--accent-orange-bg)",
          borderRadius: "var(--radius)", padding: "10px 14px", marginBottom: 16, fontSize: 13,
        }}>
          <span>{undoAction.label}</span>
          <button onClick={performUndo} style={{
            background: "none", border: "none", color: "var(--accent-orange-dark)",
            fontWeight: 600, cursor: "pointer", fontSize: 13,
          }}>
            Angre
          </button>
        </div>
      )}

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 2 }}>{run.site.name}</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>{run.site.address || ""}</div>
        {run.gps_verified ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-success)" }}>
            <ShieldCheck size={15} /> Posisjon bekreftet
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
              <MapPin size={15} /> Posisjon ikke bekreftet
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, marginLeft: 21 }}>
              Kun til info — du trenger ikke gjøre noe med dette.
            </div>
          </div>
        )}
        {documents.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => setShowDocuments((v) => !v)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none",
                padding: 0, fontSize: 13, color: "var(--accent-orange-dark)", cursor: "pointer",
              }}
            >
              <FileText size={13} /> Dokumenter ({documents.length})
            </button>
            {showDocuments && <div style={{ marginTop: 6 }}><DocumentsList documents={documents} /></div>}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)" }}>Signatur (navn)</label>
          <input
            ref={initialsInputRef}
            value={initials} onChange={(e) => setInitials(e.target.value)}
            placeholder="Fullt navn" maxLength={60}
            style={{
              padding: "5px 8px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
              background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 13, width: 160,
            }}
          />
        </div>
      </Card>

      {isRoomEnabled ? (
        <>
          <Card style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 500 }}>Dagens plan</div>
            <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>{dueDoneCount} av {dueRooms.length} rom ferdig</div>
            {mapUrlFor(run.site) && (
              <a
                href={mapUrlFor(run.site)} target="_blank" rel="noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4, marginTop: 8,
                  fontSize: 13, color: "var(--accent-orange-dark)", textDecoration: "none",
                }}
              >
                <MapPin size={13} /> Åpne kart
              </a>
            )}
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
            <div key={room.id}>
              <RoomRow room={room} expanded={expandedRoomId === room.id} onOpen={() => toggleRoom(room)} />
              {expandedRoomId === room.id && roomRun && renderExpandedRoom(room)}
            </div>
          ))}
          {dueRooms.length === 0 && <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>Ingen rom planlagt i dag.</div>}

          {notPlannedRooms.length > 0 && (
            <>
              <div style={{ margin: "16px 0 8px" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Ikke planlagt i dag</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                  Disse følger en annen renholdsplan og trengs ikke i dag — du kan likevel åpne og gjøre dem om nødvendig.
                </div>
              </div>
              {notPlannedRooms.map((room) => (
                <div key={room.id}>
                  <RoomRow room={room} expanded={expandedRoomId === room.id} onOpen={() => toggleRoom(room)} muted />
                  {expandedRoomId === room.id && roomRun && renderExpandedRoom(room)}
                </div>
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

          <textarea
            value={run.note || ""}
            onChange={(e) => updateRunNoteLocal(e.target.value)}
            onBlur={saveRunNote}
            placeholder="Notat for besøket (valgfritt)"
            style={{
              width: "100%", minHeight: 50, marginTop: 12, padding: 8, borderRadius: "var(--radius)",
              border: "1px solid var(--border)", background: "var(--surface-0)", color: "var(--text-primary)",
              fontSize: 13, resize: "vertical", boxSizing: "border-box",
            }}
          />

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={uploadPhoto} style={{ display: "none" }} />
            <button onClick={() => fileInputRef.current.click()} disabled={uploadingPhoto} style={{
              display: "flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "center",
              background: "var(--surface-0)", border: "1px solid var(--border)",
              padding: "10px", borderRadius: "var(--radius)", fontSize: 13,
              cursor: uploadingPhoto ? "default" : "pointer", opacity: uploadingPhoto ? 0.6 : 1,
            }}>
              <Camera size={16} /> {uploadingPhoto ? "Laster opp..." : `Ta bilde${photoCount > 0 ? ` (${photoCount})` : ""}`}
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
              <input ref={deviationFileInputRef} type="file" accept="image/*" onChange={(e) => setDeviationPhoto(e.target.files[0] || null)} style={{ display: "none" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select value={deviationPriority} onChange={(e) => setDeviationPriority(e.target.value)} style={deviationSelectStyle}>
                  <option value="low">Lav prioritet</option>
                  <option value="medium">Middels prioritet</option>
                  <option value="high">Høy prioritet</option>
                </select>
                <button type="button" onClick={() => deviationFileInputRef.current.click()} style={{
                  display: "flex", alignItems: "center", gap: 6, background: "var(--surface-0)", border: "1px solid var(--border)",
                  padding: "8px 12px", borderRadius: "var(--radius)", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)",
                }}>
                  <Camera size={13} /> {deviationPhoto ? deviationPhoto.name : "Legg ved bilde"}
                </button>
                <button onClick={submitDeviation} style={{
                  background: "var(--accent-orange)", color: "white",
                  border: "none", padding: "8px 16px", borderRadius: "var(--radius)", fontSize: 13, cursor: "pointer",
                }}>
                  Send avvik
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {!showDeviationForm && isRoomEnabled && (
        <button
          onClick={() => {
            // If a room is open when "Meld avvik" is tapped, assume that's the room the
            // avvik is about — one less thing to pick, and easy to change if it's wrong.
            if (expandedRoomId) onDeviationRoomChange(String(expandedRoomId));
            setShowDeviationForm(true);
          }}
          style={{
            display: "flex", alignItems: "center", gap: 6, justifyContent: "center", width: "100%",
            background: "var(--bg-danger)", color: "var(--text-danger)", border: "1px solid var(--border-danger)",
            padding: "10px", borderRadius: "var(--radius)", fontSize: 13, cursor: "pointer", marginTop: 12,
          }}
        >
          <AlertTriangle size={16} /> Meld avvik
        </button>
      )}
      {showDeviationForm && isRoomEnabled && (
        <Card style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <select value={deviationRoomId} onChange={(e) => onDeviationRoomChange(e.target.value)} style={deviationSelectStyle}>
              <option value="">Generelt (ikke rom-spesifikt)</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            {deviationRoomId && (
              <select value={deviationTaskLabel} onChange={(e) => setDeviationTaskLabel(e.target.value)} style={deviationSelectStyle}>
                <option value="">Generelt for rommet</option>
                {deviationTasks.map((t) => <option key={t.id} value={t.label}>{t.label}</option>)}
              </select>
            )}
          </div>
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
          <input ref={deviationFileInputRef} type="file" accept="image/*" onChange={(e) => setDeviationPhoto(e.target.files[0] || null)} style={{ display: "none" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select value={deviationPriority} onChange={(e) => setDeviationPriority(e.target.value)} style={deviationSelectStyle}>
              <option value="low">Lav prioritet</option>
              <option value="medium">Middels prioritet</option>
              <option value="high">Høy prioritet</option>
            </select>
            <button type="button" onClick={() => deviationFileInputRef.current.click()} style={{
              display: "flex", alignItems: "center", gap: 6, background: "var(--surface-0)", border: "1px solid var(--border)",
              padding: "8px 12px", borderRadius: "var(--radius)", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)",
            }}>
              <Camera size={13} /> {deviationPhoto ? deviationPhoto.name : "Legg ved bilde"}
            </button>
            <button onClick={submitDeviation} style={{
              background: "var(--accent-orange)", color: "white",
              border: "none", padding: "8px 16px", borderRadius: "var(--radius)", fontSize: 13, cursor: "pointer",
            }}>
              Send avvik
            </button>
          </div>
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
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: "var(--radius-pill)", whiteSpace: "nowrap",
            background: room.status === "completed" ? "var(--c-teal)" : "var(--accent-orange-bg)",
            color: room.status === "completed" ? "var(--text-success)" : "var(--accent-orange-dark)",
          }}>
            {ROOM_STATUS_LABEL[room.status]}
          </span>
          {room.status === "completed" && room.signedInitials && (
            <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>Signert {room.signedInitials}</span>
          )}
        </div>
      )}
    </div>
  );
}
