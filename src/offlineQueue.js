import { useEffect, useState } from "react";
import { apiFetch, onTokenSeen } from "./api";

const DB_NAME = "rentlogg-offline";
const STORE = "queue";

// How many times a request may be answered with a server error (5xx) before it is given up on. The
// poll runs every 20 s, so this is about ten minutes — comfortably longer than a deploy or a restart
// of the API, short enough that one request the server can never process does not hold up everything
// queued behind it for ever.
const MAX_SERVER_ERROR_ATTEMPTS = 30;

let dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// Exported so callers that need the response body right away (and so can't just hand the call
// to queueableFetch) can still show the same friendly "no connection" message instead of a raw
// TypeError, e.g. CleanerView's check-in and open-room calls. A request that timed out is raised as
// a TypeError too (see api.js).
export function isNetworkError(err) {
  return err instanceof TypeError;
}

// What the failure of a replayed request means for the entry waiting in the queue:
//   "retry"  — nothing is wrong with the request itself: no network, a server that is down or
//              restarting (502/503/504 during a deploy), a rate limit (429) or a timeout (408/425).
//              The entry stays and goes again later. Deleting it here, as every non-network error
//              used to be, threw away a cleaner's finished checklist because the server was
//              restarting at the moment the signal came back.
//   "auth"   — the login token is no longer accepted (it expired, or the password was changed). The
//              work is still hers: it stays until she logs in again and the entry is re-attached to
//              her new token.
//   "drop"   — the server looked at the request and refused it (validation, permission, already
//              done). Retrying can never succeed.
export function classifyFailure(err) {
  if (isNetworkError(err)) return "retry";
  const status = err?.status;
  if (status === 401) return "auth";
  if (status === 408 || status === 425 || status === 429 || status >= 500) return "retry";
  return "drop";
}

