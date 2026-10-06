// What the cleaner's view remembers across a forced reload, kept apart from CleanerView.jsx so that
// App.jsx can clear it at logout without importing the whole cleaner view (which is loaded on demand —
// see lazyRetry.js — and would otherwise end up in the first download for every role).

// Which site/room a cleaner is mid-checklist on — sessionStorage, not React state alone, because
// a phone's OS routinely discards this tab's whole JS state while the native camera is open (or
// the screen locks mid-upload) and reloads it fresh once control returns. Before this existed,
// that dropped a cleaner straight back to "Skann QR-kode" with no memory of which room they were
// in, mid-round — the actual photo usually survived fine (the offline queue is IndexedDB-backed),
// it was purely the navigation that got lost. Kept separate from App.jsx's auth persistence since
// this is CleanerView-specific state, not something every role needs. Cleared once a room/visit
// is genuinely finished so a stale entry doesn't reopen an old room next time.
const CONTEXT_STORAGE_KEY = "rentlogg_cleaner_context";

// Whether the plan is currently shown translated. Deliberately only the boolean — the translated
// text itself is never written anywhere, so a reload re-fetches it rather than resurrecting a
// stale copy. sessionStorage for the same reason the room context above uses it: a phone that
// discards this tab while the camera is open shouldn't quietly flip the plan back to Norwegian
// for a cleaner who can't read it.
const TRANSLATION_PREF_KEY = "rentlogg_cleaner_translate_plan";

export function translationPreferenceFromStorage() {
  try {
    return sessionStorage.getItem(TRANSLATION_PREF_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveTranslationPreference(on) {
  try {
    if (on) sessionStorage.setItem(TRANSLATION_PREF_KEY, "1");
    else sessionStorage.removeItem(TRANSLATION_PREF_KEY);
  } catch {
    // sessionStorage unavailable — the toggle still works, it just won't survive a reload.
  }
}

export function contextFromStorage() {
  try {
    const raw = sessionStorage.getItem(CONTEXT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveContext(value) {
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
  saveTranslationPreference(false);
}
