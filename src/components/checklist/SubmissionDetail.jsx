import { useEffect, useState } from "react";
import { ArrowLeft, Download, Trash2 } from "lucide-react";
import { apiFetch, downloadPdf } from "../../api";
import { Card, Loading, uploadUrl } from "../shared";
import { useI18n } from "../../i18n";
import { fmtDate, fmtDateTime, fmtNumber, fmtRange, LOCALE_BY_LANGUAGE, STATUS_STYLE } from "./format";

// One submitted checklist, read-only. Shared by the employee's Logg tab and the admin's Logg —
// the same record must never read differently depending on who opened it. `onDelete` is only
// passed by the admin page (the backend only lets an admin delete a submitted checklist anyway).
export default function SubmissionDetail({ token, submissionId, onBack, onDelete, canFollowUp = false, onChanged }) {
  const { t, language } = useI18n();
  const locale = LOCALE_BY_LANGUAGE[language] || "nb-NO";
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setDetail(null);
    apiFetch(`/simple-checklists/submissions/${submissionId}`, { token })
      .then(setDetail)
      .catch((err) => setError(err.message));
  }, [submissionId, token]);

  async function saveFollowUp(answer, action) {
    setError("");
    try {
      const updated = await apiFetch(`/simple-checklists/submissions/${submissionId}/answers/${answer.id}/followup`, {
        token, method: "POST", body: JSON.stringify({ action }),
      });
      setDetail(updated);
      onChanged?.();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  async function downloadReport() {
    setError("");
    try {
      await downloadPdf(
        `/simple-checklists/submissions/${submissionId}/pdf`,
        token,
        `sjekkliste-${detail.work_date}-${submissionId}.pdf`
      );
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <button onClick={onBack} style={backBtnStyle}>
        <ArrowLeft size={15} /> {t("sc.back")}
      </button>
      {error && <div style={{ color: "var(--text-danger)", margin: "8px 0" }}>{error}</div>}
      {!detail && !error && <Loading />}
      {detail && (
        <Card>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{detail.checklist_name}</div>
              {detail.description && (
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{detail.description}</div>
              )}
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.6 }}>
                {fmtDate(detail.work_date)} · {t("sc.by")} <strong style={{ color: "var(--text-primary)" }}>{detail.user_name}</strong>
                <br />
                {detail.completed_offline
                  ? t("sc.offline.received", { filled: fmtDateTime(detail.client_completed_at, locale), received: fmtDateTime(detail.submitted_at, locale) })
                  : `${t("sc.submitted")} ${fmtDateTime(detail.submitted_at, locale)}`}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={downloadReport} style={outlineBtnStyle}>
                <Download size={14} /> {t("sc.downloadPdf")}
              </button>
              {onDelete && (
                <button onClick={() => onDelete(detail)} style={{ ...outlineBtnStyle, color: "var(--text-danger)" }} title="Slett">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>

          <div style={{ marginTop: 16, borderTop: "1px solid var(--border)" }}>
            {detail.answers.map((a, i) => {
              const photos = detail.photos.filter((p) => p.answer_id === a.id);
              return (
                <div key={a.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14 }}>{i + 1}. {a.label}</div>
                      {a.help_text && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{a.help_text}</div>}
                      {a.measure_unit && a.measured_value !== null && a.measured_value !== undefined && (
                        <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4, color: a.status === "deviation" ? "var(--text-danger)" : "var(--text-primary)" }}>
                          {fmtNumber(a.measured_value)} {a.measure_unit}
                          {fmtRange(a, t) && (
                            <span style={{ fontWeight: 400, color: "var(--text-secondary)", fontSize: 12 }}> · {t("sc.measure.limit", { range: fmtRange(a, t) })}</span>
                          )}
                        </div>
                      )}
                      {a.comment && (
                        <div style={{
                          fontSize: 13, marginTop: 6, fontStyle: "italic",
                          color: a.status === "deviation" ? "var(--text-danger)" : "var(--text-primary)",
                        }}>
                          {a.comment}
                        </div>
                      )}
                    </div>
                    <StatusPill status={a.status} />
                  </div>
                  {photos.length > 0 && <PhotoStrip photos={photos} token={token} />}
                  {a.status === "deviation" && (
                    <FollowUp
                      answer={a}
                      locale={locale}
                      canFollowUp={canFollowUp}
                      onSave={(action) => saveFollowUp(a, action)}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {detail.note && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>{t("sc.note")}</div>
              <div style={{ fontSize: 14, marginTop: 4, whiteSpace: "pre-wrap" }}>{detail.note}</div>
            </div>
          )}
          {detail.photos.some((p) => !p.answer_id) && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>{t("sc.photos")}</div>
              <PhotoStrip photos={detail.photos.filter((p) => !p.answer_id)} token={token} />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// What was done about a deviation. Written once by a leader and then locked — the backend refuses a
// second follow-up, so the form only shows while there is none.
export function FollowUp({ answer, locale, canFollowUp, onSave }) {
  const { t } = useI18n();
  const [action, setAction] = useState("");
  const [saving, setSaving] = useState(false);

  if (answer.followup_at) {
    return (
      <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: "var(--radius)", background: "var(--c-teal)", fontSize: 13 }}>
        <div style={{ fontWeight: 600, color: "var(--text-success)" }}>
          {t("sc.followup.done", { name: answer.followup_by_name, when: fmtDateTime(answer.followup_at, locale) })}
        </div>
        <div style={{ marginTop: 2, whiteSpace: "pre-wrap" }}>{answer.followup_action}</div>
      </div>
    );
  }
  if (!canFollowUp) {
    return <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: "var(--text-warning)" }}>{t("sc.followup.open")}</div>;
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!action.trim()) return;
        setSaving(true);
        if (await onSave(action)) setAction("");
        setSaving(false);
      }}
      style={{ marginTop: 8, padding: 10, borderRadius: "var(--radius)", background: "var(--c-amber)" }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-warning)", marginBottom: 6 }}>{t("sc.followup.open")}</div>
      <textarea
        value={action}
        onChange={(e) => setAction(e.target.value)}
        placeholder={t("sc.followup.placeholder")}
        rows={2}
        style={{
          width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: "var(--radius)",
          border: "1px solid var(--border)", background: "var(--surface-1)", color: "var(--text-primary)",
          fontSize: 14, fontFamily: "inherit", resize: "vertical",
        }}
      />
      <button
        type="submit"
        disabled={saving || !action.trim()}
        style={{ ...outlineBtnStyle, marginTop: 6, opacity: saving || !action.trim() ? 0.5 : 1 }}
      >
        {t("sc.followup.save")}
      </button>
    </form>
  );
}

export function StatusPill({ status }) {
  const { t } = useI18n();
  const style = STATUS_STYLE[status];
  return (
    <span style={{
      flexShrink: 0, fontSize: 11, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase",
      padding: "3px 8px", borderRadius: "var(--radius-pill)",
      color: style?.color || "var(--text-warning)", background: style?.bg || "var(--c-amber)",
    }}>
      {t(status ? `sc.status.${status}` : "sc.status.unanswered")}
    </span>
  );
}

export function PhotoStrip({ photos, token, onDelete }) {
  const { t } = useI18n();
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
      {photos.map((p) => {
        // A photo still on the phone (offline draft or waiting in the queue) is shown from its own
        // object URL — the server doesn't have it yet, so /uploads would 404.
        const src = p.previewUrl || uploadUrl(p.file_path, token);
        return (
        <div key={p.id} style={{ position: "relative", opacity: p.queued ? 0.75 : 1 }}>
          <a href={src} target="_blank" rel="noreferrer">
            <img
              src={src}
              alt=""
              style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)", display: "block" }}
            />
          </a>
          {/* A queued upload can't be taken back before the server has it. */}
          {onDelete && !p.queued && (
            <button
              onClick={() => onDelete(p)}
              title={t("sc.photo.delete")}
              aria-label={t("sc.photo.delete")}
              style={{
                position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11,
                border: "1px solid var(--border)", background: "var(--surface-1)", cursor: "pointer",
                fontSize: 13, lineHeight: "18px", color: "var(--text-secondary)", padding: 0,
              }}
            >
              ×
            </button>
          )}
        </div>
        );
      })}
    </div>
  );
}

const backBtnStyle = {
  display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none",
  color: "var(--brand-dark)", fontSize: 14, fontWeight: 500, cursor: "pointer", padding: "4px 0", marginBottom: 10,
};

export const outlineBtnStyle = {
  display: "inline-flex", alignItems: "center", gap: 6, background: "var(--surface-1)",
  border: "1px solid var(--border)", borderRadius: "var(--radius-pill)", padding: "7px 12px",
  fontSize: 13, fontWeight: 500, cursor: "pointer", color: "var(--text-primary)",
};
