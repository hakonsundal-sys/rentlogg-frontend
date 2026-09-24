import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, Pencil, FileText, Download, Camera } from "lucide-react";
import { apiFetch, downloadPdf, viewHtmlReport, API_URL } from "../api";
import { isNetworkError } from "../offlineQueue";
import { Card, ResponsibleBadge } from "./shared";
import RunRoomsAndItems from "./RunRoomsAndItems";
import { useI18n, useT } from "../i18n";

// /uploads is an authenticated route now — a plain <img src>/<a href> can't attach an
// Authorization header, so the token rides along as a query param instead.
function photoUrl(filePath, token) {
  const filename = filePath.split(/[\\/]/).pop();
  return `${API_URL}/uploads/${filename}?token=${encodeURIComponent(token)}`;
}

const REPLY_ACTIONS = ["resolve", "assign_manager", "assign_customer"];

export default function CleanerHistoryView({ token, user, initials: sharedInitials }) {
  const { t, tn } = useI18n();
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState("");
  const [expandedRunId, setExpandedRunId] = useState(null);
  const [runDetail, setRunDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [isEditingRun, setIsEditingRun] = useState(false);
  const [editInitials, setEditInitials] = useState("");

  useEffect(() => {
    apiFetch("/checklists/my-runs", { token }).then(setRuns).catch((err) => setError(err.message));
  }, [token]);

  async function toggleRun(runId) {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      setRunDetail(null);
      return;
    }
    setExpandedRunId(runId);
    setRunDetail(null);
    setIsEditingRun(false);
    setEditInitials(sharedInitials || user?.name || "");
    setLoadingDetail(true);
    try {
      const data = await apiFetch(`/checklists/runs/${runId}`, { token });
      setRunDetail(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function refreshRunDetail() {
    try {
      setRunDetail(await apiFetch(`/checklists/runs/${expandedRunId}`, { token }));
    } catch (err) {
      // A mutation just made via RunRoomsAndItems may have been queued offline rather than sent
      // — there's nothing new to fetch yet, so a network failure here isn't a real error to show.
      if (!isNetworkError(err)) setError(err.message);
    }
  }

  function onReplied(updatedDeviation) {
    setRunDetail((d) => ({
      ...d,
      deviations: d.deviations.map((dev) => (dev.id === updatedDeviation.id ? { ...dev, ...updatedDeviation } : dev)),
    }));
    setRuns((list) =>
      list.map((r) =>
        r.id === expandedRunId ? { ...r, needs_response_count: Math.max(0, (r.needs_response_count || 0) - 1) } : r
      )
    );
  }

  if (runs === null) return <div style={{ color: "var(--text-secondary)" }}>{t("common.loading")}</div>;

  return (
    <div>
      {error && <div style={{ color: "var(--text-danger)", fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {runs.length === 0 && (
        <Card style={{ textAlign: "center", color: "var(--text-secondary)" }}>{t("history.empty")}</Card>
      )}
      {runs.map((run) => (
        <Card key={run.id} style={{ marginBottom: 10, padding: 0, overflow: "hidden" }}>
          <div
            onClick={() => toggleRun(run.id)}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 14, cursor: "pointer" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {expandedRunId === run.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{run.site_name}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {run.started_at.slice(0, 16)} · {run.completed_at ? t("history.completed") : t("history.inProgress")}
                  {!!run.backdated && <span style={{ color: "var(--brand-dark)", fontWeight: 600 }}>{t("history.backdated")}</span>}
                </div>
              </div>
            </div>
            {run.deviation_count > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap",
                background: run.needs_response_count > 0 ? "var(--bg-danger)" : "var(--surface-0)",
                color: run.needs_response_count > 0 ? "var(--text-danger)" : "var(--text-secondary)",
              }}>
                {run.needs_response_count > 0
                  ? tn("history.toAnswer", run.needs_response_count)
                  : tn("history.deviationCount", run.deviation_count)}
              </span>
            )}
          </div>

          {expandedRunId === run.id && (
            <div style={{ borderTop: "1px solid var(--border)", padding: 14 }}>
              {loadingDetail && <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>{t("common.loading")}</div>}
              {runDetail && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{runDetail.rooms?.length > 0 ? t("history.rooms") : t("cleaner.checklist")}</div>
                    {!isEditingRun ? (
                      <button
                        onClick={() => setIsEditingRun(true)}
                        style={{
                          display: "flex", alignItems: "center", gap: 4, background: "none", border: "none",
                          color: "var(--brand-dark)", fontSize: 12, fontWeight: 500, cursor: "pointer",
                        }}
                      >
                        <Pencil size={12} /> {t("history.edit")}
                      </button>
                    ) : (
                      <button onClick={() => setIsEditingRun(false)} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: 12, cursor: "pointer" }}>
                        {t("history.done")}
                      </button>
                    )}
                  </div>
                  {isEditingRun && (
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
                  <RunRoomsAndItems
                    token={token} runDetail={runDetail} editable={isEditingRun} editInitials={editInitials}
                    onChanged={refreshRunDetail} setError={setError}
                  />

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                    <button
                      onClick={() => viewHtmlReport(`/reports/runs/${run.id}/html`, token).catch((err) => setError(err.message))}
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        background: "var(--surface-0)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
                        padding: "7px 11px", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)",
                      }}
                    >
                      <FileText size={13} /> {t("history.viewReport")}
                    </button>
                    <button
                      onClick={() => downloadPdf(`/reports/runs/${run.id}/pdf`, token, `rapport-besok-${run.id}.pdf`).catch((err) => setError(err.message))}
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        background: "var(--surface-0)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
                        padding: "7px 11px", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)",
                      }}
                    >
                      <Download size={13} /> {t("history.downloadPdf")}
                    </button>
                  </div>

                  {runDetail.deviations?.length > 0 && (
                    <>
                      <div style={{ fontWeight: 600, fontSize: 13, marginTop: 16, marginBottom: 6, color: "var(--text-danger)" }}>{t("history.deviations")}</div>
                      {runDetail.deviations.map((dev) => (
                        <DeviationRow key={dev.id} token={token} deviation={dev} sharedInitials={sharedInitials} onReplied={onReplied} setError={setError} />
                      ))}
                    </>
                  )}
                  {(!runDetail.deviations || runDetail.deviations.length === 0) && (
                    <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 16 }}>{t("history.noDeviations")}</div>
                  )}
                </>
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

const PRIORITY_COLOR = { low: "var(--text-secondary)", medium: "var(--brand-dark)", high: "var(--text-danger)" };

function DeviationRow({ token, deviation, sharedInitials, onReplied, setError }) {
  const t = useT();
  const [replyText, setReplyText] = useState("");
  const [replyInitials, setReplyInitials] = useState(sharedInitials || "");
  const [replyPhoto, setReplyPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const replyFileInputRef = useRef(null);

  async function reply(action) {
    if (!replyText.trim()) {
      setError(t("history.replyRequired"));
      return;
    }
    if (!replyInitials.trim()) {
      setError(t("history.nameRequiredReply"));
      return;
    }
    setSubmitting(true);
    try {
      const updated = await apiFetch(`/deviations/${deviation.id}/reply`, {
        token, method: "PATCH",
        body: JSON.stringify({ reply_text: replyText.trim(), initials: replyInitials.trim(), action }),
      });
      onReplied(updated);
      // A separate call, same as the initial "meld avvik" flow — a photo can't be attached in
      // the same request as the text reply. If this leg fails the reply itself has already
      // gone through, so surface the photo error on its own rather than looking like the
      // whole reply failed.
      if (replyPhoto) {
        const form = new FormData();
        form.append("photo", replyPhoto);
        try {
          const photo = await apiFetch(`/deviations/${deviation.id}/photos`, { token, method: "POST", body: form });
          onReplied({ id: deviation.id, photos: [...(deviation.photos || []), photo] });
        } catch (err) {
          setError(t("history.replySentPhotoFailed", { error: err.message }));
        }
        setReplyPhoto(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: "10px 0", borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <AlertTriangle size={14} style={{ color: "var(--text-danger)", marginTop: 2, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          {deviation.room_name && (
            <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
              {deviation.room_name}{deviation.room_task_label ? ` · ${deviation.room_task_label}` : ""}
              <ResponsibleBadge responsible={deviation.room_responsible} />
            </div>
          )}
          <div style={{ fontSize: 13 }}>{deviation.description}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
            {deviation.reported_by_initials && (
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{t("deviation.reportedBy", { name: deviation.reported_by_initials })}</div>
            )}
            {deviation.priority && (
              <span style={{ fontSize: 11, fontWeight: 600, color: PRIORITY_COLOR[deviation.priority] }}>
                {t(`priority.${deviation.priority}`)}
              </span>
            )}
          </div>
          {deviation.photos?.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {deviation.photos.map((p) => (
                <a key={p.id} href={photoUrl(p.file_path, token)} target="_blank" rel="noreferrer">
                  <img src={photoUrl(p.file_path, token)} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: "var(--radius-sm)" }} />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {deviation.reply_text ? (
        <div style={{ marginTop: 8, marginLeft: 22, fontSize: 12, color: "var(--text-secondary)" }}>
          <div>{t("deviation.replyLine", { text: deviation.reply_text, by: deviation.replied_by_initials })}</div>
          <div style={{ marginTop: 2 }}>
            {deviation.status === "resolved"
              ? t("history.closed")
              : deviation.assigned_to
                ? t(`history.assigned.${deviation.assigned_to}`)
                : ""}
          </div>
          {deviation.status === "resolved" && (
            <div style={{ marginTop: 2, color: deviation.customer_approved_at ? "var(--text-success)" : "var(--text-secondary)" }}>
              {deviation.customer_approved_at
                ? t("deviation.approvedByCustomer", { name: deviation.customer_approved_by_initials })
                : t("deviation.awaitingCustomerApproval")}
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 8, marginLeft: 22 }}>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={t("history.replyPlaceholder")}
            style={{
              width: "100%", minHeight: 50, padding: 8, borderRadius: "var(--radius)",
              border: "1px solid var(--border)", background: "var(--surface-2)",
              color: "var(--text-primary)", fontSize: 13, resize: "vertical", boxSizing: "border-box",
            }}
          />
          <input
            value={replyInitials} onChange={(e) => setReplyInitials(e.target.value)}
            placeholder={t("deviation.fullNamePlaceholder")} maxLength={60}
            style={{
              marginTop: 6, padding: "5px 8px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
              background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 13, width: 160,
            }}
          />
          <input
            ref={replyFileInputRef} type="file" accept="image/*"
            onChange={(e) => setReplyPhoto(e.target.files[0] || null)} style={{ display: "none" }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <button
              type="button" disabled={submitting} onClick={() => replyFileInputRef.current.click()}
              style={{
                display: "flex", alignItems: "center", gap: 6, background: "var(--surface-0)", border: "1px solid var(--border)",
                padding: "6px 12px", borderRadius: "var(--radius)", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)",
              }}
            >
              <Camera size={13} /> {replyPhoto ? replyPhoto.name : t("cleaner.attachPhoto")}
            </button>
            {REPLY_ACTIONS.map((action) => (
              <button
                key={action} disabled={submitting} onClick={() => reply(action)}
                style={{
                  background: action === "resolve" ? "var(--text-success)" : "var(--surface-0)",
                  color: action === "resolve" ? "white" : "var(--text-secondary)",
                  border: action === "resolve" ? "none" : "1px solid var(--border)",
                  padding: "6px 12px", borderRadius: "var(--radius)", fontSize: 12, cursor: "pointer",
                }}
              >
                {t(`history.action.${action}`)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
