import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { apiFetch } from "../api";

export const ASSIGNED_LABEL = { manager: "sendt til driftsleder", customer: "sendt til deg" };

// Shared between CustomerView (per-site list) and SiteHistoryView (per-site timeline) — one
// deviation's full read-only thread plus the customer's "Godkjenn utbedring" signature action.
export function DeviationItem({ token, user, deviation: d, onApproved, setError }) {
  const [approveInitials, setApproveInitials] = useState(user?.name || "");
  const [approving, setApproving] = useState(false);
  // Only the customer role can call PATCH /deviations/:id/approve — admin/manager viewing the
  // same timeline get a read-only "venter på kundegodkjenning" line instead (see below).
  const needsApproval = user?.role === "customer" && d.status === "resolved" && !d.customer_approved_at;

  async function approve() {
    if (!approveInitials.trim()) {
      setError("Skriv inn navnet ditt for å godkjenne.");
      return;
    }
    setApproving(true);
    try {
      const updated = await apiFetch(`/deviations/${d.id}/approve`, {
        token, method: "PATCH", body: JSON.stringify({ initials: approveInitials.trim() }),
      });
      onApproved(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setApproving(false);
    }
  }

  return (
    <div style={{ fontSize: 13, padding: "6px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-danger)" }}>
        <AlertTriangle size={14} /> {d.description} ({d.priority})
      </div>
      {(d.room_name || d.room_task_label) && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginLeft: 20 }}>
          {d.room_name}{d.room_task_label ? ` · ${d.room_task_label}` : ""}
        </div>
      )}
      {d.reported_by_initials && (
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginLeft: 20 }}>Meldt av: {d.reported_by_initials}</div>
      )}
      {d.reply_text && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginLeft: 20, marginTop: 4 }}>
          Svar: {d.reply_text} — {d.replied_by_initials}
          {d.assigned_to && ` (${ASSIGNED_LABEL[d.assigned_to] || d.assigned_to})`}
        </div>
      )}
      {user?.role !== "customer" && d.status === "resolved" && (
        <div style={{ fontSize: 12, color: d.customer_approved_at ? "var(--text-success)" : "var(--text-secondary)", marginLeft: 20, marginTop: 4 }}>
          {d.customer_approved_at
            ? `Godkjent av kunde (${d.customer_approved_by_initials})`
            : "Venter på kundegodkjenning"}
        </div>
      )}
      {needsApproval && (
        <div style={{ marginLeft: 20, marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--text-success)", display: "flex", alignItems: "center", gap: 4 }}>
            <CheckCircle2 size={13} /> Merket som utbedret
          </span>
          <input
            value={approveInitials} onChange={(e) => setApproveInitials(e.target.value)}
            placeholder="Fullt navn" maxLength={60}
            style={{
              padding: "5px 8px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
              background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 12, width: 140,
            }}
          />
          <button onClick={approve} disabled={approving} style={{
            background: "var(--text-success)", color: "white", border: "none",
            padding: "6px 12px", borderRadius: "var(--radius)", fontSize: 12, cursor: "pointer",
          }}>
            Godkjenn utbedring
          </button>
        </div>
      )}
    </div>
  );
}
