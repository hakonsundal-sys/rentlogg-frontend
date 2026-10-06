import { translateApiError } from "./i18n";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

// A request that has had no answer for this long is treated like a lost connection. Without a limit, a
// half-open socket (a phone that is "online" but the signal is gone) left a call pending for minutes:
// the spinner never ended, and the offline queue's flush — which waits on each request — stopped
// working until the page was reloaded. Uploads get far longer: a 5 MB photo on a weak signal is slow,
// not dead.
const DEFAULT_TIMEOUT_MS = 30000;
const UPLOAD_TIMEOUT_MS = 120000;

// Who else wants to know that a login token just worked: the offline queue, which re-attaches its
// waiting work to a fresh token after the person has logged in again (see offlineQueue.js).
const tokenSeenListeners = new Set();
let lastSeenToken = null;
export function onTokenSeen(callback) {
  tokenSeenListeners.add(callback);
  return () => tokenSeenListeners.delete(callback);
}

export async function apiFetch(path, { token, timeoutMs, ...options } = {}) {
  const controller = new AbortController();
  const limit = timeoutMs ?? (options.body instanceof FormData ? UPLOAD_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
  const timer = options.signal ? null : setTimeout(() => controller.abort(), limit);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: options.signal || controller.signal,
      headers: {
        ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    const contentType = res.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await res.json() : null;

    if (!res.ok) {
      // The server no longer honours this login token — expired, or ended on purpose (the account was
      // deactivated, the password changed). Say which token, so App only reacts when it was the one
      // the person is actually using: an old token replayed from the offline queue must not log out
      // whoever has since signed in.
      if (res.status === 401 && token && data?.code === "invalid_token") {
        window.dispatchEvent(new CustomEvent("rentlogg:session-ended", { detail: { token } }));
      }
      const err = new Error(translateApiError(data?.code, data?.error) || `Request failed (${res.status})`);
      err.code = data?.code;
      err.status = res.status;
      throw err;
    }
    if (token && token !== lastSeenToken) {
      lastSeenToken = token;
      tokenSeenListeners.forEach((fn) => fn(token));
    }
    return data;
  } catch (err) {
    // The rest of the app tells "no connection" from "the server said no" by `err instanceof
    // TypeError` (that is what fetch throws when the network fails). A timeout is the same thing
    // from her side, so it is raised as the same kind of error.
    if (err?.name === "AbortError") throw new TypeError("Request timed out");
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function downloadBlob(path, token, filename) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(translateApiError("download_failed"));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadPdf(path, token, filename) {
  return downloadBlob(path, token, filename);
}

export function downloadCsv(path, token, filename) {
  return downloadBlob(path, token, filename);
}

export function downloadZip(path, token, filename) {
  return downloadBlob(path, token, filename);
}

// Opens a protected HTML report in a new tab. A plain <a href> can't carry the Bearer token a
// protected route needs, so this fetches it the same authenticated way every other download
// does, then opens the blob instead of forcing a save — the report is meant to be read/copied
// as an email body, not just downloaded. The tab is opened synchronously (before the `await`)
// so it stays tied to the click's user gesture — opening it only after the fetch resolves gets
// silently blocked as a popup by most browsers.
export async function viewHtmlReport(path, token) {
  const win = window.open("", "_blank");
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(translateApiError("report_open_failed"));
    const blob = await res.blob();
    if (!win) throw new Error(translateApiError("popup_blocked"));
    win.location = URL.createObjectURL(blob);
  } catch (err) {
    win?.close();
    throw err;
  }
}

export { API_URL };
