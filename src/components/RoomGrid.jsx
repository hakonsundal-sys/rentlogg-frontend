import { Card } from "./shared";

export const GRID_STATUS = {
  completed: { color: "var(--c-teal)", label: "Fullført" },
  in_progress: { color: "var(--accent-orange-bg)", label: "Pågår" },
  missing: { color: "var(--bg-danger)", label: "Ikke gjort" },
  not_due: { color: "var(--surface-2)", label: "Ikke planlagt" },
};

export function daysInMonth(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

const gridThStyle = { padding: "6px 4px", fontWeight: 500, fontSize: 11, color: "var(--text-secondary)" };

// Room x day grid ("vaskeplan"): at a glance, which rooms were actually done on which days
// this month — separate from the monthly summary table, which only carries one number per
// site+day, not the per-room breakdown this needs. Shared by the admin Rapporter page (where
// a cell opens that day's checklist for editing, via onOpenRun) and the read-only customer
// portal view (onOpenRun omitted — cells are then just informational, no click affordance).
export default function RoomGrid({ grid, month, siteName, onOpenRun }) {
  const days = Array.from({ length: daysInMonth(month) }, (_, i) => i + 1);
  const rooms = grid.rooms || [];
  const runsByDate = grid.runsByDate || {};

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
              {days.map((d) => (
                <th key={d} style={{ ...gridThStyle, textAlign: "center", minWidth: 22 }}>{d}</th>
              ))}
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
                </td>
                {days.map((d) => {
                  const dateStr = `${month}-${String(d).padStart(2, "0")}`;
                  const status = room.days[dateStr];
                  const info = GRID_STATUS[status];
                  const runId = runsByDate[dateStr];
                  const clickable = !!(onOpenRun && runId);
                  return (
                    <td key={d} style={{ textAlign: "center", padding: 2 }}>
                      <div
                        onClick={clickable ? () => onOpenRun(runId, room.id) : undefined}
                        title={
                          `${room.name} — ${dateStr}: ${info ? info.label : "Fremtidig"}` +
                          (clickable ? " (klikk for å åpne/redigere)" : "")
                        }
                        style={{
                          width: 14, height: 14, borderRadius: 3, margin: "0 auto",
                          background: info ? info.color : "transparent",
                          cursor: clickable ? "pointer" : "default",
                          outline: clickable ? "1px solid rgba(0,0,0,0.12)" : "none",
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
