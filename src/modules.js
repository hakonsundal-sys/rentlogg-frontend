// Mirrors the backend's src/modules.js registry — the keys of the add-on modules a company can
// have turned on. The list of enabled keys arrives on the logged-in user (login response and
// GET /auth/me) and is refreshed best-effort from GET /modules in App.jsx.
//
// This only decides what the UI renders. The real gate is requireModule() on the backend, so a
// stale or hand-edited copy here can't reach anything it shouldn't.
export const MODULE_TRAINING = "training";
export const MODULE_TIMECLOCK = "timeclock";
export const MODULE_HYGIENE = "hygiene";
// Egen modul fra 2026-10-09: prøvetaking selges uten kontakttid og måleoppgaver.
export const MODULE_SAMPLING = "sampling";
// Egen modul fra 2026-10-15: teamlederens signerte kontroll av utført arbeid. Taglinen
// «Dokumentert etterkontroll» står uansett — renholderen kontrollerer alltid sitt eget arbeid;
// det modulen legger til er at en annen person går over det etterpå.
export const MODULE_ETTERKONTROLL = "etterkontroll";

export function hasModule(user, key) {
  return Array.isArray(user?.modules) && user.modules.includes(key);
}

export const MODULE_CHECKLIST = "checklist";

// «Kun sjekkliste»: the company doesn't do cleaning at all, and gets the Sjekklister module in
// place of the cleaning surfaces (see the backend's isChecklistOnly). Like `modules`, it only
// decides what is rendered — every route behind it still checks the module itself.
export function isChecklistOnly(user) {
  return !!user?.checklist_only && hasModule(user, MODULE_CHECKLIST);
}
