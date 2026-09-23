import { useEffect, useState } from "react";
import { BookOpen, ChevronLeft, FileText } from "lucide-react";
import { apiFetch } from "../api";
import { Card, uploadUrl } from "./shared";
import { useI18n, useT } from "../i18n";
import LessonPlayer, { SignCard } from "./LessonPlayer";

// The staff member's own view of her training: what she has been given, what she has done, and the
// signature that documents it. Fully translated, unlike the admin side — the people who use this
// are the same cleaners the rest of the translated surface was built for.

const STATUS_COLOR = {
  none: "var(--text-secondary)",
  in_progress: "var(--text-secondary)",
  done: "var(--text-success)",
  expiring: "var(--accent-orange-dark)",
  expired: "var(--text-danger)",
};

function day(value) {
  return value ? String(value).slice(0, 10) : "";
}

// Done and still valid — the one state with nothing left to do. Everything else (never taken,
// half-finished, expired, or signed on an older version of the course) is something she can open.
// Exported because CleanerView counts the same thing for the badge on the tab.
export function isSettled(row) {
  return (row.status === "done" || row.status === "expiring") && !row.outdated;
}

export default function TrainingView({ token, user, onChanged }) {
  const t = useT();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [openRow, setOpenRow] = useState(null);

  function load() {
    apiFetch("/training/me", { token })
      .then((data) => {
        setRows(data);
        // Hands the freshly loaded list straight back rather than making the caller fetch the same
        // thing again just to re-count the badge.
        onChanged?.(data);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(load, [token]);

  if (openRow) {
    return (
      <CourseView
        row={openRow}
        token={token}
        user={user}
        onBack={() => { setOpenRow(null); load(); }}
      />
    );
  }

  return (
    <div>
      {error && <div style={{ color: "var(--text-danger)", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {rows === null && <Card style={{ color: "var(--text-secondary)" }}>…</Card>}

      {rows?.length === 0 && (
        <Card style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>
          <BookOpen size={32} style={{ marginBottom: 10 }} />
          <div>{t("training.empty")}</div>
        </Card>
      )}

      {rows?.map((row) => (
        <Card key={row.course_id} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{row.title}</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
                {t(`training.kind.${row.kind}`)}
              </div>
              <div style={{ fontSize: 13, color: STATUS_COLOR[row.status], fontWeight: 600, marginTop: 6 }}>
                {t(`training.status.${row.status}`)}
                {row.outdated && ` · ${t("training.updated")}`}
              </div>
              {row.record?.completed_at && (
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                  {t("training.completedOn", { date: day(row.record.completed_at) })}
                  {row.record.expires_at ? ` · ${t("training.validUntil", { date: day(row.record.expires_at) })}` : ""}
                </div>
              )}
              {row.due_at && !row.record?.completed_at && (
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                  {t("training.due", { date: day(row.due_at) })}
                </div>
              )}
            </div>
            <button
              onClick={() => setOpenRow(row)}
              style={{
                background: isSettled(row) ? "none" : "var(--accent-orange)",
                color: isSettled(row) ? "var(--text-secondary)" : "white",
                border: isSettled(row) ? "1px solid var(--border)" : "none",
                padding: "8px 16px", borderRadius: "var(--radius)", fontSize: 14, cursor: "pointer",
                whiteSpace: "nowrap", flexShrink: 0,
              }}
            >
              {isSettled(row) ? t("training.show") : row.status === "in_progress" ? t("training.continue") : t("training.start")}
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}

// --- One course --------------------------------------------------------------------------------

function CourseView({ row, token, user, onBack }) {
  const { t, language } = useI18n();
  const [record, setRecord] = useState(row.record?.completed_at ? null : row.record);
  const [slides, setSlides] = useState(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const settled = isSettled(row);

  // Opening a settled course is just looking at the receipt, so nothing is started; anything else
  // opens (or resumes) an attempt right away, since that's what the button she pressed said.
  useEffect(() => {
    if (settled) return;
    setStarting(true);
    apiFetch(`/training/me/courses/${row.course_id}/start`, { token, method: "POST", body: JSON.stringify({ language }) })
      .then(setRecord)
      .catch((err) => setError(err.message))
      .finally(() => setStarting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.course_id, token]);

  useEffect(() => {
    if (row.kind !== "lesson") return;
    apiFetch(`/training/me/courses/${row.course_id}/slides?language=${language}`, { token })
      .then((data) => setSlides(data.slides))
      .catch(() => setSlides([]));
    // language is a dependency on purpose: switching language from the header mid-lesson should
    // swap the narration under the same slides, not leave her reading the one she just left.
  }, [row.course_id, row.kind, token, language]);

  const back = (
    <button
      onClick={onBack}
      style={{
        display: "flex", alignItems: "center", gap: 4, background: "none", border: "none",
        color: "var(--text-secondary)", fontSize: 14, cursor: "pointer", padding: 0, marginBottom: 12,
      }}
    >
      <ChevronLeft size={16} /> {t("training.back")}
    </button>
  );

  return (
    <div>
      {back}
      <Card>
        <div style={{ fontWeight: 600, fontSize: 16 }}>{row.title}</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{t(`training.kind.${row.kind}`)}</div>
        {row.description && <div style={{ fontSize: 14, marginTop: 10 }}>{row.description}</div>}

        {error && <div style={{ color: "var(--text-danger)", fontSize: 13, marginTop: 10 }}>{error}</div>}

        {row.files?.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>{t("training.documents")}</div>
            {row.files.map((f) => (
              <a
                key={f.id}
                href={uploadUrl(f.file_path, token)}
                target="_blank"
                rel="noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--accent-orange-dark)", padding: "4px 0" }}
              >
                <FileText size={14} /> {f.name}
              </a>
            ))}
          </div>
        )}

        {settled && row.record && (
          <div style={{ marginTop: 14, fontSize: 14 }}>
            <div style={{ color: "var(--text-success)", fontWeight: 600 }}>
              {t("training.signedOn", { date: day(row.record.signed_at || row.record.completed_at) })}
            </div>
            {row.record.signed_initials && (
              <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>{row.record.signed_initials}</div>
            )}
            {row.record.expires_at && (
              <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                {t("training.validUntil", { date: day(row.record.expires_at) })}
              </div>
            )}
          </div>
        )}

        {/* Training held away from the app is entered by whoever held it — there is nothing for her
            to do here but read what it says. */}
        {!settled && (row.kind === "classroom" || row.kind === "external") && (
          <div style={{ marginTop: 14, fontSize: 14, color: "var(--text-secondary)" }}>
            {t("training.registeredByManager")}
          </div>
        )}
      </Card>

      {!settled && row.kind === "lesson" && record && (
        slides === null ? null : slides.length === 0 ? (
          <Card style={{ marginTop: 10, color: "var(--text-secondary)", fontSize: 14 }}>{t("training.noContent")}</Card>
        ) : (
          <LessonPlayer
            slides={slides}
            record={record}
            token={token}
            user={user}
            onSigned={onBack}
          />
        )
      )}

      {!settled && row.kind === "document" && record && (
        <SignCard record={record} token={token} user={user} requiresSignature={row.requires_signature} onSigned={onBack} />
      )}

      {starting && <Card style={{ marginTop: 10, color: "var(--text-secondary)" }}>…</Card>}
    </div>
  );
}
