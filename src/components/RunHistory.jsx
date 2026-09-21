import { useState } from "react";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { useI18n } from "../i18n";

// One visit's timeline: when it was checked into, when each room was opened, finished, approved,
// when photos and avvik landed. Built entirely from timestamps the app already stores (see the
// backend's runHistory.js), so it works on old visits too — the trade-off being that it can't
// show individual task ticks or anything but the most recent edit of a given thing.
//
// Collapsed by default: this is the "what actually happened here" answer you go looking for when
// something is disputed, not something to read on every open.

// The timestamps arrive as UTC ISO strings; everything this app shows a person is Oslo time.
function formatTimestamp(iso, language) {
  return new Intl.DateTimeFormat(language === "no" ? "nb" : language, {
    timeZone: "Europe/Oslo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function RunHistory({ events }) {
  const { t, language } = useI18n();
  const [open, setOpen] = useState(false);

  if (!events?.length) return null;

  return (
    <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left",
          background: "none", border: "none", padding: 0, cursor: "pointer",
          fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
        }}
      >
        {open ? <ChevronDown size={14} style={{ color: "var(--text-muted)" }} /> : <ChevronRight size={14} style={{ color: "var(--text-muted)" }} />}
        <History size={13} style={{ color: "var(--text-secondary)" }} />
        {t("history.timeline.title")}
        <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>({events.length})</span>
      </button>

      {open && (
        <div style={{ marginTop: 10, marginLeft: 6, paddingLeft: 12, borderLeft: "2px solid var(--border)" }}>
          {events.map((event, i) => (
            <div key={i} style={{ position: "relative", padding: "6px 0", fontSize: 12 }}>
              <div style={{
                position: "absolute", left: -17, top: 11, width: 6, height: 6, borderRadius: "50%",
                background: "var(--text-muted)",
              }} />
              <div style={{ color: "var(--text-muted)", fontSize: 11 }}>{formatTimestamp(event.at, language)}</div>
              <div style={{ color: "var(--text-primary)" }}>
                {t(`history.event.${event.type}`)}
                {event.room && <span style={{ color: "var(--text-secondary)" }}> · {event.room}</span>}
                {event.actor && <span style={{ color: "var(--text-secondary)" }}> · {event.actor}</span>}
              </div>
              {event.detail && (
                <div style={{ color: "var(--text-secondary)", fontSize: 11, marginTop: 1 }}>{event.detail}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
