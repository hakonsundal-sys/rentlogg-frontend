import { lazy } from "react";

// React.lazy for the screens that are only needed by one kind of user (the admin pages, the customer
// view, the cleaner's view), so that a cleaner's phone no longer downloads the administration code and
// the other way round.
//
// Two things go wrong with a split bundle that a single file never had, and both are handled here:
//
//  - A weak signal. The first screen needs one more request than before. A failed request is tried
//    again twice, a little later, before giving up.
//  - A deploy. Chunk file names carry a hash, so a tab opened before a deploy asks for a file the
//    server no longer has. That is not a network problem, and retrying cannot fix it: the page is
//    reloaded once, which fetches the current index and with it the current names. The reload happens
//    only when the device is online (offline there is nothing to reload into) and only once until a
//    chunk has loaded successfully, so a server that is really down cannot put the page in a loop.
//
// If both fail, the error is thrown and the surrounding ErrorBoundary shows its card, whose "Last inn
// på nytt" button reloads the page. (Its "Prøv igjen" cannot help: React keeps a rejected lazy
// component rejected for good, which is why the retry lives here and not in the boundary.)
const RELOADED_KEY = "rentlogg_chunk_reload";
const RETRY_DELAYS_MS = [1200, 3000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadWithRetry(factory) {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const module = await factory();
      try {
        sessionStorage.removeItem(RELOADED_KEY);
      } catch {
        // sessionStorage unavailable — the reload guard just stays as it was.
      }
      return module;
    } catch (err) {
      lastError = err;
      if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  try {
    if (navigator.onLine !== false && !sessionStorage.getItem(RELOADED_KEY)) {
      sessionStorage.setItem(RELOADED_KEY, "1");
      window.location.reload();
      return new Promise(() => {}); // the page is going away; keep the fallback showing meanwhile
    }
  } catch {
    // sessionStorage unavailable — fall through to the error.
  }
  throw lastError;
}

export function lazyRetry(factory) {
  return lazy(() => loadWithRetry(factory));
}
