import { useEffect, useState } from "react";
import { MessageSquareQuote } from "lucide-react";
import { apiFetch } from "../api";
import { Card } from "./shared";
import { useI18n } from "../i18n";

// What the last person who was here wrote down, shown the moment she checks in.
//
// Cleaners cover for each other constantly, so the person arriving is often not the person who was
// here last — and everything worth knowing about a building's quirks ("fryseren må tas sist", "bakdøra
// klemmer") has been sitting in checklist_runs.note for months without ever being shown to the next
// one through the door.
//
// Renders nothing when there is nothing to pass on: an empty card on the screen she opens every
// morning is worse than no card.
export default function PreviousVisitCard({ token, siteId }) {
  const { t, tn } = useI18n();
  const [visit, setVisit] = useState(null);

  useEffect(() => {
    if (!siteId) return;
    setVisit(null);
    apiFetch(`/sites/${siteId}/previous-visit`, { token })
      .then(setVisit)
      // Silent: this sits above the checklist she came here to fill in, and a dead signal should
      // not put an error on top of her actual work.
      .catch(() => {});
  }, [siteId, token]);

  if (!visit) return null;

  return (
    <Card style={{ marginBottom: 16, borderLeft: "3px solid var(--status-progress)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
        <MessageSquareQuote size={14} />
        {visit.days_ago === 0
          ? t("previousVisit.titleToday")
          : tn("previousVisit.title", visit.days_ago, { by: visit.by || t("previousVisit.someone") })}
      </div>

      {visit.note && (
        <div style={{ fontSize: 14, lineHeight: 1.5 }}>{visit.note}</div>
      )}

      {visit.rooms.length > 0 && (
        <div style={{ marginTop: visit.note ? 10 : 0 }}>
          {visit.rooms.map((room, i) => (
            <div key={`${room.room_name}-${i}`} style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
              <span style={{ color: "var(--text-secondary)" }}>{room.room_name}:</span> {room.note}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
