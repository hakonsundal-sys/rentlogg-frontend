import { useEffect, useState } from "react";
import { apiFetch } from "./api";

const DB_NAME = "rentlogg-offline";
const STORE = "queue";

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

function isNetworkError(err) {
  return err instanceof TypeError;
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

function deleteEntry(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
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

export async function flushQueue() {
  if (flushing) return;
  flushing = true;
  try {
    const db = await openDb();
    const entries = await getAllEntries(db);
    for (const entry of entries) {
      try {
        await replayEntry(entry);
        await deleteEntry(db, entry.id);
        notify({ type: "success", tempId: entry.tempId });
      } catch (err) {
        if (isNetworkError(err)) {
          // Still offline (or the network dropped again mid-flush) — stop here and let the
          // next online event / poll pick up where we left off, rather than burning through
          // the rest of the queue against a connection that clearly isn't there.
          break;
        }
        // A real HTTP error (e.g. an expired token) can never succeed on blind retry —
        // drop it rather than queue forever, but surface it so the UI can tell her.
        await deleteEntry(db, entry.id);
        notify({ type: "failed", tempId: entry.tempId, error: err.message });
      }
    }
  } finally {
    flushing = false;
    notify({ type: "queue-changed" });
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => flushQueue());
  // Mobile browsers don't always fire `online` reliably on flaky (not fully down) connections,
  // so a cheap poll is the fallback that actually catches "back to spotty coverage" in practice.
  setInterval(() => {
    if (navigator.onLine) flushQueue();
  }, 20000);
}

// Drop-in replacement for apiFetch on mutating calls a cleaner might make mid-visit: on a real
// network failure (not an HTTP error response — apiFetch already turns those into a normal
// Error carrying the server's message) it queues the request and resolves instead of throwing,
// so the caller's existing optimistic local-state update is left standing rather than rolled
// back. Genuine HTTP errors (bad input, 403, etc.) still throw exactly as apiFetch already does.
export async function queueableFetch(path, options = {}) {
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

export function useQueueStatus() {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function refresh() {
      try {
        const db = await openDb();
        const entries = await getAllEntries(db);
        if (mounted) setPendingCount(entries.length);
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

  return { pendingCount, flushNow: flushQueue };
}
