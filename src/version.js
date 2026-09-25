// What version of itself this bundle is, and how to find out whether a newer one has been
// deployed since. See the versionManifest plugin in vite.config.js for the other half.

// Replaced literally at build time by vite's `define`. Guarded with typeof rather than read bare:
// an identifier that define didn't substitute is a ReferenceError at module load, and this module
// is imported by the login screen — the one screen that has to render when everything else is
// broken.
export const BUILD_TIME = typeof __BUILD_TIME__ === "string" ? __BUILD_TIME__ : null;
export const BUILD_COMMIT = typeof __BUILD_COMMIT__ === "string" ? __BUILD_COMMIT__ : null;

// Resolves to the currently deployed build, or to null when that can't be established — under
// `vite dev` (the file isn't emitted), offline, or any other failure. Null means "no information",
// never "up to date": claiming a stale tab is current is the one wrong answer here.
export async function fetchDeployedBuild() {
  try {
    // no-store and a cache-buster, because the whole situation this exists for is caching having
    // gone wrong. A fresh URL is the part that cannot be served from a cache by anything.
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.buildTime === "string" ? data : null;
  } catch {
    return null;
  }
}

// True only when we positively know both sides and they differ.
export function isStale(deployed) {
  return Boolean(BUILD_TIME && deployed?.buildTime && deployed.buildTime !== BUILD_TIME);
}

// Reloads onto a URL the browser has never seen, so the cached index.html — and with it the
// <script> tag pointing at the old hashed bundle — cannot be reused. A plain reload revalidates
// and is usually enough; this is for when it isn't.
//
// Existing parameters are preserved: someone who scanned a QR code is sitting on /?checkin=TOKEN,
// and dropping that would send her back to the login screen having lost the check-in she came for.
export function reloadLatest() {
  const url = new URL(window.location.href);
  url.searchParams.set("v", Date.now().toString(36));
  window.location.replace(url.toString());
}
