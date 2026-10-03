// Small helpers shared by the Sjekklister surfaces (employee view, admin page, submission detail).
//
// The backend stores timestamps as SQLite UTC strings ("2026-10-03 06:12:44") and calendar days as
// Oslo dates ("2026-10-03"). Everything shown to a person is Oslo time, whatever the device says.

const OSLO = "Europe/Oslo";

export function parseUtc(sqliteDatetime) {
  if (!sqliteDatetime) return null;
  return new Date(`${String(sqliteDatetime).replace(" ", "T")}Z`);
}

export function fmtTime(sqliteDatetime, locale = "nb-NO") {
  const d = parseUtc(sqliteDatetime);
  return d ? d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: OSLO }) : "";
}

export function fmtDateTime(sqliteDatetime, locale = "nb-NO") {
  const d = parseUtc(sqliteDatetime);
  return d
    ? d.toLocaleString(locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: OSLO })
    : "";
}

// "2026-10-03" -> "03.10.2026". Pure string work on purpose: a calendar day has no time zone, and
// running it through Date would shift it a day for anyone west of UTC.
export function fmtDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

// Short weekday name for a Date#getDay() number (0 = Sunday — the convention the whole app uses).
// 2026-01-04 was a Sunday, so adding the weekday number lands on the right day.
export function weekdayShort(day, locale = "nb-NO") {
  return new Date(2026, 0, 4 + day).toLocaleDateString(locale, { weekday: "short" }).replace(".", "");
}

export function weekdayOfDate(dateStr) {
  return new Date(`${dateStr}T12:00:00`).getDay();
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function todayOslo() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: OSLO }).format(new Date());
}

// Monday first, the way a Norwegian week reads, while still storing getDay() numbers.
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const LOCALE_BY_LANGUAGE = { no: "nb-NO", en: "en-GB", lt: "lt-LT", lv: "lv-LV", ru: "ru-RU" };

export const STATUS_STYLE = {
  ok: { color: "var(--text-success)", bg: "var(--c-teal)" },
  deviation: { color: "var(--text-danger)", bg: "var(--c-red)" },
  na: { color: "var(--text-secondary)", bg: "var(--surface-0)" },
};
