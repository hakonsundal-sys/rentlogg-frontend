import { useEffect, useRef, useState } from "react";
import {
  QrCode, MapPin, Camera, AlertTriangle, CheckCircle2, Circle, ChevronLeft, ChevronDown, ChevronRight, ShieldCheck, DoorOpen, Keyboard, X, History, Clock, FileText, Save, CalendarDays, Search, GraduationCap,
} from "lucide-react";
import { apiFetch, API_URL } from "../api";
import { queueableFetch, subscribeQueue, useQueueStatus, isNetworkError } from "../offlineQueue";
import { Card, StatusBadge, DocumentsList } from "./shared";
import { useI18n } from "../i18n";
import QrScanner from "./QrScanner";
import CleanerHistoryView from "./CleanerHistoryView";
import TrainingView, { isSettled as isTrainingSettled } from "./TrainingView";
import TimeClockCard from "./TimeClockCard";
import { hasModule, MODULE_TRAINING, MODULE_TIMECLOCK } from "../modules";
import RoomGrid from "./RoomGrid";
import RunDetailModal from "./RunDetailModal";

function currentMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date()).slice(0, 7);
}

// Which site/room a cleaner is mid-checklist on — sessionStorage, not React state alone, because
// a phone's OS routinely discards this tab's whole JS state while the native camera is open (or
// the screen locks mid-upload) and reloads it fresh once control returns. Before this existed,
// that dropped a cleaner straight back to "Skann QR-kode" with no memory of which room they were
// in, mid-round — the actual photo usually survived fine (the offline queue is IndexedDB-backed),
// it was purely the navigation that got lost. Kept separate from App.jsx's auth persistence since
// this is CleanerView-specific state, not something every role needs. Cleared once a room/visit
// is genuinely finished so a stale entry doesn't reopen an old room next time.
const CONTEXT_STORAGE_KEY = "rentlogg_cleaner_context";

