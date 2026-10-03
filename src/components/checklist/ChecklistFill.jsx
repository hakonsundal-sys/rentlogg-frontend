import { useRef, useState } from "react";
import { ArrowLeft, Camera, Check, MessageSquare, AlertTriangle, Minus } from "lucide-react";
import { apiFetch } from "../../api";
import { Card } from "../shared";
import { useI18n } from "../../i18n";
import { PhotoStrip } from "./SubmissionDetail";

// Filling in one checklist. Every tap is saved to the server straight away (the draft lives in
// simple_checklist_submissions, not in this component), so a phone that throws the tab away mid-
// round loses nothing — reopening the list resumes the same draft.
//
// Three answers per item rather than a single tick: a non-cleaning checklist is usually a control
// ("is the fire exit clear?"), and "no, it wasn't" has to be recordable as such — with a reason —
// instead of being an unticked box nobody can tell apart from "forgot".
export default function ChecklistFill({ token, initial, onBack, onSubmitted }) {
  const { t, tn } = useI18n();
  const [detail, setDetail] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Which items have their optional comment field open. A deviation always shows it.
  const [openComments, setOpenComments] = useState(() => new Set(initial.answers.filter((a) => a.comment).map((a) => a.id)));
  const [note, setNote] = useState(initial.note || "");
  // Saves still in flight. A comment is saved on blur, and tapping "Send inn" is what blurs it — so
  // submit has to wait for that save, or the server sees the deviation without its reason.
  const pending = useRef(new Set());

  const answered = detail.answers.filter((a) => a.status).length;
  const total = detail.answers.length;
  const remaining = total - answered;
  const unexplained = detail.answers.filter((a) => a.status === "deviation" && !a.comment?.trim()).length;

  function replaceAnswer(updated) {
    setDetail((d) => ({ ...d, answers: d.answers.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)) }));
  }

  function saveAnswer(answer, patch) {
    const p = doSaveAnswer(answer, patch);
    pending.current.add(p);
    p.finally(() => pending.current.delete(p));
    return p;
  }

  async function doSaveAnswer(answer, patch) {
    setError("");
    const before = answer;
    replaceAnswer({ ...answer, ...patch }); // optimistic — a tap must feel instant on a slow line
    try {
      const saved = await apiFetch(`/simple-checklists/submissions/${detail.id}/answers/${answer.id}`, {
        token, method: "PATCH", body: JSON.stringify(patch),
      });
      replaceAnswer(saved);
    } catch (err) {
      replaceAnswer(before);
      setError(err.message);
    }
  }

  function setStatus(answer, status) {
    // Tapping the chosen answer again clears it — the only way to undo a mis-tap.
    const next = answer.status === status ? null : status;
    saveAnswer(answer, { status: next });
  }

  async function restOk() {
    setError("");
    setBusy(true);
    try {
      // The response replaces every answer, so a comment still being saved must land first.
      await Promise.allSettled([...pending.current]);
      setDetail(await apiFetch(`/simple-checklists/submissions/${detail.id}/answer-rest-ok`, { token, method: "POST" }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(file, answerId) {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      if (answerId) fd.append("answer_id", String(answerId));
      const photo = await apiFetch(`/simple-checklists/submissions/${detail.id}/photos`, { token, method: "POST", body: fd });
      setDetail((d) => ({ ...d, photos: [...d.photos, photo] }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deletePhoto(photo) {
    setError("");
    try {
      await apiFetch(`/simple-checklists/submissions/${detail.id}/photos/${photo.id}`, { token, method: "DELETE" });
      setDetail((d) => ({ ...d, photos: d.photos.filter((p) => p.id !== photo.id) }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveNote() {
    if ((detail.note || "") === note) return;
    try {
      await apiFetch(`/simple-checklists/submissions/${detail.id}`, { token, method: "PATCH", body: JSON.stringify({ note }) });
      setDetail((d) => ({ ...d, note }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function submit() {
    setError("");
    setBusy(true);
    try {
      await Promise.allSettled([...pending.current]);
      await saveNote();
      const done = await apiFetch(`/simple-checklists/submissions/${detail.id}/submit`, { token, method: "POST" });
      onSubmitted(done);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    if (!window.confirm(t("sc.discardConfirm"))) return;
    try {
      await apiFetch(`/simple-checklists/submissions/${detail.id}`, { token, method: "DELETE" });
      onBack();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <button onClick={onBack} style={backBtnStyle}>
        <ArrowLeft size={15} /> {t("sc.back")}
      </button>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{detail.checklist_name}</div>
        {detail.description && <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{detail.description}</div>}
        <ProgressBar answered={answered} total={total} label={t("sc.progress", { answered, total })} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {detail.answers.map((a, i) => (
          <AnswerCard
            key={a.id}
            index={i}
            answer={a}
            photos={detail.photos.filter((p) => p.answer_id === a.id)}
            token={token}
            commentOpen={openComments.has(a.id) || a.status === "deviation"}
            onOpenComment={() => setOpenComments((s) => new Set(s).add(a.id))}
            onStatus={(status) => setStatus(a, status)}
            onComment={(comment) => saveAnswer(a, { comment })}
            onPhoto={(file) => uploadPhoto(file, a.id)}
            onDeletePhoto={deletePhoto}
          />
        ))}
      </div>

      {remaining > 0 && (
        <button onClick={restOk} disabled={busy} style={{ ...secondaryBtnStyle, width: "100%", marginTop: 12 }}>
          <Check size={16} /> {t("sc.allRestOk")}
        </button>
      )}

      <Card style={{ marginTop: 14 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
          {t("sc.noteLabel")}
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          rows={2}
          style={textareaStyle}
        />
        <PhotoStrip photos={detail.photos.filter((p) => !p.answer_id)} token={token} onDelete={deletePhoto} />
        <PhotoButton label={t("sc.photo.general")} onFile={(f) => uploadPhoto(f, null)} disabled={busy} style={{ marginTop: 10 }} />
      </Card>

      {error && <div style={{ color: "var(--text-danger)", marginTop: 12, fontSize: 14 }}>{error}</div>}

      <div style={{ marginTop: 14, fontSize: 13, color: "var(--text-secondary)", textAlign: "center", minHeight: 18 }}>
        {remaining > 0
          ? tn("sc.remaining", remaining)
          : unexplained > 0
            ? t("error.deviation_comment_required")
            : ""}
      </div>
      <button
        onClick={submit}
        disabled={busy || remaining > 0 || unexplained > 0}
        style={{
          ...submitBtnStyle,
          opacity: busy || remaining > 0 || unexplained > 0 ? 0.5 : 1,
          cursor: busy || remaining > 0 || unexplained > 0 ? "default" : "pointer",
        }}
      >
        {busy ? t("sc.submitting") : t("sc.submit")}
      </button>
      <button onClick={discard} style={{ ...linkStyle, display: "block", margin: "14px auto 0" }}>
        {t("sc.discard")}
      </button>
    </div>
  );
}

function AnswerCard({ index, answer, photos, token, commentOpen, onOpenComment, onStatus, onComment, onPhoto, onDeletePhoto }) {
  const { t } = useI18n();
  const [comment, setComment] = useState(answer.comment || "");
  const isDeviation = answer.status === "deviation";

  return (
    <Card style={{
      padding: 14,
      borderColor: isDeviation ? "var(--border-danger)" : answer.status ? "var(--border)" : "var(--border)",
      background: isDeviation ? "var(--bg-danger)" : "var(--surface-1)",
    }}>
      <div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.35 }}>
        <span style={{ color: "var(--text-secondary)", marginRight: 6 }}>{index + 1}.</span>
        {answer.label}
      </div>
      {answer.help_text && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>{answer.help_text}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 10 }}>
        <ChoiceButton active={answer.status === "ok"} kind="ok" onClick={() => onStatus("ok")}>
          <Check size={15} /> {t("sc.status.ok")}
        </ChoiceButton>
        <ChoiceButton active={isDeviation} kind="deviation" onClick={() => onStatus("deviation")}>
          <AlertTriangle size={15} /> {t("sc.status.deviation")}
        </ChoiceButton>
        <ChoiceButton active={answer.status === "na"} kind="na" onClick={() => onStatus("na")}>
          <Minus size={15} /> {t("sc.status.na")}
        </ChoiceButton>
      </div>

      {commentOpen ? (
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onBlur={() => { if ((answer.comment || "") !== comment) onComment(comment); }}
          placeholder={isDeviation ? t("sc.deviationPlaceholder") : t("sc.commentPlaceholder")}
          rows={2}
          style={{ ...textareaStyle, marginTop: 10, borderColor: isDeviation && !comment.trim() ? "var(--text-danger)" : "var(--border)" }}
        />
      ) : null}

      <PhotoStrip photos={photos} token={token} onDelete={onDeletePhoto} />

      <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
        {!commentOpen && (
          <button onClick={onOpenComment} style={linkStyle}>
            <MessageSquare size={13} /> {t("sc.note")}
          </button>
        )}
        <PhotoButton label={t("sc.photo.add")} onFile={onPhoto} asLink />
      </div>
    </Card>
  );
}

function ChoiceButton({ active, kind, onClick, children }) {
  const palette = {
    ok: { color: "var(--text-success)", bg: "var(--text-success)" },
    deviation: { color: "var(--text-danger)", bg: "var(--text-danger)" },
    na: { color: "var(--text-secondary)", bg: "var(--text-secondary)" },
  }[kind];
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
        minHeight: 44, padding: "6px 4px", borderRadius: "var(--radius)", cursor: "pointer",
        fontSize: 13, fontWeight: 600, lineHeight: 1.15, textAlign: "center",
        border: `1.5px solid ${active ? palette.bg : "var(--border)"}`,
        background: active ? palette.bg : "var(--surface-1)",
        color: active ? "white" : palette.color,
      }}
    >
      {children}
    </button>
  );
}

function PhotoButton({ label, onFile, disabled, asLink, style }) {
  const input = useRef(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }}
      />
      <button
        onClick={() => input.current?.click()}
        disabled={disabled}
        style={asLink ? linkStyle : { ...secondaryBtnStyle, ...style }}
      >
        <Camera size={asLink ? 13 : 15} /> {label}
      </button>
    </>
  );
}

function ProgressBar({ answered, total, label }) {
  const pct = total ? Math.round((answered / total) * 100) : 0;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--brand)", transition: "width 0.2s" }} />
      </div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{label}</div>
    </div>
  );
}

const backBtnStyle = {
  display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none",
  color: "var(--brand-dark)", fontSize: 14, fontWeight: 500, cursor: "pointer", padding: "4px 0", marginBottom: 10,
};
const linkStyle = {
  display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", padding: 0,
  color: "var(--brand-dark)", fontSize: 13, fontWeight: 500, cursor: "pointer",
};
const secondaryBtnStyle = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--radius-pill)",
  padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "var(--text-primary)",
};
const submitBtnStyle = {
  width: "100%", background: "var(--brand)", color: "white", border: "none", borderRadius: "var(--radius-pill)",
  padding: "14px 16px", fontSize: 16, fontWeight: 700, marginTop: 6,
};
const textareaStyle = {
  width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: "var(--radius)",
  border: "1px solid var(--border)", background: "var(--surface-0)", color: "var(--text-primary)",
  fontSize: 14, fontFamily: "inherit", resize: "vertical",
};
