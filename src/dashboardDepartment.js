// The department (avd. Vest/Øst/Midt/Sør) a manager wants the dashboard to open on. Kept in this
// browser, per user — it is a viewing preference, not something about the account, and a phone and
// an office PC may well want different ones.
const keyFor = (user) => `rentlogg_dashboard_department_${user?.id ?? "anon"}`;

// "" means "all departments".
export function readDefaultDepartment(user) {
  try {
    const raw = localStorage.getItem(keyFor(user));
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : "";
  } catch {
    return ""; // storage blocked (private window) — just open on everything
  }
}

export function writeDefaultDepartment(user, departmentId) {
  try {
    if (departmentId) localStorage.setItem(keyFor(user), String(departmentId));
    else localStorage.removeItem(keyFor(user));
  } catch {
    // nothing to do: the choice still applies for this visit, it just will not be remembered
  }
}
