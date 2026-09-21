import { ExternalLink } from "lucide-react";
import { Card, ResponsibleBadge } from "./shared";
import { useT } from "../i18n";

// Colors only — the labels moved into the locale files, keyed "grid.status.<key>".
export const GRID_STATUS = {
  completed: { color: "var(--c-teal)" },
  in_progress: { color: "var(--accent-orange-bg)" },
  missing: { color: "var(--bg-danger)" },
  not_due: { color: "var(--surface-2)" },
};

export function daysInMonth(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

// 0=søndag..6=lørdag, same convention as schedule.js/rooms.js's weekday handling — the index is
// what getDay() returns, so the locale files' "weekday.short.N" keys follow that numbering too and
// not the Monday-first order a Norwegian calendar is printed in.
function weekdayAbbr(dateStr, t) {
  return t(`weekday.short.${new Date(`${dateStr}T00:00:00`).getDay()}`);
}

function todayInOslo() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date());
}

const gridThStyle = { padding: "6px 4px", fontWeight: 500, fontSize: 11, color: "var(--text-secondary)" };

// Room x day grid ("vaskeplan"): at a glance, which rooms were actually done on which days
// this month — separate from the monthly summary table, which only carries one number per
// site+day, not the per-room breakdown this needs. Shared by the admin Rapporter page and a
// cleaner's own view (both pass onOpenRun — every day column up to today gets an "open" button
// that jumps straight to that day's checklist, real or not — the backend synthesizes a view from
// whatever room data actually exists even when no site-level check-in happened that day) and the
// read-only customer portal view (onOpenRun omitted — no open affordance at all, purely
// informational). Every day this grid renders is already <= today (the backend never returns a
// future day), so there's no need to separately gate on whether a run happens to exist yet.
export default function RoomGrid({ grid, month, siteName, onOpenRun, userRole }) {
  const t = useT();
  const days = Array.from({ length: daysInMonth(month) }, (_, i) => i + 1);
  const rooms = grid.rooms || [];
  const today = todayInOslo();

  return (
    <Card style={{ marginTop: 20, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>
        {siteName ? t("grid.titleForSite", { site: siteName }) : t("grid.title")}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...gridThStyle, position: "sticky", left: 0, background: "var(--surface-0)", textAlign: "left", minWidth: 170 }}>
                {t("grid.room")}
              </th>
              {days.map((d) => {
                const dateStr = `${month}-${String(d).padStart(2, "0")}`;
                const openable = !!onOpenRun && dateStr <= today;
                const isToday = dateStr === today;
                return (
                  <th key={d} style={{
                    ...gridThStyle, textAlign: "center", minWidth: 22,
                    background: isToday ? "var(--accent-orange-bg)" : undefined,
                    borderRadius: isToday ? "var(--radius-sm) var(--radius-sm) 0 0" : undefined,
                  }}>
                    <div style={{ color: isToday ? "var(--accent-orange-dark)" : "var(--text-muted)", fontSize: 9, fontWeight: isToday ? 700 : 400 }}>
                      {weekdayAbbr(dateStr, t)}
                    </div>
                    <div style={{ color: isToday ? "var(--accent-orange-dark)" : undefined, fontWeight: isToday ? 700 : undefined }}>{d}</div>
                    {openable && (
                      <button
                        onClick={() => onOpenRun(dateStr)}
                        title={t("grid.openChecklist", { date: dateStr })}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center", margin: "2px auto 0",
                          background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--accent-orange-dark)",
                        }}
                      >
                        <ExternalLink size={10} />
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{
                  padding: "4px 8px", position: "sticky", left: 0, background: "var(--surface-1)",
                  whiteSpace: "nowrap", borderRight: "1px solid var(--border)",
                }}>
                  {room.name}
                  {userRole === "customer" && (
                    <span style={{ marginLeft: 6, display: "inline-block" }}>
                      <ResponsibleBadge responsible={room.responsible} perspective="customer" />
                    </span>
                  )}
                </td>
                {days.map((d) => {
                  const dateStr = `${month}-${String(d).padStart(2, "0")}`;
                  const status = room.days[dateStr];
                  const info = GRID_STATUS[status];
                  const isToday = dateStr === today;
                  return (
                    <td key={d} style={{ textAlign: "center", padding: 2, background: isToday ? "var(--accent-orange-bg)" : undefined }}>
                      <div
                        title={t("grid.cell", {
                          room: room.name,
                          date: dateStr,
                          status: info ? t(`grid.status.${status}`) : t("grid.status.future"),
                        })}
                        style={{
                          width: 16, height: 16, borderRadius: 4, margin: "0 auto",
                          background: info ? info.color : "transparent",
                          border: info ? "1px solid rgba(0,0,0,0.08)" : "1px dashed var(--border)",
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", padding: "10px 16px", borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--text-secondary)" }}>
        {Object.entries(GRID_STATUS).map(([key, info]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: info.color }} />
            {t(`grid.status.${key}`)}
          </div>
        ))}
      </div>
    </Card>
  );
}