function contextFromStorage() {
  try {
    const raw = sessionStorage.getItem(CONTEXT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveContext(value) {
  try {
    if (value) sessionStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(CONTEXT_STORAGE_KEY);
  } catch {
    // sessionStorage unavailable — restoration just won't work after a forced reload
  }
}

// Called from App.jsx on logout — a device shared between cleaners (common; it's usually one
// work phone, not one per person) shouldn't have the next person who logs in silently auto-check
// themselves into whichever site the previous cleaner had open.
export function clearCleanerContext() {
  saveContext(null);
}

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

// /uploads is an authenticated route now — a plain <img src>/<a href> can't attach an
// Authorization header, so the token rides along as a query param instead.
function photoUrl(filePath, token) {
  const filename = filePath.split(/[\\/]/).pop();
  return `${API_URL}/uploads/${filename}?token=${encodeURIComponent(token)}`;
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

const ONBOARDING_DISMISSED_KEY = "rentlogg_onboarding_dismissed";
function isOnboardingDismissed() {
  try {
    return !!localStorage.getItem(ONBOARDING_DISMISSED_KEY);
  } catch {
    return false;
  }
}

export default function CleanerView({ token, user, pendingCheckinToken, onCheckinHandled }) {
  const { t, tn } = useI18n();
  const [run, setRun] = useState(null);
  const [rooms, setRooms] = useState(null); // null = not room-enabled site (or not yet loaded)
  const [expandedRoomId, setExpandedRoomId] = useState(null);
  // Set when a tap tried to tick a flervalg task with nothing chosen — shows the hint under that
  // one task instead of the page-level error banner, which is far away from the thing tapped.
  const [optionHintItemId, setOptionHintItemId] = useState(null);
  const [roomFilter, setRoomFilter] = useState("");
  // Rooms on another schedule are collapsed by default — on a site with 25+ rooms they used to
  // bury the handful actually due today under a wall of grey rows nobody scrolls past.
  const [showNotPlanned, setShowNotPlanned] = useState(false);
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
  // How many courses still need something from her — drives the badge on the Opplæring tab. Only
  // fetched at all when the company has the training module (see src/modules.js).
  const [trainingDue, setTrainingDue] = useState(0);
  const showTraining = hasModule(user, MODULE_TRAINING);
  // Timeregistrering, when the company has it: the stamp card renders on both the "skann QR-kode"
  // screen and inside an open visit, because somebody who has already walked out still has to be
  // able to stamp out. Bumped after every check-in so the card picks up the shift that scan just
  // started, rather than waiting for its own next poll.
  const showTimeClock = hasModule(user, MODULE_TIMECLOCK);
  const [timeClockKey, setTimeClockKey] = useState(0);
  const [documents, setDocuments] = useState([]);
  const [showDocuments, setShowDocuments] = useState(false);
  const [pendingRoomPhotos, setPendingRoomPhotos] = useState([]); // photos queued offline: { tempId, previewUrl }
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboardingDismissed());
  const [showVaskeplan, setShowVaskeplan] = useState(false);
  const [vaskeplanMonth, setVaskeplanMonth] = useState(currentMonth);
  const [vaskeplanGrid, setVaskeplanGrid] = useState(null);
  const [openDate, setOpenDate] = useState(null); // "YYYY-MM-DD" — which grid day's checklist is open
  const fileInputRef = useRef(null);
  const roomFileInputRef = useRef(null);
  const deviationFileInputRef = useRef(null);
  const undoTimeoutRef = useRef(null);
  const initialsInputRef = useRef(null);
  const { pendingCount, flushNow } = useQueueStatus();

  useEffect(() => {
    if (showTraining) countTrainingDue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTraining, token]);

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

  // Arriving here via a scanned site QR's native-camera link (?checkin=<token>, see App.jsx)
  // finishes the same check-in a manual scan does — same checkInWithToken, just triggered once
  // on mount instead of from the in-app scanner. Cleared either way (success or failure) so a
  // later reload of this same tab doesn't keep re-attempting it.
  useEffect(() => {
    if (pendingCheckinToken) {
      checkInWithToken(pendingCheckinToken).finally(() => onCheckinHandled?.());
      return;
    }
    // No fresh scan/deep-link to handle — see if this mount is actually a forced reload mid-visit
    // (the mobile-camera/screen-lock scenario CONTEXT_STORAGE_KEY exists for) rather than a
    // genuinely fresh open, and if so jump straight back to the room instead of "Skann QR-kode".
    const saved = contextFromStorage();
    if (saved?.qrToken) {
      checkInWithToken(saved.qrToken).then((siteRooms) => {
        const room = saved.roomId && siteRooms?.find((r) => r.id === saved.roomId);
        if (room) openRoom(room);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // A queued item only ever fails permanently on a real HTTP error (not "still offline" —
      // those just keep waiting), so this is never going to succeed on its own. Previously this
      // went completely unsurfaced: a pending-photo preview would just quietly vanish, and any
      // other queued action (item toggle, note, "fullfør rom"...) would be dropped with no sign
      // anything went wrong at all.
      if (event.type === "failed") {
        setError(
          t(wasPendingPhoto ? "cleaner.photoLostOnFailure" : "cleaner.queuedChangeFailed", { error: event.error })
        );
      }
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedRoomId, token]);

  // Only fetched while the panel is actually open, and re-fetched on month change — same
  // "vaskeplan" grid admin/customer see, scoped to whichever site is currently checked into.
  useEffect(() => {
    if (!showVaskeplan || !run?.site) return;
    setVaskeplanGrid(null);
    apiFetch(`/sites/${run.site.id}/rooms/monthly-grid?month=${vaskeplanMonth}`, { token })
      .then(setVaskeplanGrid)
      .catch((err) => setError(err.message));
  }, [showVaskeplan, run?.site, vaskeplanMonth, token]);

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
      saveContext({ qrToken, roomId: null });

      const siteRooms = await apiFetch(`/sites/${checkin.site.id}/rooms`, { token });
      setRooms(siteRooms);

      setShowDocuments(false);
      setTimeClockKey((n) => n + 1);
      apiFetch(`/sites/${checkin.site.id}/documents`, { token }).then(setDocuments).catch(() => setDocuments([]));
      return siteRooms; // used by the mount-time restore effect below, which needs the freshly
      // fetched list right away rather than waiting a render for `rooms` state to catch up
    } catch (err) {
      // Check-in needs the server's checklist back to render anything, so it can't just be
      // queued like the in-visit mutations below — give a clear reason instead of a raw
      // "Failed to fetch" when there's simply no connection yet.
      setError(isNetworkError(err) ? t("cleaner.noConnection") : err.message);
      return null;
    } finally {
      setScanning(false);
    }
  }

  function handleQrScanned(scannedText) {
    setShowScanner(false);
    const qrToken = extractQrToken(scannedText);
    if (!qrToken) {
      setError(t("cleaner.qrUnreadable"));
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
      if (run?.site?.qr_token) saveContext({ qrToken: run.site.qr_token, roomId: room.id });
    } catch (err) {
      // Same reasoning as checkInWithToken — opening a room needs its item list back to render
      // at all, so this can't be handed to the offline queue.
      setError(isNetworkError(err) ? t("cleaner.noConnection") : err.message);
    }
  }

  // Tapping the already-open room again just closes it — any note text already saved on blur
  // when the tap moved focus away from the textarea, same as switching straight to another room.
  function toggleRoom(room) {
    if (expandedRoomId === room.id) {
      setExpandedRoomId(null);
      setRoomRun(null);
      if (run?.site?.qr_token) saveContext({ qrToken: run.site.qr_token, roomId: null });
      return;
    }
    openRoom(room);
  }

  // A task with options ("flervalg", e.g. which soap was used) documents WHICH alternative was
  // chosen — the backend refuses to mark it done with nothing ticked, so don't pretend otherwise
  // here: point at the choices instead of flipping a checkmark that would bounce back.
  function itemNeedsChoice(item) {
    return item.options?.length > 0 && !item.options.some((o) => o.selected);
  }

  async function toggleRoomItem(item) {
    const done = !item.done;
    if (done && itemNeedsChoice(item)) {
      setOptionHintItemId(item.id);
      return;
    }
    setOptionHintItemId(null);
    setRoomRun((r) => ({ ...r, items: r.items.map((i) => (i.id === item.id ? { ...i, done } : i)) }));
    try {
      await queueableFetch(`/rooms/runs/${roomRun.id}/items/${item.id}`, { token, method: "PATCH", body: JSON.stringify({ done }) });
    } catch (err) {
      setError(err.message);
    }
  }

  // Ticking the first alternative also ticks the task itself, and clearing the last one unticks
  // it again — one tap does the whole thing, which is the point of the flervalg task: the answer
  // IS the completion. (The backend enforces the same pairing, see its options route.)
  async function toggleRoomItemOption(item, option) {
    const selected = !option.selected;
    const nextOptions = item.options.map((o) => (o.id === option.id ? { ...o, selected } : o));
    const nextDone = nextOptions.some((o) => o.selected);
    setOptionHintItemId(null);
    setRoomRun((r) => ({
      ...r,
      items: r.items.map((i) => (i.id === item.id ? { ...i, options: nextOptions, done: nextDone } : i)),
    }));
    try {
      // Order matters offline as well as online: the queue replays in the order things were
      // queued, and the backend rejects done=true before a choice exists.
      await queueableFetch(`/rooms/runs/${roomRun.id}/items/${item.id}/options/${option.id}`, {
        token, method: "PATCH", body: JSON.stringify({ selected }),
      });
      if (nextDone !== item.done) {
        await queueableFetch(`/rooms/runs/${roomRun.id}/items/${item.id}`, {
          token, method: "PATCH", body: JSON.stringify({ done: nextDone }),
        });
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function markAllRoomItems() {
    // Mirrors the backend's own rule: a bulk tick can't answer a flervalg task for the cleaner,
    // so those stay open (and visibly so) until someone says which alternative was used.
    setRoomRun((r) => ({ ...r, items: r.items.map((i) => (itemNeedsChoice(i) ? i : { ...i, done: true })) }));
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
    if (!window.confirm(t("cleaner.confirmRemovePhoto"))) return;
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
      setError(t("cleaner.nameRequiredRoom"));
      focusInitials();
      return;
    }
    const roomId = expandedRoomId;
    const roomName = rooms.find((r) => r.id === roomId)?.name || t("cleaner.roomFallbackName");
    try {
      await queueableFetch(`/rooms/runs/${roomRun.id}/complete`, { token, method: "POST", body: JSON.stringify({ initials: initials.trim() }) });
      setExpandedRoomId(null);
      setRoomRun(null);
      refreshRooms();
      showUndo(t("cleaner.roomCompletedUndo", { room: roomName }), async () => {
        await queueableFetch(`/rooms/${roomId}/reopen`, { token, method: "POST" });
        refreshRooms();
      });
    } catch (err) {
      setError(err.message);
    }
  }

  // `targetRooms` narrows the sweep to one chapter; omitted, it means every room still due today,
  // which is what the button above the list does. The backend applies its own role scoping on top
  // either way, so a narrowed list can never reach a room the wide one would not have.
  async function bulkCompleteAllDue(targetRooms, chapterName) {
    setError("");
    if (!initials.trim()) {
      setError(t("cleaner.nameRequiredTasks"));
      focusInitials();
      return;
    }
    const target = targetRooms || rooms.filter((r) => r.dueToday && r.status !== "completed");
    const roomIds = target.map((r) => r.id);
    if (roomIds.length === 0) return;
    const question = chapterName
      ? tn("cleaner.confirmCompleteChapter", roomIds.length, { area: chapterName })
      : tn("cleaner.confirmCompleteAllDue", roomIds.length);
    if (!window.confirm(question)) return;
    try {
      const result = await queueableFetch(`/sites/${run.site.id}/rooms/complete-all-due`, {
        token, method: "POST",
        body: JSON.stringify({ initials: initials.trim(), ...(targetRooms ? { room_ids: roomIds } : {}) }),
      });
      refreshRooms();
      // The backend leaves a room open when it holds a flervalg task nobody answered (see its
      // complete-all-due route) — say which ones, otherwise they just quietly stay unfinished.
      const skipped = result?.skippedRooms || [];
      if (skipped.length > 0) {
        setError(tn("cleaner.bulkSkippedRooms", skipped.length, { rooms: skipped.join(", ") }));
      }
      showUndo(tn("cleaner.roomsCompletedUndo", result?.completedCount ?? roomIds.length), async () => {
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
      setError(t("cleaner.nameRequiredDeviation"));
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
          setError(t("cleaner.deviationQueuedPhotoWarning"));
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
      setError(t("cleaner.nameRequiredVisit"));
      focusInitials();
      return;
    }
    if (rooms && rooms.length > 0) {
      const incompleteDue = rooms.filter((r) => r.dueToday && r.status !== "completed");
      if (incompleteDue.length > 0) {
        const proceed = window.confirm(tn("cleaner.confirmFinishWithIncomplete", incompleteDue.length));
        if (!proceed) return;
      }
    }
    try {
      await queueableFetch(`/checklists/runs/${run.id}/complete`, { token, method: "POST", body: JSON.stringify({ initials: initials.trim() }) });
      setRun(null);
      setRooms(null);
      setShowVaskeplan(false);
      setOpenDate(null);
      clearTimeout(undoTimeoutRef.current);
      setUndoAction(null);
    } catch (err) {
      setError(err.message);
    }
  }

  // Takes the list straight from TrainingView when it has just loaded one, and fetches its own only
  // on first mount, when nothing has opened that tab yet. Failures are ignored: a missing badge is
  // a far smaller problem than an error on the screen she checks in from every morning.
  function countTrainingDue(rows) {
    const apply = (list) => setTrainingDue(list.filter((row) => !isTrainingSettled(row)).length);
    if (Array.isArray(rows)) return apply(rows);
    apiFetch("/training/me", { token }).then(apply).catch(() => {});
  }

  const viewTabs = (
    <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
      <button onClick={() => setViewTab("today")} style={tabBtnStyle(viewTab === "today")}>{t("cleaner.tab.today")}</button>
      <button onClick={() => setViewTab("history")} style={tabBtnStyle(viewTab === "history")}>
        <History size={13} style={{ marginRight: 4 }} /> {t("cleaner.tab.history")}
      </button>
      {showTraining && (
        <button onClick={() => setViewTab("training")} style={tabBtnStyle(viewTab === "training")}>
          <GraduationCap size={13} style={{ marginRight: 4 }} /> {t("training.tab")}
          {/* The count is the whole point of the badge: an unfinished course is easy to never
              notice on a tab you have no reason to open. */}
          {trainingDue > 0 && (
            <span style={{
              marginLeft: 6, minWidth: 18, padding: "0 5px", borderRadius: 999, fontSize: 11, fontWeight: 700,
              background: "var(--accent-orange)", color: "white",
            }}>
              {trainingDue}
            </span>
          )}
        </button>
      )}
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
          ? t("cleaner.offline.noConnection")
          : tn("cleaner.offline.pending", pendingCount)}
      </span>
      {pendingCount > 0 && (
        <button onClick={flushNow} style={{
          background: "none", border: "none", color: "var(--accent-orange-dark)",
          fontWeight: 600, cursor: "pointer", fontSize: 13,
        }}>
          {t("cleaner.offline.retryNow")}
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

  if (viewTab === "training") {
    return (
      <div>
        {viewTabs}
        {/* Re-counted on the way out, so a course finished in here stops nagging from the tab. */}
        <TrainingView token={token} user={user} onChanged={countTrainingDue} />
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
        {showTimeClock && <TimeClockCard token={token} refreshKey={timeClockKey} />}
        {showOnboarding && (
          <Card style={{ marginBottom: 12, fontSize: 13 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{t("cleaner.onboarding.title")}</div>
            <div style={{ color: "var(--text-secondary)", lineHeight: 1.7 }}>
              {t("cleaner.onboarding.step1")}<br />
              {t("cleaner.onboarding.step2")}<br />
              {t("cleaner.onboarding.step3")}
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
              {t("cleaner.onboarding.dismiss")}
            </button>
          </Card>
        )}
        <Card style={{ textAlign: "center", padding: 40 }}>
        <QrCode size={40} style={{ margin: "0 auto 12px", color: "var(--text-secondary)" }} />
        <div style={{ marginBottom: 16, color: "var(--text-secondary)" }}>{t("cleaner.scanPrompt")}</div>
        {error && <div style={{ color: "var(--text-danger)", fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <button onClick={() => { setError(""); setShowScanner(true); }} disabled={scanning} style={{
          background: "var(--accent-orange)", color: "white", border: "none",
          padding: "10px 20px", borderRadius: "var(--radius)", fontSize: 14, cursor: "pointer",
        }}>
          {scanning ? t("cleaner.scanning") : t("cleaner.scanButton")}
        </button>
        <div style={{ marginTop: 14 }}>
          <button onClick={() => setShowManualEntry((v) => !v)} style={{
            display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none",
            color: "var(--text-secondary)", fontSize: 13, cursor: "pointer",
          }}>
            <Keyboard size={14} /> {t("cleaner.manualEntry")}
          </button>
        </div>
        {showManualEntry && (
          <form onSubmit={submitManualCode} style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "center" }}>
            <input
              value={manualCode} onChange={(e) => setManualCode(e.target.value)}
              placeholder={t("cleaner.qrCodePlaceholder")} autoFocus
              style={{
                padding: "8px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
                background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 13, width: 180,
              }}
            />
            <button type="submit" disabled={scanning} style={{
              background: "var(--accent-orange)", color: "white", border: "none",
              padding: "8px 14px", borderRadius: "var(--radius)", fontSize: 13, cursor: "pointer",
            }}>
              {t("cleaner.checkIn")}
            </button>
          </form>
        )}
        </Card>
      </div>
    );
  }

  const isRoomEnabled = rooms && rooms.length > 0;
  const doneCount = run.items.filter((i) => i.done).length;
  const allDueRooms = isRoomEnabled ? rooms.filter((r) => r.dueToday) : [];
  // The filter is a find-this-room shortcut, not a view mode: the day's counters above stay
  // measured against every room actually due, however the list below is narrowed.
  const matchesFilter = (room) => room.name.toLowerCase().includes(roomFilter.trim().toLowerCase());
  const dueRooms = allDueRooms.filter(matchesFilter);
  const notPlannedRooms = isRoomEnabled ? rooms.filter((r) => !r.dueToday).filter(matchesFilter) : [];
  const dueDoneCount = allDueRooms.filter((r) => r.status === "completed").length;
  // Chapters follow the source plan's own Område, in the order the rooms already sit in — so a
  // 60-room site reads as "Fjøs", "Slakt storfe ren", "Skjæreri" rather than one endless list.
  // Rooms without an area (most sites, which never set one) fall into a single unnamed chapter,
  // which renders exactly as the flat list this used to be.
  const dueChapters = [];
  for (const room of dueRooms) {
    const name = room.area || null;
    const last = dueChapters[dueChapters.length - 1];
    if (last && last.name === name) last.rooms.push(room);
    else dueChapters.push({ key: `${name || ""}-${room.id}`, name, rooms: [room] });
  }
  for (const chapter of dueChapters) {
    chapter.doneCount = chapter.rooms.filter((r) => r.status === "completed").length;
    chapter.remaining = chapter.rooms.filter((r) => r.status !== "completed");
  }
  const showRoomFilter = isRoomEnabled && rooms.length > 8;
  // Searching, or having one of them open (e.g. restored after the phone dropped the tab), always
  // wins over the collapsed default — otherwise the room you're looking for is hidden from you.
  const notPlannedOpen =
    showNotPlanned || roomFilter.trim().length > 0 || notPlannedRooms.some((r) => r.id === expandedRoomId);

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
                {t("cleaner.markAll")}
              </button>
            )}
          </div>
        </div>
        {roomRun.items.map((item) => (
          <RoomTaskRow
            key={item.id}
            item={item}
            hintVisible={optionHintItemId === item.id}
            onToggle={() => toggleRoomItem(item)}
            onToggleOption={(option) => toggleRoomItemOption(item, option)}
          />
        ))}
        {(roomRun.photos?.length > 0 || pendingRoomPhotos.length > 0) && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            {roomRun.photos.map((p) => (
              <div key={p.id} style={{ position: "relative" }}>
                <a href={photoUrl(p.file_path, token)} target="_blank" rel="noreferrer">
                  <img src={photoUrl(p.file_path, token)} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: "var(--radius-sm)" }} />
                </a>
                <button
                  onClick={() => deleteRoomPhoto(p.id)}
                  aria-label={t("cleaner.removePhoto")}
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
              <div key={p.tempId} style={{ position: "relative" }} title={t("cleaner.photoPending")}>
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
          placeholder={t("cleaner.roomNotePlaceholder")}
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
              <Camera size={16} /> {uploadingRoomPhoto ? t("cleaner.uploading") : t("cleaner.takePhoto")}
            </button>
            <button onClick={saveRoomNoteAndClose} style={{
              display: "flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "center",
              background: "var(--surface-0)", border: "1px solid var(--border)",
              padding: "12px", borderRadius: "var(--radius)", fontSize: 14, cursor: "pointer",
            }}>
              <Save size={16} /> {t("cleaner.save")}
            </button>
          </div>
          <button onClick={completeRoom} style={{
            background: "var(--text-success)", color: "white", border: "none",
            padding: "12px", borderRadius: "var(--radius)", fontSize: 14, cursor: "pointer",
          }}>
            {t("cleaner.completeRoom")}
          </button>
        </div>
      </Card>
    );
  }

  return (
    <div>
      {viewTabs}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button onClick={() => { setRun(null); setRooms(null); setShowVaskeplan(false); setOpenDate(null); clearTimeout(undoTimeoutRef.current); setUndoAction(null); }} style={{
          display: "flex", alignItems: "center", gap: 4, background: "none", border: "none",
          color: "var(--text-secondary)", fontSize: 13, cursor: "pointer",
        }}>
          <ChevronLeft size={16} /> {t("cleaner.back")}
        </button>
        <StatusBadge status={run.site.status} />
      </div>

      {offlineBanner}

      {showTimeClock && <TimeClockCard token={token} refreshKey={timeClockKey} />}

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
            {t("cleaner.undo")}
          </button>
        </div>
      )}

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 2 }}>{run.site.name}</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>{run.site.address || ""}</div>
        {run.gps_verified ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-success)" }}>
            <ShieldCheck size={15} /> {t("cleaner.gpsVerified")}
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
              <MapPin size={15} /> {t("cleaner.gpsNotVerified")}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, marginLeft: 21 }}>
              {t("cleaner.gpsInfoOnly")}
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
              <FileText size={13} /> {t("cleaner.documents", { count: documents.length })}
            </button>
            {showDocuments && <div style={{ marginTop: 6 }}><DocumentsList documents={documents} token={token} /></div>}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)" }}>{t("cleaner.signatureLabel")}</label>
          <input
            ref={initialsInputRef}
            value={initials} onChange={(e) => setInitials(e.target.value)}
            placeholder={t("deviation.fullNamePlaceholder")} maxLength={60}
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
            <div style={{ fontWeight: 500 }}>{t("cleaner.todayPlan")}</div>
            <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>
              {t("cleaner.roomsDoneOf", { done: dueDoneCount, total: allDueRooms.length })}
            </div>
            {allDueRooms.length > 0 && (
              <div style={{ height: 6, borderRadius: 3, background: "var(--surface-2)", marginTop: 8, overflow: "hidden" }}>
                <div style={{
                  width: `${Math.round((dueDoneCount / allDueRooms.length) * 100)}%`, height: "100%",
                  background: dueDoneCount === allDueRooms.length ? "var(--text-success)" : "var(--accent-orange)",
                  transition: "width 0.2s",
                }} />
              </div>
            )}
            <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
              {mapUrlFor(run.site) && (
                <a
                  href={mapUrlFor(run.site)} target="_blank" rel="noreferrer"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    fontSize: 13, color: "var(--accent-orange-dark)", textDecoration: "none",
                  }}
                >
                  <MapPin size={13} /> {t("cleaner.openMap")}
                </a>
              )}
              <button
                onClick={() => setShowVaskeplan(true)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0,
                  fontSize: 13, color: "var(--accent-orange-dark)", cursor: "pointer",
                }}
              >
                <CalendarDays size={13} /> {t("grid.title")}
              </button>
            </div>
          </Card>

          {allDueRooms.length > 0 && dueDoneCount < allDueRooms.length && (
            <button onClick={bulkCompleteAllDue} style={{
              width: "100%", background: "var(--accent-orange)", color: "white", border: "none",
              padding: "12px", borderRadius: "var(--radius)", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 16,
            }}>
              {t("cleaner.completeAllToday", { count: allDueRooms.length })}
            </button>
          )}

          {showRoomFilter && (
            <div style={{ position: "relative", marginBottom: 12 }}>
              <Search size={15} style={{ position: "absolute", left: 10, top: 12, color: "var(--text-muted)" }} />
              <input
                value={roomFilter}
                onChange={(e) => setRoomFilter(e.target.value)}
                placeholder={t("cleaner.searchRooms")}
                style={{
                  width: "100%", boxSizing: "border-box", padding: "10px 32px", borderRadius: "var(--radius)",
                  border: "1px solid var(--border)", background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 14,
                }}
              />
              {roomFilter && (
                <button
                  onClick={() => setRoomFilter("")}
                  aria-label={t("cleaner.clearSearch")}
                  style={{
                    position: "absolute", right: 6, top: 6, width: 28, height: 28, borderRadius: "50%",
                    background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <X size={15} />
                </button>
              )}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>{t("cleaner.roomsToday")}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{dueDoneCount}/{allDueRooms.length}</div>
          </div>
          {dueChapters.map((chapter) => (
            <div key={chapter.key}>
              {chapter.name && (
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                  margin: "14px 0 6px", paddingTop: 10, borderTop: "1px solid var(--border)",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {chapter.name}{" "}
                    <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
                      {chapter.doneCount}/{chapter.rooms.length}
                    </span>
                  </div>
                  {chapter.remaining.length > 0 && (
                    <button
                      onClick={() => bulkCompleteAllDue(chapter.remaining, chapter.name)}
                      style={{
                        background: "none", border: "1px solid var(--border)", borderRadius: 999,
                        padding: "4px 12px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
                        color: "var(--accent-orange-dark)", cursor: "pointer",
                      }}
                    >
                      {t("cleaner.completeChapter", { count: chapter.remaining.length })}
                    </button>
                  )}
                </div>
              )}
              {chapter.rooms.map((room) => (
                <div key={room.id}>
                  <RoomRow room={room} expanded={expandedRoomId === room.id} onOpen={() => toggleRoom(room)} />
                  {expandedRoomId === room.id && roomRun && renderExpandedRoom(room)}
                </div>
              ))}
            </div>
          ))}
          {dueRooms.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
              {roomFilter.trim() ? t("cleaner.noRoomMatches", { query: roomFilter.trim() }) : t("cleaner.noRoomsToday")}
            </div>
          )}

          {notPlannedRooms.length > 0 && (
            <>
              <button
                onClick={() => setShowNotPlanned((v) => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left",
                  margin: "16px 0 8px", padding: 0, background: "none", border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: 600, color: "var(--text-secondary)",
                }}
              >
                {notPlannedOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                {t("cleaner.notPlannedToday")}
                <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>({notPlannedRooms.length})</span>
              </button>
              {notPlannedOpen && (
                <>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 8px 21px" }}>
                    {t("cleaner.notPlannedHelp")}
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
          )}
        </>
      ) : (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontWeight: 500 }}>{t("cleaner.checklist")}</div>
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
            placeholder={t("cleaner.runNotePlaceholder")}
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
              <Camera size={16} />{" "}
              {uploadingPhoto
                ? t("cleaner.uploading")
                : photoCount > 0
                  ? t("cleaner.takePhotoCount", { count: photoCount })
                  : t("cleaner.takePhoto")}
            </button>
            <button onClick={() => setShowDeviationForm((v) => !v)} style={{
              display: "flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "center",
              background: "var(--bg-danger)", color: "var(--text-danger)", border: "1px solid var(--border-danger)",
              padding: "10px", borderRadius: "var(--radius)", fontSize: 13, cursor: "pointer",
            }}>
              <AlertTriangle size={16} /> {t("cleaner.reportDeviation")}
            </button>
          </div>

          {showDeviationForm && (
            <div style={{ marginTop: 12 }}>
              <textarea
                value={deviationText}
                onChange={(e) => setDeviationText(e.target.value)}
                placeholder={t("cleaner.deviationPlaceholder")}
                style={{
                  width: "100%", minHeight: 70, padding: 10, borderRadius: "var(--radius)",
                  border: "1px solid var(--border)", background: "var(--surface-2)",
                  color: "var(--text-primary)", fontSize: 14, resize: "vertical", boxSizing: "border-box",
                }}
              />
              <input ref={deviationFileInputRef} type="file" accept="image/*" onChange={(e) => setDeviationPhoto(e.target.files[0] || null)} style={{ display: "none" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select value={deviationPriority} onChange={(e) => setDeviationPriority(e.target.value)} style={deviationSelectStyle}>
                  <option value="low">{t("cleaner.priority.low")}</option>
                  <option value="medium">{t("cleaner.priority.medium")}</option>
                  <option value="high">{t("cleaner.priority.high")}</option>
                </select>
                <button type="button" onClick={() => deviationFileInputRef.current.click()} style={{
                  display: "flex", alignItems: "center", gap: 6, background: "var(--surface-0)", border: "1px solid var(--border)",
                  padding: "8px 12px", borderRadius: "var(--radius)", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)",
                }}>
                  <Camera size={13} /> {deviationPhoto ? deviationPhoto.name : t("cleaner.attachPhoto")}
                </button>
                <button onClick={submitDeviation} style={{
                  background: "var(--accent-orange)", color: "white",
                  border: "none", padding: "8px 16px", borderRadius: "var(--radius)", fontSize: 13, cursor: "pointer",
                }}>
                  {t("cleaner.sendDeviation")}
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
          <AlertTriangle size={16} /> {t("cleaner.reportDeviation")}
        </button>
      )}
      {showDeviationForm && isRoomEnabled && (
        <Card style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <select value={deviationRoomId} onChange={(e) => onDeviationRoomChange(e.target.value)} style={deviationSelectStyle}>
              <option value="">{t("cleaner.deviationGeneral")}</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            {deviationRoomId && (
              <select value={deviationTaskLabel} onChange={(e) => setDeviationTaskLabel(e.target.value)} style={deviationSelectStyle}>
                <option value="">{t("cleaner.deviationGeneralRoom")}</option>
                {deviationTasks.map((t) => <option key={t.id} value={t.label}>{t.label}</option>)}
              </select>
            )}
          </div>
          <textarea
            value={deviationText}
            onChange={(e) => setDeviationText(e.target.value)}
            placeholder={t("cleaner.deviationPlaceholder")}
            style={{
              width: "100%", minHeight: 70, padding: 10, borderRadius: "var(--radius)",
              border: "1px solid var(--border)", background: "var(--surface-2)",
              color: "var(--text-primary)", fontSize: 14, resize: "vertical", boxSizing: "border-box",
            }}
          />
          <input ref={deviationFileInputRef} type="file" accept="image/*" onChange={(e) => setDeviationPhoto(e.target.files[0] || null)} style={{ display: "none" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select value={deviationPriority} onChange={(e) => setDeviationPriority(e.target.value)} style={deviationSelectStyle}>
              <option value="low">{t("cleaner.priority.low")}</option>
              <option value="medium">{t("cleaner.priority.medium")}</option>
              <option value="high">{t("cleaner.priority.high")}</option>
            </select>
            <button type="button" onClick={() => deviationFileInputRef.current.click()} style={{
              display: "flex", alignItems: "center", gap: 6, background: "var(--surface-0)", border: "1px solid var(--border)",
              padding: "8px 12px", borderRadius: "var(--radius)", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)",
            }}>
              <Camera size={13} /> {deviationPhoto ? deviationPhoto.name : t("cleaner.attachPhoto")}
            </button>
            <button onClick={submitDeviation} style={{
              background: "var(--accent-orange)", color: "white",
              border: "none", padding: "8px 16px", borderRadius: "var(--radius)", fontSize: 13, cursor: "pointer",
            }}>
              {t("cleaner.sendDeviation")}
            </button>
          </div>
        </Card>
      )}

      <button onClick={complete} style={{
        marginTop: 16, width: "100%", background: "var(--text-success)", color: "white",
        border: "none", padding: "10px", borderRadius: "var(--radius)", fontSize: 14, cursor: "pointer",
      }}>
        {isRoomEnabled ? t("cleaner.finishVisit") : t("cleaner.finishJob")}
      </button>

      {showVaskeplan && (
        <div
          onClick={() => setShowVaskeplan(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 100,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--surface-1)", borderRadius: "var(--radius-lg)", padding: 20,
              maxWidth: 760, width: "100%", maxHeight: "85vh", overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{t("grid.titleForSite", { site: run.site.name })}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="month" value={vaskeplanMonth} onChange={(e) => setVaskeplanMonth(e.target.value)}
                  style={{
                    padding: "6px 8px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
                    background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 13,
                  }}
                />
                <button onClick={() => setShowVaskeplan(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
                  <X size={18} />
                </button>
              </div>
            </div>
            {!vaskeplanGrid && <div style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 12 }}>{t("common.loading")}</div>}
            {vaskeplanGrid && vaskeplanGrid.rooms.length > 0 && (
              <RoomGrid
                grid={vaskeplanGrid} month={vaskeplanMonth}
                onOpenRun={(date) => setOpenDate(date)}
              />
            )}
            {vaskeplanGrid && vaskeplanGrid.rooms.length === 0 && (
              <div style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 12 }}>{t("cleaner.noRoomsForSite")}</div>
            )}
          </div>
        </div>
      )}

      {openDate && (
        <RunDetailModal
          token={token} siteId={run.site.id} date={openDate}
          defaultInitials={initials} onClose={() => setOpenDate(null)} setError={setError}
        />
      )}
    </div>
  );
}

// One tappable alternative on a flervalg task. Sized for a gloved thumb on a phone, not a mouse —
// this is the control a cleaner uses dozens of times a shift, standing in a wet production hall.
function OptionChip({ option, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, minHeight: 38,
        padding: "8px 12px", borderRadius: "var(--radius-pill)", fontSize: 13, cursor: "pointer",
        border: option.selected ? "1px solid var(--accent-orange)" : "1px solid var(--border)",
        background: option.selected ? "var(--accent-orange-bg)" : "var(--surface-0)",
        color: option.selected ? "var(--accent-orange-dark)" : "var(--text-primary)",
        fontWeight: option.selected ? 600 : 400,
      }}
    >
      {option.selected
        ? <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
        : <Circle size={15} style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
      {option.label}
    </button>
  );
}

// A task inside the open room card. An ordinary task is a single tappable line, exactly as before;
// a flervalg task (one carrying options — e.g. which soap was used, see room_run_item_options on
// the backend) puts its alternatives underneath and is ticked by choosing one, since the choice
// IS the documentation the task exists for.
function RoomTaskRow({ item, hintVisible, onToggle, onToggleOption }) {
  const { t } = useI18n();
  const hasOptions = item.options?.length > 0;
  return (
    <div style={{ padding: "10px 0", borderTop: "1px solid var(--border)" }}>
      <div
        onClick={onToggle}
        style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
      >
        {item.done
          ? <CheckCircle2 size={18} style={{ color: "var(--text-success)", flexShrink: 0 }} />
          : <Circle size={18} style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
        <span style={{
          fontSize: 14, flex: 1,
          textDecoration: item.done ? "line-through" : "none",
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
      {hasOptions && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, marginLeft: 28 }}>
          {item.options.map((option) => (
            <OptionChip key={option.id} option={option} onClick={() => onToggleOption(option)} />
          ))}
        </div>
      )}
      {hasOptions && (hintVisible || !item.options.some((o) => o.selected)) && (
        <div style={{
          fontSize: 12, marginTop: 6, marginLeft: 28,
          color: hintVisible ? "var(--text-danger)" : "var(--text-secondary)",
        }}>
          {t("cleaner.chooseOptionHint")}
        </div>
      )}
    </div>
  );
}

// The room picker's row. Status lives in three places at once on purpose — the colored edge, the
// icon and the pill — because this list is read at a glance, one-handed, mid-round: the edge is
// what's visible while scrolling, the pill is what's read when you stop.
function RoomRow({ room, expanded, onOpen, muted }) {
  const { t, tn } = useI18n();
  const completed = room.status === "completed";
  const inProgress = room.status === "in_progress";
  const edgeColor = completed ? "var(--text-success)" : inProgress ? "var(--accent-orange)" : "var(--border)";
  // Longhand on purpose: mixing the `border` shorthand with `borderLeft` makes React warn (and
  // can drop the colored edge) when the row re-renders as it opens.
  const borderStyle = expanded ? "1px solid var(--accent-orange)" : "1px solid var(--border)";

  const subline = muted
    ? room.lastCleanedAt
      ? t("cleaner.lastCleaned", { date: room.lastCleanedAt.slice(0, 10) })
      : t("cleaner.neverCleaned")
    : completed && room.signedInitials
      ? t("cleaner.signedBy", { name: room.signedInitials })
      : tn("cleaner.taskCount", room.itemCount);

  return (
    <div
      onClick={onOpen}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 14px", borderRadius: "var(--radius)",
        borderTop: borderStyle, borderRight: borderStyle, borderBottom: borderStyle,
        borderLeft: `4px solid ${expanded ? "var(--accent-orange)" : edgeColor}`,
        marginBottom: 8, cursor: "pointer",
        opacity: muted && !expanded ? 0.8 : 1,
        background: expanded ? "var(--surface-0)" : "var(--surface-1)",
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: completed ? "var(--c-teal)" : "var(--surface-2)",
      }}>
        {completed
          ? <CheckCircle2 size={18} style={{ color: "var(--text-success)" }} />
          : <DoorOpen size={17} style={{ color: "var(--text-secondary)" }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 15, fontWeight: 600,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {room.name}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{subline}</div>
      </div>
      {!muted && !completed && (
        <span style={{
          fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: "var(--radius-pill)",
          whiteSpace: "nowrap", flexShrink: 0,
          background: "var(--accent-orange-bg)", color: "var(--accent-orange-dark)",
        }}>
          {t(`cleaner.roomStatus.${room.status}`)}
        </span>
      )}
      {expanded
        ? <ChevronDown size={18} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        : <ChevronRight size={18} style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
    </div>
  );
}
