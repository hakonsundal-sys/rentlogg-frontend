import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { apiFetch } from "../../api";
import { Card, Loading } from "../shared";

const STATUS_LABEL = {
  completed: "Utført",
  missing: "Gjenstår",
  upcoming: "Kommer",
  not_applicable: "Ikke aktuell denne måneden",
};

function statusStyle(status) {
  if (status === "completed") return { background: "var(--c-teal)", color: "var(--text-success)" };
  if (status === "missing") return { background: "var(--bg-danger)", color: "var(--text-danger)" };
  if (status === "upcoming") return { background: "var(--surface-2)", color: "var(--text-secondary)" };
  return { background: "var(--surface-2)", color: "var(--text-muted)" };
}

function shiftMonth(yearMonth, delta) {
  const [y, m] = yearMonth.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(yearMonth) {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Intl.DateTimeFormat("nb-NO", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, 1)));
}

function currentYearMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date()).slice(0, 7);
}

// Overview of every room task on a monthly schedule for one site: due date this month, and
// whether (and when) it was actually completed — so a monthly task in an otherwise-daily room
// doesn't just quietly get missed with nothing to catch it.
export default function MonthlyItemsView({ token, site, onClose, setError }) {
  const [month, setMonth] = useState(currentYearMonth);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/sites/${site.id}/rooms/monthly-items?month=${month}`, { token })
      .then(setItems)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.id, month]);

  const grouped = items.reduce((acc, item) => {
    (acc[item.roomName] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface-1)", borderRadius: "var(--radius-lg)", padding: 20,
          maxWidth: 560, width: "100%", maxHeight: "85vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontWeight: 600, fontSize: 16 }}>Månedlige oppgaver — {site.name}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, margin: "12px 0 16px" }}>
          <button onClick={() => setMonth((m) => shiftMonth(m, -1))} style={{ background: "none", border: "1px solid var(--border)", borderRadius: "var(--radius)", cursor: "pointer", padding: 4 }}>
            <ChevronLeft size={16} />
          </button>
          <div style={{ fontSize: 14, fontWeight: 500, textTransform: "capitalize", minWidth: 140, textAlign: "center" }}>
            {monthLabel(month)}
          </div>
          <button onClick={() => setMonth((m) => shiftMonth(m, 1))} style={{ background: "none", border: "1px solid var(--border)", borderRadius: "var(--radius)", cursor: "pointer", padding: 4 }}>
            <ChevronRight size={16} />
          </button>
        </div>

        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <Card style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
            Ingen oppgaver med månedlig plan for denne lokasjonen.
          </Card>
        ) : (
          Object.entries(grouped).map(([roomName, roomItems]) => (
            <div key={roomName} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>{roomName}</div>
              {roomItems.map((item) => (
                <div
                  key={item.itemId}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                    padding: "8px 0", borderTop: "1px solid var(--border)", fontSize: 13,
                  }}
                >
                  <div>
                    <div>{item.label}</div>
                    {item.dueDate && (
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                        {item.status === "completed"
                          ? `Utført ${item.completedAt.slice(0, 10)}`
                          : `Forfaller ${item.dueDate}`}
                      </div>
                    )}
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: "var(--radius-pill)",
                    whiteSpace: "nowrap", ...statusStyle(item.status),
                  }}>
                    {STATUS_LABEL[item.status]}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
