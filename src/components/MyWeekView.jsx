import { useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { apiFetch } from "../api";
import { Card, Loading } from "./shared";
import { useI18n } from "../i18n";

// "Hvor skal jeg i morgen?" — the question a cleaner asks most often, and the one the app could
// already answer but never did: the weekly plan has been in site_schedules all along, readable only
// from the admin side.
//
// Deliberately a view and not a limit. Cleaners cover for each other and rotate between sites, so a
// site missing from her week is not one she may not enter — which is why anywhere she actually
// worked appears here too, marked as unplanned rather than hidden.

// "missing" means two different things depending on where in the week it sits: on Friday it is
// simply not done yet, on Monday it is a day that went by. Only the second one is a problem, so
// only the second one is red.
function statusStyle(status, isPast) {
  if (status === "completed") return { background: "var(--c-teal)", color: "var(--text-success)" };
  if (status === "in_progress") return { background: "var(--status-progress-bg)", color: "var(--status-progress-dark)" };
  if (isPast) return { background: "var(--bg-danger)", color: "var(--text-danger)" };
  return { background: "var(--surface-0)", color: "var(--text-secondary)" };
}

function shiftWeek(dateStr, weeks) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

export default function MyWeekView({ token }) {
  const { t } = useI18n();
  const [from, setFrom] = useState(null);
  const [week, setWeek] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setWeek(null);
    apiFetch(`/sites/my-week${from ? `?from=${from}` : ""}`, { token })
      .then(setWeek)
      .catch((err) => setError(err.message));
  }, [from, token]);

  if (error) return <div style={{ color: "var(--text-danger)", fontSize: 13 }}>{error}</div>;
  if (!week) return <Loading />;

  const weekdayName = (weekday) =>
    t(["week.sun", "week.mon", "week.tue", "week.wed", "week.thu", "week.fri", "week.sat"][weekday]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button onClick={() => setFrom(shiftWeek(week.from, -1))} style={navBtnStyle} aria-label={t("week.previous")}>
          <ChevronLeft size={18} />
        </button>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 600, justifyContent: "center" }}>
            <CalendarDays size={16} /> {t("week.title")}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{week.from} – {week.to}</div>
        </div>
        <button onClick={() => setFrom(shiftWeek(week.from, 1))} style={navBtnStyle} aria-label={t("week.next")}>
          <ChevronRight size={18} />
        </button>
      </div>

      {week.days.every((d) => d.sites.length === 0) && (
        <Card style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
          {t("week.emptyWeek")}
        </Card>
      )}

      {week.days.map((day) => {
        if (day.sites.length === 0 && !day.is_today) return null;
        // A day behind her that never got done is a real miss; the same state on Friday is just
        // the week not having happened yet.
        const isLate = day.is_past && !day.is_today;
        return (
          <Card
            key={day.date}
            style={{
              marginBottom: 8,
              // Today is the one row she is standing in; everything behind her is dimmed so the
              // week reads forwards at a glance.
              borderColor: day.is_today ? "var(--status-progress)" : "var(--border)",
              opacity: day.is_past && !day.is_today ? 0.6 : 1,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: day.sites.length ? 8 : 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {weekdayName(day.weekday)}
                {day.is_today && (
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "var(--status-progress-dark)" }}>
                    {t("week.today")}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{day.date.slice(8)}.{day.date.slice(5, 7)}.</div>
            </div>

            {day.sites.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{t("week.nothingPlanned")}</div>
            ) : (
              day.sites.map((site) => (
                <div
                  key={`${site.site_id}-${site.planned}`}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    gap: 8, padding: "6px 0", borderTop: "1px solid var(--border)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14 }}>{site.name}</div>
                    {site.address && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
                        <MapPin size={11} /> {site.address}
                      </div>
                    )}
                    {/* Somewhere she worked that her plan says nothing about — covering for
                        somebody, or a one-off. Saying so beats quietly leaving it out. */}
                    {!site.planned && (
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{t("week.notPlanned")}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {site.planned_minutes > 0 && (
                      <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                        {t("week.frame", { hours: `${Math.floor(site.planned_minutes / 60)}t ${String(site.planned_minutes % 60).padStart(2, "0")}m` })}
                      </span>
                    )}
                    <span style={{
                      padding: "2px 8px", borderRadius: "var(--radius-pill)", fontSize: 11, fontWeight: 600,
                      whiteSpace: "nowrap", ...statusStyle(site.status, isLate),
                    }}>
                      {t(site.status === "missing" && !isLate ? "week.status.upcoming" : `week.status.${site.status}`)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </Card>
        );
      })}

      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 10, lineHeight: 1.5 }}>
        {t("week.footnote")}
      </div>
    </div>
  );
}

const navBtnStyle = {
  background: "var(--surface-0)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
  padding: "6px 10px", cursor: "pointer", color: "var(--text-secondary)",
};
