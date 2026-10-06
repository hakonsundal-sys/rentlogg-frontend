// Sjekk det, offline: a local copy of what the employee is filling in, so neither a dead signal nor
// a phone throwing the tab away (camera open, screen locked) loses a half-filled checklist.
//
// IndexedDB rather than localStorage because a draft carries photos: File/Blob objects survive
// IndexedDB's structured clone, and would have to be base64'd (several MB each) into localStorage.
// A separate database from offlineQueue.js on purpose — that one is a FIFO of requests to replay,
// this is state the screen restores from.
//
// Two kinds of record, keyed by string:
//   "local:<userId>:<listId>"  — a list started with no connection; lives only here until it is
//                                 submitted as one request (POST /:id/submit-complete).
//   "srv:<userId>:<submissionId>" — the last known state of a server draft, used only if reopening
//                                 it fails for lack of network.
// Plus "today:<userId>": the cached list overview with items, to start lists from offline.

const DB_NAME = "rentlogg-sjekkdet";
const STORE = "drafts";

let dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req?.result);
        tx.onerror = () => reject(tx.error);
      })
  );
}

// Every call is best-effort: with IndexedDB unavailable (private browsing) the screen still works,
// it just can't survive a reload.
export async function saveDraft(key, value) {
  try { await run("readwrite", (s) => s.put(value, key)); } catch { /* ignore */ }
}

export async function loadDraft(key) {
  try { return (await run("readonly", (s) => s.get(key))) ?? null; } catch { return null; }
}

export async function deleteDraft(key) {
  try { await run("readwrite", (s) => s.delete(key)); } catch { /* ignore */ }
}

// Everything this user has stored — the start page lists local drafts as "Fortsett".
export async function listDrafts(prefix) {
  try {
    const keys = await run("readonly", (s) => s.getAllKeys());
    const out = [];
    for (const k of keys || []) if (String(k).startsWith(prefix)) out.push({ key: k, value: await loadDraft(k) });
    return out;
  } catch {
    return [];
  }
}

// Logging out on a shared work phone must not leave the previous person's drafts behind.
export async function clearAllDrafts() {
  try { await run("readwrite", (s) => s.clear()); } catch { /* ignore */ }
}

export const keys = {
  today: (userId) => `today:${userId}`,
  local: (userId, listId) => `local:${userId}:${listId}`,
  localPrefix: (userId) => `local:${userId}:`,
  server: (userId, submissionId) => `srv:${userId}:${submissionId}`,
};

// The same verdict the server makes (services/rooms.js measurementVerdict), used only to show the
// result while offline. The server recomputes it when the fill arrives — this is a preview.
export function localVerdict(answer, value) {
  const has = (v) => v !== null && v !== undefined;
  if (!has(value)) return null;
  if (has(answer.measure_min) && value < answer.measure_min) return "deviation";
  if (has(answer.measure_max) && value > answer.measure_max) return "deviation";
  return "ok";
}

export function parseNumber(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

export function newClientKey() {
  const rand = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `sc-${rand}`;
}
