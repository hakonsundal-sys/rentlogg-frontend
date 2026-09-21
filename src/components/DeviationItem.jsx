import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { apiFetch, API_URL } from "../api";
import { ResponsibleBadge } from "./shared";
import { useT } from "../i18n";

// /uploads is an authenticated route — a plain <img src>/<a href> can't attach an Authorization
// header, so the token rides along as a query param instead.
function photoUrl(filePath, token) {
  const filename = filePath.split(/[\\/]/).pop();
  return `${API_URL}/uploads/${filename}?token=${encodeURIComponent(token)}`;
}

// Shared between CustomerView (per-site list) and SiteHistoryView (per-site timeline) — one
// deviation's full read-only thread plus the customer's "Godkjenn utbedring" signature action.
export function DeviationItem({ token, user, deviation: d, onApproved, setError }) {
  const t = useT();
  const [approveInitials, setApproveInitials] = useState(user?.name || "");
  const [approving, setApproving] = useState(false);
  // Only the customer role can call PATCH /deviations/:id/approve — admin/manager viewing the
  // same timeline get a read-only "venter på kundegodkjenning" line instead (see below).
  const needsApproval = user?.role === "customer" && d.status === "resolved" && !d.customer_approved_at;

  async function approve() {
    if (!approveInitials.trim()) {
      setError(t("deviation.nameRequiredToApprove"));
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
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginLeft: 20, display: "flex", alignItems: "center", gap: 6 }}>
          {d.room_name}{d.room_task_label ? ` · ${d.room_task_label}` : ""}
          {d.room_name && <ResponsibleBadge responsible={d.room_responsible} perspective="customer" />}
        </div>
      )}
      {d.reported_by_initials && (
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginLeft: 20 }}>
          {t("deviation.reportedBy", { name: d.reported_by_initials })}
        </div>
      )}
      {d.photos?.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: 20, marginTop: 6 }}>
          {d.photos.map((p) => (
            <a key={p.id} href={photoUrl(p.file_path, token)} target="_blank" rel="noreferrer">
              <img src={photoUrl(p.file_path, token)} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: "var(--radius-sm)" }} />
            </a>
          ))}
        </div>
      )}
      {d.reply_text && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginLeft: 20, marginTop: 4 }}>
          {t("deviation.replyLine", { text: d.reply_text, by: d.replied_by_initials })}
          {d.assigned_to && ` (${t(`deviation.assignedTo.${d.assigned_to}`)})`}
        </div>
      )}
      {user?.role !== "customer" && d.status === "resolved" && (
        <div style={{ fontSize: 12, color: d.customer_approved_at ? "var(--text-success)" : "var(--text-secondary)", marginLeft: 20, marginTop: 4 }}>
          {d.customer_approved_at
            ? t("deviation.approvedByCustomer", { name: d.customer_approved_by_initials })
            : t("deviation.awaitingCustomerApproval")}
        </div>
      )}
      {needsApproval && (
        <div style={{ marginLeft: 20, marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--text-success)", display: "flex", alignItems: "center", gap: 4 }}>
            <CheckCircle2 size={13} /> {t("deviation.markedResolved")}
          </span>
          <input
            value={approveInitials} onChange={(e) => setApproveInitials(e.target.value)}
            placeholder={t("deviation.fullNamePlaceholder")} maxLength={60}
            style={{
              padding: "5px 8px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
              background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 12, width: 140,
            }}
          />
          <button onClick={approve} disabled={approving} style={{
            background: "var(--text-success)", color: "white", border: "none",
            padding: "6px 12px", borderRadius: "var(--radius)", fontSize: 12, cursor: "pointer",
          }}>
            {t("deviation.approveFix")}
          </button>
        </div>
      )}
    </div>
  );
}