// autoIncrement keys sort in insertion order, which is what getAll() returns — that's what
// gives us FIFO replay (a "fullfør rom" queued after an item toggle must not replay first).
function getAllEntries(db) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Counting does not read the entries. getAll() loaded every queued record — photo files included —
// into memory just to learn a number, on every queue event and every poll.
function countEntries(db) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function deleteEntry(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function putEntry(db, entry) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function enqueue({ url, method, token, body }) {
  const db = await openDb();
  let bodyKind = "none";
  let bodyPayload = null;
  if (body instanceof FormData) {
    bodyKind = "form";
    bodyPayload = Array.from(body.entries()); // File objects survive IndexedDB's structured clone
  } else if (typeof body === "string") {
    bodyKind = "json";
    bodyPayload = body;
  }
  const tempId = `q-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const entry = { url, method: method || "GET", token, bodyKind, bodyPayload, tempId, queuedAt: Date.now() };
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(entry);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  return tempId;
}

function replayEntry(entry) {
  let body;
  if (entry.bodyKind === "form") {
    body = new FormData();
    entry.bodyPayload.forEach(([k, v]) => body.append(k, v));
  } else if (entry.bodyKind === "json") {
    body = entry.bodyPayload;
    // The moment it really happened, not the moment it reached the server. The routes that keep an
    // audit trail (completions, measurements, sign-offs) accept an `occurred_at` for exactly this;
    // without it a visit finished at 22:00 in a cellar was recorded at 07:00 the next morning, and
    // never marked as having been queued. The server ignores a value that is future or over a week
    // old, so a phone with a wrong clock cannot misfile work.
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.occurred_at === undefined && entry.queuedAt) {
        body = JSON.stringify({ ...parsed, occurred_at: new Date(entry.queuedAt).toISOString() });
      }
    } catch {
      // Not JSON we can read — sent as it was queued.
    }
  }
  return apiFetch(entry.url, { token: entry.token, method: entry.method, body });
}

const listeners = new Set();
function notify(event) {
  listeners.forEach((fn) => fn(event));
}

// Subscribe to queue lifecycle events: { type: "queue-changed" } on any add/remove, or
// { type: "success", tempId } / { type: "failed", tempId, error } for a specific replayed
// entry — the latter is what lets a pending-photo preview know exactly when to swap itself
// out for the server-confirmed photo.
export function subscribeQueue(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

let flushing = false;
// Set when the head of the queue was refused for its login token. Flushing again would only repeat
// the same refusal every twenty seconds, so it waits until a token that works has been seen.
let authBlocked = false;
// Whose login token last worked in this tab. A refused entry that belongs to somebody ELSE (work a
// previous person left on a shared phone, under a token that has since expired) is stepped over and
// left where it is for them; only the current person's own refused work stops the queue.
let activeUserId = null;

async function flushOnce() {
  if (flushing || authBlocked) return;
  flushing = true;
  try {
    const db = await openDb();
    const skipped = new Set();
    // Loops while there is progress, so work queued while the flush was running is not left waiting
    // for the next poll.
    for (let pass = 0; pass < 20; pass++) {
      const entries = (await getAllEntries(db)).filter((e) => !skipped.has(e.id));
      if (entries.length === 0) break;
      let progressed = false;
      let stopped = false;
      for (const entry of entries) {
        try {
          await replayEntry(entry);
          await deleteEntry(db, entry.id);
          notify({ type: "success", tempId: entry.tempId });
          progressed = true;
        } catch (err) {
          const verdict = classifyFailure(err);
          if (verdict === "retry") {
            // Still offline, or the server is busy or restarting — stop here and let the next
            // online event / poll pick up where we left off, rather than burning through the rest of
            // the queue against a connection that clearly isn't there. Order matters: nothing behind
            // this entry may go first.
            if (!isNetworkError(err)) {
              const attempts = (entry.attempts || 0) + 1;
              if (attempts >= MAX_SERVER_ERROR_ATTEMPTS) {
                await deleteEntry(db, entry.id);
                notify({ type: "failed", tempId: entry.tempId, error: err.message });
                progressed = true;
                continue;
              }
              await putEntry(db, { ...entry, attempts });
            }
            stopped = true;
            break;
          }
          if (verdict === "auth") {
            if (activeUserId != null && userIdOfToken(entry.token) !== activeUserId) {
              skipped.add(entry.id);
              continue;
            }
            authBlocked = true;
            stopped = true;
            break;
          }
          // The server refused this request for good (bad input, 403, already done): retrying can
          // never succeed — drop it rather than queue forever, but surface it so the UI can tell her.
          await deleteEntry(db, entry.id);
          notify({ type: "failed", tempId: entry.tempId, error: err.message });
          progressed = true;
        }
      }
      if (stopped || !progressed) break;
    }
  } finally {
    flushing = false;
    notify({ type: "queue-changed" });
  }
}

// One flush at a time across EVERY tab, not just this one: the QR-to-browser flow opens a new tab
// per scan, so several tabs share one IndexedDB queue and each ran its own 20-second poll. Two of
// them replaying the same entry at once sent a photo or a deviation twice. Web Locks is available in
// every browser this app targets; where it is not, the per-tab guard above is all there is.
export async function flushQueue() {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request("rentlogg-queue-flush", { ifAvailable: true }, (lock) => (lock ? flushOnce() : undefined));
  }
  return flushOnce();
}

// The payload of a login token, to compare WHO two tokens belong to without trusting either (the
// server is what verifies them). Null for anything that does not look like a token.
function userIdOfToken(token) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload)).id ?? null;
  } catch {
    return null;
  }
}

// She logged in again (the old token expired, or the password changed) and work she did before that
// is still waiting under the old token, which can no longer authenticate. Re-attaches it to the new
// one — but only entries that were made by the SAME person: on a phone shared between cleaners, one
// person's unsent checklist must never be filed under the next person's login.
export async function rebindQueueToken(newToken) {
  const userId = userIdOfToken(newToken);
  if (userId == null) return;
  try {
    const db = await openDb();
    const entries = await getAllEntries(db);
    for (const entry of entries) {
      if (entry.token !== newToken && userIdOfToken(entry.token) === userId) {
        await putEntry(db, { ...entry, token: newToken });
      }
    }
  } catch {
    // IndexedDB unavailable — there is no queue to re-attach.
  }
  authBlocked = false;
  flushQueue();
}

if (typeof window !== "undefined") {
  onTokenSeen((token) => {
    activeUserId = userIdOfToken(token);
    rebindQueueToken(token);
  });
  window.addEventListener("online", () => flushQueue());
  // Mobile browsers don't always fire `online` reliably on flaky (not fully down) connections,
  // so a cheap poll is the fallback that actually catches "back to spotty coverage" in practice.
  setInterval(() => {
    if (navigator.onLine) flushQueue();
  }, 20000);
}

async function hasPending() {
  try {
    const db = await openDb();
    return (await countEntries(db)) > 0;
  } catch {
    return false; // IndexedDB unavailable — nothing can be waiting
  }
}

// Drop-in replacement for apiFetch on mutating calls a cleaner might make mid-visit: on a real
// network failure (not an HTTP error response — apiFetch already turns those into a normal
// Error carrying the server's message) it queues the request and resolves instead of throwing,
// so the caller's existing optimistic local-state update is left standing rather than rolled
// back. Genuine HTTP errors (bad input, 403, etc.) still throw exactly as apiFetch already does.
//
// While anything older is still waiting, a new request goes to the back of the same line instead of
// being sent straight away. Sent immediately, an untick made after the signal came back overtook the
// tick still in the queue, which then replayed after it: the screen said "not done", the server said
// "done".
export async function queueableFetch(path, options = {}) {
  if (await hasPending()) {
    const tempId = await enqueue({ url: path, method: options.method, token: options.token, body: options.body });
    notify({ type: "queue-changed" });
    flushQueue();
    return { queued: true, tempId };
  }
  try {
    return await apiFetch(path, options);
  } catch (err) {
    if (isNetworkError(err)) {
      const tempId = await enqueue({ url: path, method: options.method, token: options.token, body: options.body });
      notify({ type: "queue-changed" });
      return { queued: true, tempId };
    }
    throw err;
  }
}

// Each queued entry carries the login token it was made under (a replay has to authenticate), so a
// non-empty queue is the one place a token outlives a logout. The count lets the logout flow ask
// before throwing unsent work away, and clearQueue removes the entries — and the tokens — once the
// person has agreed.
export async function pendingCount() {
  try {
    const db = await openDb();
    return await countEntries(db);
  } catch {
    return 0; // IndexedDB unavailable — nothing was queued either
  }
}

export async function clearQueue() {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    notify({ type: "queue-changed" });
  } catch {
    // Nothing to clear if the store can't be opened.
  }
}

export function useQueueStatus() {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function refresh() {
      try {
        const db = await openDb();
        const n = await countEntries(db);
        if (mounted) setPending(n);
      } catch {
        // IndexedDB unavailable (private browsing etc.) — fail quiet, banner just stays hidden.
      }
    }
    refresh();
    const unsubscribe = subscribeQueue(refresh);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return { pendingCount: pending, flushNow: flushQueue };
}
