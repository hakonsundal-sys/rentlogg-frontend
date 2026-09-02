const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export async function apiFetch(path, { token, ...options } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : null;

  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

async function downloadBlob(path, token, filename) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Kunne ikke laste ned filen");
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
    if (!res.ok) throw new Error("Kunne ikke åpne rapporten");
    const blob = await res.blob();
    if (!win) throw new Error("Nettleseren blokkerte den nye fanen. Tillat sprettoppvinduer og prøv igjen.");
    win.location = URL.createObjectURL(blob);
  } catch (err) {
    win?.close();
    throw err;
  }
}

export { API_URL };
