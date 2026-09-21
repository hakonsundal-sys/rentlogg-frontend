import { useEffect, useRef, useState } from "react";
import { X, Pencil, FileText, Download, ClipboardCheck, TriangleAlert } from "lucide-react";
import { apiFetch, downloadPdf, viewHtmlReport, API_URL } from "../api";
import { isNetworkError } from "../offlineQueue";
import RunRoomsAndItems from "./RunRoomsAndItems";
import { useT } from "../i18n";

// /uploads is now an authenticated route (it used to be served with no auth at all, which let
// anyone who knew or guessed a filename read across tenants) — a plain <img src> or <a href>
// can't attach an Authorization header the way apiFetch's fetch() calls can, so the token rides
// along as a query param instead, which the backend accepts as a fallback for this route only.
function photoUrl(filePath, token) {
  const filename = filePath.split(/[\\/]/).pop();
  return `${API_URL}/uploads/${filename}?token=${encodeURIComponent(token)}`;
}

// One day's checklist for one site, viewable and (behind a "Rediger" toggle) editable — the
// piece a vaskeplan grid day-column button links to, wherever that grid shows up (admin
// Rapporter, a cleaner's own view, and — read-only — the customer portal). Shared instead of
// copied so all three keep behaving identically as this evolves. Fetches by site+date rather
// than a run id, since a room-based site's day can have real room data even when no site-level
// checklist_runs row was ever created for it — the backend falls back to synthesizing the same
// shape from whatever room_runs actually exist (runDetail.id comes back null in that case, which
// just hides the PDF/report buttons below, since there's no real run to generate those from).
// `userRole` (passed as "customer" by the customer portal) hides the "Rediger" toggle unless the
// day has at least one room the customer owns (`responsible === "customer"`) — a customer with
// no such rooms on this site gets no edit affordance at all, not just a hidden one. When the
// toggle is shown, RunRoomsAndItems still only lets a customer touch their own rooms, never OKV's.
// `onReportDeviation`, when given, adds a "Meld avvik" button to every room regardless of edit
// mode (used by the customer portal; admin/cleaner don't pass it). `autoEdit` starts the modal
// already in edit mode — used by the customer portal's "Fyll ut sjekkliste i dag" shortcut, so a
// customer arriving specifically to do that doesn't need a second click to find the toggle.
export default function RunDetailModal({ token, siteId, date, defaultInitials, userRole, autoEdit, onReportDeviation, onClose, setError }) {
  const t = useT();
  const [runDetail, setRunDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(!!autoEdit);
  const [editInitials, setEditInitials] = useState(defaultInitials || "");

  const hasCustomerEditableRooms = runDetail?.rooms?.some((r) => r.responsible === "customer");
  // A customer with nothing of their own to edit, but a room awaiting their approval, still needs
  // the "Rediger" toggle — RunRoomsAndItems' own canApproveThisRoom check handles which room(s)
  // actually get approval controls once this opens the view.
  const hasRoomsAwaitingMyApproval = runDetail?.rooms?.some((r) => r.requires_approval && r.ready_for_approval_at && !r.completed_at);
  const canToggleEdit = userRole !== "customer" || hasCustomerEditableRooms || hasRoomsAwaitingMyApproval;
  // The bulk-complete button always acts on today (see POST /sites/:id/rooms/complete-all-due —
  // it has no date param, it's always "today's due rooms"), so only show/count it when this
  // modal is actually showing today — otherwise a customer looking back at a past day could
  // click it and be confused when it silently completes today's rooms instead of the ones on
  // screen.
  const isToday = date === new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date());
  const ownRoomsRemaining = userRole === "customer" && isToday
    ? runDetail?.rooms?.filter((r) => r.responsible === "customer" && r.due && !r.completed_at).length ?? 0
    : 0;

  useEffect(() => {
    setLoading(true);
    apiFetch(`/checklists/site/${siteId}/date/${date}`, { token })
      .then(setRunDetail)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, siteId, date]);

  // The "Fyll ut sjekkliste i dag" shortcut opens straight into edit mode, but a customer's own
  // rooms can sit anywhere in a mixed site's room list (OKV's rooms usually come first, since
  // they were imported first) — jump straight to the first one instead of leaving them to scroll
  // past however many read-only rooms come before it. Guarded to fire only once per modal session
  // (hasAutoScrolledRef) — runDetail gets a new object on every refresh (checking an item off,
  // approving a room, ...), and without the guard this re-ran on every single one of those,
  // yanking the view back down to the first "Dere" room mid-approval instead of letting someone
  // work through the list room by room (2026-09-21).
  const hasAutoScrolledRef = useRef(false);
  useEffect(() => {
    if (!autoEdit || !runDetail?.rooms || hasAutoScrolledRef.current) return;
    hasAutoScrolledRef.current = true;
    const firstOwnRoom = runDetail.rooms.find((r) => r.responsible === "customer");
    if (firstOwnRoom) {
      setTimeout(() => document.getElementById(`room-${firstOwnRoom.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runDetail]);

  async function refresh() {
    try {
      setRunDetail(await apiFetch(`/checklists/site/${siteId}/date/${date}`, { token }));
    } catch (err) {
      // A mutation just made via RunRoomsAndItems may have been queued offline rather than sent
      // — there's nothing new to fetch yet, so a network failure here isn't a real error to show.
      if (!isNetworkError(err)) setError(err.message);
    }
  }

  // Customer counterpart to the cleaner's own "Huk av alle dagens oppgaver" — completes and
  // signs every one of the customer's own rooms that's due today in one tap, same endpoint the
  // cleaner uses (POST /sites/:id/rooms/complete-all-due), which scopes itself to the caller's
  // own side (customer vs. company) so this can never touch OKV's rooms.
  async function bulkCompleteAllOwnRooms() {
    if (!editInitials?.trim()) {
      setError(t("cleaner.nameRequiredTasks"));
      return;
    }
    try {
      await apiFetch(`/sites/${siteId}/rooms/complete-all-due`, {
        token, method: "POST", body: JSON.stringify({ initials: editInitials.trim() }),
      });
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  // Turns this day's "no check-in happened" view into a real, reportable visit — backdated to
  // this exact date (see POST /checklists/site/:siteId/date/:date), never to today, with
  // `backdated` staying set so the report/log this unlocks keeps saying it was entered late
  // rather than quietly passing as a same-day check-in.
  async function checkInLate() {
    try {
      setRunDetail(await apiFetch(`/checklists/site/${siteId}/date/${date}`, { token, method: "POST" }));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex",
        alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "var(--surface-1)", borderRadius: "var(--radius-lg)", padding: 24,
        maxWidth: 480, width: "100%", maxHeight: "85vh", overflowY: "auto",
      }}>
        {loading && <div style={{ color: "var(--text-secondary)" }}>{t("common.loading")}</div>}
        {runDetail && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{runDetail.site_name}</div>
                {runDetail.site_address && <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{runDetail.site_address}</div>}
              </div>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
                <X size={18} />
              </button>
            </div>

            {runDetail.backdated && (
              <div style={{
                display: "flex", alignItems: "center", gap: 6, marginTop: 10, padding: "6px 10px",
                borderRadius: "var(--radius)", background: "var(--accent-orange-bg)", color: "var(--accent-orange-dark)", fontSize: 12,
              }}>
                <TriangleAlert size={13} /> {t("runDetail.backdated")}
              </div>
            )}

            <div style={{ marginTop: 12, fontSize: 13, color: "var(--text-secondary)", display: "grid", gap: 4 }}>
              {runDetail.id ? (
                <>
                  <div>{t("runDetail.cleaner")}<strong style={{ color: "var(--text-primary)" }}>{runDetail.cleaner_name}</strong></div>
                  <div>{t("runDetail.started", { date: runDetail.started_at.slice(0, 16) })}</div>
                  {runDetail.completed_at && <div>{t("runDetail.completed", { date: runDetail.completed_at.slice(0, 16) })}</div>}
                  {runDetail.signed_initials && (
                    <div>{t("runDetail.signed")}<strong style={{ color: "var(--text-primary)" }}>{runDetail.signed_initials}</strong></div>
                  )}
                </>
              ) : (
                <div>
                  <div>{t("runDetail.noCheckin", { date })}</div>
                  {isEditing && userRole !== "customer" && (
                    <button
                      onClick={checkInLate}
                      style={{
                        display: "flex", alignItems: "center", gap: 6, marginTop: 8,
                        background: "var(--surface-0)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
                        padding: "6px 10px", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)",
                      }}
                    >
                      <ClipboardCheck size={13} /> {t("runDetail.checkInLate")}
                    </button>
                  )}
                </div>
              )}
            </div>

            {runDetail.id && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                <button
                  onClick={() => viewHtmlReport(`/reports/runs/${runDetail.id}/html`, token).catch((err) => setError(err.message))}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "var(--surface-0)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
                    padding: "8px 12px", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)",
                  }}
                >
                  <FileText size={14} /> {t("history.viewReport")}
                </button>
                <button
                  onClick={() => downloadPdf(`/reports/runs/${runDetail.id}/pdf`, token, `rapport-besok-${runDetail.id}.pdf`).catch((err) => setError(err.message))}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "var(--surface-0)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
                    padding: "8px 12px", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)",
                  }}
                >
                  <Download size={14} /> {t("history.downloadPdf")}
                </button>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{runDetail.rooms?.length > 0 ? t("history.rooms") : t("cleaner.checklist")}</div>
              {canToggleEdit && (!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  style={{
                    display: "flex", alignItems: "center", gap: 4, background: "none", border: "none",
                    color: "var(--accent-orange-dark)", fontSize: 12, fontWeight: 500, cursor: "pointer",
                  }}
                >
                  <Pencil size={12} /> {t("history.edit")}
                </button>
              ) : (
                <button onClick={() => setIsEditing(false)} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: 12, cursor: "pointer" }}>
                  {t("history.done")}
                </button>
              ))}
            </div>
            {isEditing && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t("cleaner.signatureLabel")}</label>
                <input
                  value={editInitials} onChange={(e) => setEditInitials(e.target.value)}
                  placeholder={t("deviation.fullNamePlaceholder")} maxLength={60}
                  style={{
                    padding: "4px 8px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
                    background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 12, width: 150,
                  }}
                />
              </div>
            )}
            {isEditing && ownRoomsRemaining > 0 && (
              <button
                onClick={bulkCompleteAllOwnRooms}
                style={{
                  width: "100%", background: "var(--accent-orange)", color: "white", border: "none",
                  padding: "10px", borderRadius: "var(--radius)", fontSize: 13, fontWeight: 600,
                  cursor: "pointer", marginBottom: 10,
                }}
              >
                {t("runDetail.completeAllOwn", { count: ownRoomsRemaining })}
              </button>
            )}
            <RunRoomsAndItems
              token={token} runDetail={runDetail} editable={isEditing} editInitials={editInitials}
              onChanged={refresh} setError={setError} onReportDeviation={onReportDeviation} userRole={userRole}
            />

            {runDetail.photos.length > 0 && runDetail.rooms?.length > 0 && (
              <>
                <div style={{ marginTop: 16, fontWeight: 600, fontSize: 13 }}>{t("runDetail.photos")}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  {runDetail.photos.map((p) => (
                    <a key={p.id} href={photoUrl(p.file_path, token)} target="_blank" rel="noreferrer">
                      <img src={photoUrl(p.file_path, token)} alt="" style={{ width: 70, height: 70, objectFit: "cover", borderRadius: "var(--radius-sm)" }} />
                    </a>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
