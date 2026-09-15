import { ExternalLink } from "lucide-react";
import { Card } from "./shared";

export const GRID_STATUS = {
  completed: { color: "var(--c-teal)", label: "Fullført" },
  in_progress: { color: "var(--accent-orange-bg)", label: "Pågår" },
  missing: { color: "var(--bg-danger)", label: "Ikke gjort" },
  not_due: { color: "var(--surface-2)", label: "Ikke planlagt" },
};

// 0=søndag..6=lørdag, same convention as schedule.js/rooms.js's weekday handling.
const WEEKDAY_ABBR = ["Sø", "Ma", "Ti", "On", "To", "Fr", "Lø"];

export function daysInMonth(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function weekdayAbbr(dateStr) {
  return WEEKDAY_ABBR[new Date(`${dateStr}T00:00:00`).getDay()];
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
  const days = Array.from({ length: daysInMonth(month) }, (_, i) => i + 1);
  const rooms = grid.rooms || [];
  const today = todayInOslo();

  return (
    <Card style={{ marginTop: 20, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>
        Vaskeplan{siteName ? ` — ${siteName}` : ""}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...gridThStyle, position: "sticky", left: 0, background: "var(--surface-0)", textAlign: "left", minWidth: 170 }}>
                Rom
              </th>
              {days.map((d) => {
                const dateStr = `${month}-${String(d).padStart(2, "0")}`;
                const openable = !!onOpenRun && dateStr <= today;
                return (
                  <th key={d} style={{ ...gridThStyle, textAlign: "center", minWidth: 22 }}>
                    <div style={{ color: "var(--text-muted)", fontSize: 9 }}>{weekdayAbbr(dateStr)}</div>
                    <div>{d}</div>
                    {openable && (
                      <button
                        onClick={() => onOpenRun(dateStr)}
                        title={`Åpne sjekkliste for ${dateStr}`}
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
                    <span style={{
                      marginLeft: 6, fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 999,
                      background: room.responsible === "customer" ? "var(--accent-orange-bg)" : "var(--surface-2)",
                      color: room.responsible === "customer" ? "var(--accent-orange-dark)" : "var(--text-muted)",
                    }}>
                      {room.responsible === "customer" ? "Dere" : "Renholder"}
                    </span>
                  )}
                </td>
                {days.map((d) => {
                  const dateStr = `${month}-${String(d).padStart(2, "0")}`;
                  const status = room.days[dateStr];
                  const info = GRID_STATUS[status];
                  return (
                    <td key={d} style={{ textAlign: "center", padding: 2 }}>
                      <div
                        title={`${room.name} — ${dateStr}: ${info ? info.label : "Fremtidig"}`}
                        style={{
                          width: 14, height: 14, borderRadius: 3, margin: "0 auto",
                          background: info ? info.color : "transparent",
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
            {info.label}
          </div>
        ))}
      </div>
    </Card>
  );
}
