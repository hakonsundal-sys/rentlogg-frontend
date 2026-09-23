// Mirrors the backend's src/modules.js registry — the keys of the add-on modules a company can
// have turned on. The list of enabled keys arrives on the logged-in user (login response and
// GET /auth/me) and is refreshed best-effort from GET /modules in App.jsx.
//
// This only decides what the UI renders. The real gate is requireModule() on the backend, so a
// stale or hand-edited copy here can't reach anything it shouldn't.
export const MODULE_TRAINING = "training";
export const MODULE_TIMECLOCK = "timeclock";

export function hasModule(user, key) {
  return Array.isArray(user?.modules) && user.modules.includes(key);
}
